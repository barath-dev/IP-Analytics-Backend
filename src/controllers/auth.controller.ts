import { Request, Response } from 'express';
import { pb, withAuthRetry } from '../config';

export const signup = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = await pb.collection('users').create(req.body);
        res.status(201).json(data);
    } catch (err: any) {
        res.status(err.status || 500).json(err.data || { error: 'Auth service down' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { identity, password } = req.body;
        const authData = await pb.collection('users').authWithPassword(identity, password);
        // authData contains { token, record }
        res.status(200).json(authData);
    } catch (err: any) {
        res.status(err.status || 500).json(err.data || { error: 'Auth service down' });
    }
};

export const createProject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { site_id } = req.body;
        const user = (req as any).user;

        if (!site_id) {
            res.status(400).json({ error: 'site_id required' });
            return;
        }

        const data = await withAuthRetry(() => pb.collection('Projects').create({
            user_id: user.id,
            site_id
        }));

        res.status(201).json(data);
    } catch (err: any) {
        console.error('[PocketBase Error]', JSON.stringify(err.data, null, 2));
        res.status(err.status || 500).json(err.data || { error: 'Internal server error' });
    }
};
