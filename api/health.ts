
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {

    try {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            res.status(500).json({
                status: 'error',
                message: 'DATABASE_URL is missing'
            });
            return;
        }

        const sql = neon(databaseUrl);

        const result = await sql`
            SELECT 1 AS connected
        `;

        res.status(200).json({
            status: 'success',
            database: 'Neon PostgreSQL',
            connected: result[0].connected === 1
        });

    } catch (error) {
        console.error('Neon error:', error);

        res.status(500).json({
            status: 'error',
            message: 'Neon connection failed'
        });
    }
}
