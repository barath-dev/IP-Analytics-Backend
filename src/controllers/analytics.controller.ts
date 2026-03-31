import { Request, Response } from 'express';
import { getUserSites, getAllRecords } from '../services/db';
import { buildStats } from '../utils/stats';

export const getRecords = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const siteId = req.query.siteId as string | undefined;

        // Get allowed sites for this user
        const allowedSites = await getUserSites(user.id);
        const records = await getAllRecords(siteId, allowedSites);

        res.status(200).json(records);
    } catch (error) {
        console.error('[Records Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const siteId = req.query.siteId as string | undefined;

        const allowedSites = await getUserSites(user.id);
        const data = await getAllRecords(siteId, allowedSites);

        if (data.length === 0) {
            res.status(200).json({ message: 'No records found', ...buildStats([]) });
            return;
        }

        res.status(200).json(buildStats(data));
    } catch (error) {
        console.error('[Stats Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
