
import { neon } from '@neondatabase/serverless';

export default async function handler() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return Response.json(
            { status: 'error', message: 'DATABASE_URL is missing' },
            { status: 500 }
        );
    }

    try {
        const sql = neon(databaseUrl);

        // Simple read-only query to verify Neon works
        const result = await sql`SELECT 1 AS connected`;

        return Response.json({
            status: 'success',
            database: 'connected',
            result: result[0]
        });
    } catch (error) {
        console.error('Database connection failed:', error);

        return Response.json(
            { status: 'error', message: 'Database connection failed' },
            { status: 500 }
        );
    }
}
