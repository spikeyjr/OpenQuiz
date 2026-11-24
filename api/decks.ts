
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    try {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            res.status(500).json({ error: 'Database not configured' });
            return;
        }

        const sql = neon(databaseUrl);

        // Retrieve all decks
        if (req.method === 'GET') {
            const rows = await sql`
                SELECT data
                FROM study_sets
                ORDER BY updated_at DESC
            `;

            res.status(200).json({
                success: true,
                decks: rows.map(row => row.data)
            });
            return;
        }

        // Create or update a deck
        if (req.method === 'POST') {
            const deck = typeof req.body === 'string'
                ? JSON.parse(req.body)
                : req.body;

            if (
                !deck ||
                typeof deck.id !== 'string' ||
                !deck.id ||
                typeof deck.title !== 'string' ||
                !Array.isArray(deck.terms) ||
                !Number.isSafeInteger(deck.createdAt) ||
                !deck.terms.every((term: any) =>
                    term &&
                    typeof term.id === 'string' &&
                    typeof term.term === 'string' &&
                    typeof term.definition === 'string'
                )
            ) {
                res.status(400).json({ error: 'Invalid deck data' });
                return;
            }

            const updatedAt = Date.now();
            const savedDeck = { ...deck, updatedAt };
            const json = JSON.stringify(savedDeck);

            await sql`
                INSERT INTO study_sets (
                    id, title, data, created_at, updated_at
                )
                VALUES (
                    ${savedDeck.id},
                    ${savedDeck.title},
                    ${json}::jsonb,
                    ${savedDeck.createdAt},
                    ${updatedAt}
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    data = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at
            `;

            res.status(200).json({
                success: true,
                deck: savedDeck
            });
            return;
        }

        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Deck API error:', error);
        res.status(500).json({ error: 'Database operation failed' });
    }
}
