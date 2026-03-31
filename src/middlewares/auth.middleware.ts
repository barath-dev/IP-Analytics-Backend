import { Request, Response, NextFunction } from 'express';
import PocketBase from 'pocketbase';
import { BASE_URL } from '../config';

/**
 * Validates the PocketBase JWT from the Authorization header.
 * Attaches the decoded user info to req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        return;
    }

    const token = authHeader.split(' ')[1];
    try {
        // Create a temporary client to verify the user token without affecting the main client
        const authClient = new PocketBase(BASE_URL);
        authClient.authStore.save(token, null);

        if (!authClient.authStore.isValid) {
            res.status(401).json({ error: 'Unauthorized: Invalid session' });
            return;
        }

        // Verify and refresh the token to confirm it's still active in the DB
        const authData = await authClient.collection('users').authRefresh();
        
        (req as any).user = authData.record;
        next();
    } catch (err) {
        console.error('[Auth Error]', err);
        res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
        return;
    }
}
