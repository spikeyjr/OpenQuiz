
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        res.status(500).json({ error: 'Database not configured' });
        return;
    }

    try {
        const sql = neon(databaseUrl);

        const rows = await sql`
            SELECT data
            FROM study_sets
            ORDER BY updated_at DESC
        `;

        res.status(200).json({
            success: true,
            decks: rows.map((row) => row.data)
        });

    } catch (error) {
        console.error('Failed to load decks:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve decks'
        });
    }
}
