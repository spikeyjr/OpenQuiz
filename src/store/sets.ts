
import { db } from '../lib/db'
import { newId } from '../lib/id'
import { requestPersistentStorage } from '../lib/storage'
import { scheduleBackup } from '../lib/folderBackup'
import type { Folder, SetId, StudySet, Term, TermId } from '../lib/types'

// ********************************** blankTerm() **********************************

export function blankTerm(): Term {
  return { id: newId(), term: '', definition: '', starred: false }
}

// ********************************** blankSet() **********************************

export function blankSet(): StudySet {
  const now = Date.now()

  return {
    id: newId(),
    title: '',
    description: '',
    terms: [blankTerm(), blankTerm(), blankTerm(), blankTerm()],
    termLang: 'en-US',
    defLang: 'en-US',
    createdAt: now,
    updatedAt: now,
  }
}

// ********************************** cloudSaveSet() **********************************

async function cloudSaveSet(set: StudySet): Promise<StudySet> {
  const response = await fetch('/api/decks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(set),
  })

  if (!response.ok) {
    throw new Error(`Cloud save failed: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success || !result.deck) {
    throw new Error('Invalid cloud save response')
  }

  return result.deck as StudySet
}

// ********************************** listSets() **********************************

export async function listSets(): Promise<StudySet[]> {
  const localSets = await db.sets.toArray()

  try {
    // Retrieve decks saved in Neon
    const response = await fetch('/api/decks')

    if (!response.ok) {
      throw new Error(`Cloud load failed: ${response.status}`)
    }

    const data = await response.json()

    if (!data.success || !Array.isArray(data.decks)) {
      throw new Error('Invalid cloud response')
    }

    const cloudSets = data.decks as StudySet[]

    // Merge local and cloud decks by ID
    const merged = new Map<string, StudySet>()
    const cloudIds = new Set<string>()

    for (const set of localSets) {
      merged.set(set.id, set)
    }

    for (const set of cloudSets) {
      cloudIds.add(set.id)

      const local = merged.get(set.id)

      if (!local || set.updatedAt > local.updatedAt) {
        merged.set(set.id, set)

        // Cache the cloud deck locally
        await db.sets.put(set)
      }
    }

    // Upload local-only decks to Neon
    for (const set of localSets) {
      if (cloudIds.has(set.id)) {
        continue
      }

      try {
        const saved = await cloudSaveSet(set)
        await db.sets.put(saved)
        merged.set(saved.id, saved)
      } catch (error) {
        console.warn('Could not upload local deck:', error)
      }
    }

    return [...merged.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    )

  } catch (error) {
    console.warn('Cloud unavailable; using local decks', error)

    return localSets.sort(
      (a, b) => b.updatedAt - a.updatedAt
    )
  }
}

// ********************************** getSet() **********************************

export async function getSet(
  id: SetId
): Promise<StudySet | undefined> {

  const local = await db.sets.get(id)

  if (local) {
    return local
  }

  // Download decks when one isn't saved locally
  const sets = await listSets()

  return sets.find(set => set.id === id)
}

// ********************************** saveSet() **********************************

export async function saveSet(set: StudySet): Promise<StudySet> {
  const clean: StudySet = {
    ...set,
    title: set.title.trim() || 'Untitled set',
    terms: set.terms.filter(
      t => t.term.trim() || t.definition.trim()
    ),
    updatedAt: Date.now(),
  }

  // Always save locally first
  await db.sets.put(clean)

  void requestPersistentStorage()
  scheduleBackup()

  // Save the same deck to Neon
  try {
    const saved = await cloudSaveSet(clean)

    await db.sets.put(saved)

    console.log('Deck saved to Neon:', saved.id)

    return saved

  } catch (error) {
    console.warn(
      'Deck saved locally, but cloud sync failed:',
      error
    )

    return clean
  }
}

// ********************************** deleteSet() **********************************

export async function deleteSet(id: SetId): Promise<void> {
  await db.transaction(
    'rw',
    db.sets,
    db.progress,
    db.modeStats,
    async () => {
      await db.sets.delete(id)

      await db.progress
        .where('setId')
        .equals(id)
        .delete()

      await db.modeStats
        .where('setId')
        .equals(id)
        .delete()
    }
  )

  scheduleBackup()
}

// ********************************** duplicateSet() **********************************

export async function duplicateSet(
  id: SetId
): Promise<StudySet | undefined> {

  const original = await getSet(id)

  if (!original) {
    return undefined
  }

  const now = Date.now()

  const copy: StudySet = {
    ...original,
    id: newId(),
    title: `${original.title} (copy)`,
    terms: original.terms.map(
      t => ({ ...t, id: newId() })
    ),
    createdAt: now,
    updatedAt: now,
  }

  return saveSet(copy)
}

// ********************************** toggleStar() **********************************

export async function toggleStar(
  setId: SetId,
  termId: TermId
): Promise<void> {

  const set = await getSet(setId)

  if (!set) {
    return
  }

  const terms = set.terms.map(
    t => (
      t.id === termId
        ? { ...t, starred: !t.starred }
        : t
    )
  )

  await saveSet({
    ...set,
    terms,
    updatedAt: Date.now(),
  })
}

// ********************************** listFolders() **********************************

export async function listFolders(): Promise<Folder[]> {
  const folders = await db.folders.toArray()

  return folders.sort(
    (a, b) => a.name.localeCompare(b.name)
  )
}

// ********************************** createFolder() **********************************

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = {
    id: newId(),
    name: name.trim() || 'New folder',
    createdAt: Date.now(),
  }

  await db.folders.put(folder)

  return folder
}

// ********************************** renameFolder() **********************************

export async function renameFolder(
  id: string,
  name: string
): Promise<void> {

  await db.folders.update(id, {
    name: name.trim() || 'New folder',
  })
}

// ********************************** deleteFolder() **********************************

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.folders,
    db.sets,
    async () => {
      await db.folders.delete(id)

      const owned = await db.sets
        .where('folderId')
        .equals(id)
        .toArray()

      await Promise.all(
        owned.map(
          s => db.sets.put({
            ...s,
            folderId: undefined,
          })
        )
      )
    }
  )
}

// ********************************** moveSetToFolder() **********************************

export async function moveSetToFolder(
  setId: SetId,
  folderId?: string
): Promise<void> {

  const set = await getSet(setId)

  if (!set) {
    return
  }

  await saveSet({
    ...set,
    folderId,
  })
}
