import { Request, Response } from 'express';
import { isbot } from 'isbot-fast';
import { fetchIPDetails, getClientIP } from '../utils/ip';
import { pb, withAuthRetry } from '../config';

// In-memory dedup store (resets on server restart — acceptable for analytics)
const recentRequests = new Set<string>();

export const trackVisitor = async (req: Request, res: Response): Promise<void> => {
    // ── Bot filtering ──
    const ua = req.headers['user-agent'] || '';
    if (isbot(ua)) {
        res.status(200).json({ success: true, skipped: 'bot' });
        return;
    }

    const { site_id, os, browser, device, referrer, pathname } = req.body;

    if (!site_id) {
        res.status(400).json({ error: 'site_id is required' });
        return;
    }

    try {
        const ip = getClientIP(req);
        if (!ip) {
            res.status(400).json({ error: 'Could not determine client IP' });
            return;
        }

        // ── Request deduplication (session window) ──
        // Use a simple in-memory Set with a 30-min TTL per IP+site combo
        const dedupKey = `${ip}:${site_id}:${pathname}`;
        if (recentRequests.has(dedupKey)) {
            res.status(200).json({ success: true, skipped: 'duplicate' });
            return;
        }

        const ipDetails = await fetchIPDetails(ip);
        if (!ipDetails) {
            res.status(502).json({ error: 'IP lookup failed' });
            return;
        }

        // Check if this IP has already been tracked for this site
        let record: any = null;
        try {
            record = await withAuthRetry(() => pb.collection('IP_Details').getFirstListItem(`ip='${ipDetails.ip}' && site_id='${site_id}'`));
        } catch (err: any) {
            // 404 means no record found, which is fine
            if (err.status !== 404) {
                console.error('[Database Lookup Error]', err);
            }
        }

        if (record) {
            // Returning visitor — bump the visit count
            console.log(`[Database] Updating record: ${record.id}`);
            await withAuthRetry(() => pb.collection('IP_Details').update(record.id, { 
                visit_count: (record.visit_count || 1) + 1 
            }));
        } else {
            // New visitor — create the record
            const data = {
                site_id,
                ip: ipDetails.ip,
                city: ipDetails.city,
                region: ipDetails.region,
                country: ipDetails.country,
                postal: ipDetails.postal,
                latitude: ipDetails.latitude,
                longitude: ipDetails.longitude,
                timezone: ipDetails.timezone,
                org: ipDetails.org,
                os,
                browser,
                device,
                referrer,
                pathname,
                visit_count: 1
            };

            console.log(`[Database] Creating new record for site: ${site_id}`);
            await withAuthRetry(() => pb.collection('IP_Details').create(data));
        }

        // Add to dedup queue after successful processing
        recentRequests.add(dedupKey);
        setTimeout(() => recentRequests.delete(dedupKey), 30 * 60 * 1000); // 30 min TTL

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Track Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
