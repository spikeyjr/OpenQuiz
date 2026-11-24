
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    console.log('Health endpoint executed');

    return res.status(200).json({
        status: 'success',
        message: 'Vercel API is working!'
    });
}
