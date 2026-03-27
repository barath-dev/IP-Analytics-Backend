import { Request, Response } from "express";
import axios from "axios";
import { randomUUID } from "crypto";
import * as http from 'http';
import express from 'express';
import cors from 'cors';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const app = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow all origins for tracking requests; dashboard endpoints are public reads.
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// Serve the tracker script publicly
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const DBURL = process.env.DBURL || 'http://127.0.0.1:8090/api/';

/**
 * Validates the PocketBase JWT from the Authorization header.
 * Attaches the decoded user info to req.user.
 */
async function requireAuth(req: Request, res: Response, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        // PocketBase doesn't have a public "verify token" endpoint without the admin SDK,
        // so we verify by trying to fetch the user profile using this token.
        const verifyRes = await fetch(`${DBURL}collections/users/auth-refresh`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!verifyRes.ok) {
            return res.status(401).json({ error: 'Unauthorized: Invalid session' });
        }

        const data = await verifyRes.json();
        (req as any).user = data.record; // Attach user record (id, email, etc.)
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Auth service unavailable' });
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function fetchIPDetails(ip: string): Promise<any> {
    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        return response.data;
    } catch (error) {
        console.error('[IP Lookup Error]', error);
        return null;
    }
}

function getClientIP(req: Request): string | null {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!ip) return null;
    return (ip as string).split(',')[0].trim();
}

async function getUserSites(userId: string): Promise<string[]> {
    try {
        // We'll store site ownership in a 'Projects' collection: { user_id, site_id }
        const response = await fetch(
            `${DBURL}collections/Projects/records?filter=(user_id='${userId}')`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                },
            }
        );
        const data = await response.json();
        return (data.items ?? []).map((p: any) => p.site_id);
    } catch {
        return [];
    }
}

async function getAllRecords(siteId?: string, allowedSites?: string[]): Promise<any[]> {
    let filterParts = [];
    if (siteId) filterParts.push(`site_id='${siteId}'`);
    if (allowedSites) {
        // Only allow records belonging to the user's sites
        const siteFilter = allowedSites.map(s => `site_id='${s}'`).join('||');
        if (siteFilter) filterParts.push(`(${siteFilter})`);
        else return []; // User has no sites
    }

    const filterQuery = filterParts.length > 0 ? `?filter=(${filterParts.join('&&')})` : '';
    const response = await fetch(
        `${DBURL}collections/IP_Details/records${filterQuery}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
            },
        }
    );
    const data = await response.json();
    return data.items ?? [];
}

function buildStats(data: any[]) {
    const reduce = (key: string, fallback = key) =>
        data.reduce((acc: any, item: any) => {
            const val = item[key] || fallback;
            acc[val] = (acc[val] ?? 0) + (key === 'country' ? item.visit_count : 1);
            return acc;
        }, {});

    const countryStats  = reduce('country');
    const orgStats      = reduce('org');
    const browserStats  = reduce('browser');
    const osStats       = reduce('os');
    const deviceStats   = reduce('device');
    const referrerStats = data.reduce((acc: any, item: any) => {
        const ref = item.referrer || 'Direct';
        acc[ref] = (acc[ref] ?? 0) + 1;
        return acc;
    }, {});
    const pageStats = data.reduce((acc: any, item: any) => {
        const path = item.pathname || '/';
        acc[path] = (acc[path] ?? 0) + 1;
        return acc;
    }, {});

    return {
        overallStats: {
            totalVisitors: data.length,
            totalVisits: data.reduce((s: number, r: any) => s + (r.visit_count ?? 1), 0),
            totalCountries: Object.keys(countryStats).length,
            totalOrgs: Object.keys(orgStats).length,
        },
        countryStats,
        orgStats,
        browserStats,
        osStats,
        deviceStats,
        referrerStats,
        pageStats,
    };
}

// ─── v1 TRACKING ENDPOINT ─────────────────────────────────────────────────────
/**
 * POST /v1/track
 * Body: { site_id, os, browser, device, referrer, pathname }
 */
app.post('/v1/track', async (req: Request, res: Response) => {
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

        const ipDetails = await fetchIPDetails(ip);
        if (!ipDetails) {
            res.status(502).json({ error: 'IP lookup failed' });
            return;
        }

        // Check if this IP has already been tracked for this site
        const filter = `?filter=(ip='${ipDetails.ip}'%26%26site_id='${site_id}')`;
        const checkResponse = await fetch(
            `${process.env.DBURL}collections/IP_Details/records${filter}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                },
            }
        );
        const existing = await checkResponse.json();
        const record = existing.items?.[0];

        if (record) {
            // Returning visitor — bump the visit count
            await fetch(
                `${DBURL}collections/IP_Details/records/${record.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                    },
                    body: JSON.stringify({ visit_count: (record.visit_count || 1) + 1 }),
                }
            );
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

            await fetch(`${DBURL}collections/IP_Details/records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                },
                body: JSON.stringify(data),
            });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Track Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ─── AUTH ENDPOINTS (PROXIES) ────────────────────────────────────────────────
/**
 * POST /v1/auth/signup
 * Body: { email, password, passwordConfirm }
 */
app.post('/v1/auth/signup', async (req: Request, res: Response) => {
    try {
        const response = await fetch(`${DBURL}collections/users/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Auth service down' });
    }
});

/**
 * POST /v1/auth/login
 * Body: { identity, password }
 */
app.post('/v1/auth/login', async (req: Request, res: Response) => {
    try {
        const response = await fetch(`${DBURL}collections/users/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        // data contains { token, record }
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Auth service down' });
    }
});

/**
 * POST /v1/projects
 * Body: { site_id }
 * Registers a new site/project for the authenticated user.
 */
app.post('/v1/projects', requireAuth, async (req: Request, res: Response) => {
    try {
        const { site_id } = req.body;
        const user = (req as any).user;

        if (!site_id) return res.status(400).json({ error: 'site_id required' });

        const response = await fetch(`${DBURL}collections/Projects/records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`
            },
            body: JSON.stringify({ user_id: user.id, site_id })
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('[PocketBase Error]', JSON.stringify(data, null, 2));
            return res.status(response.status).json(data);
        }
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── v1 RECORDS ENDPOINT (PROTECTED) ─────────────────────────────────────────
app.get('/v1/records', requireAuth, async (req: Request, res: Response) => {
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
});

// ─── v1 STATS ENDPOINT (PROTECTED) ───────────────────────────────────────────
app.get('/v1/stats', requireAuth, async (req: Request, res: Response) => {
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
});

// ─── LEGACY ENDPOINTS (backwards compat) ─────────────────────────────────────
app.get('/records', async (req: Request, res: Response) => {
    try {
        const records = await getAllRecords();
        res.status(200).json(records);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/stats', async (req: Request, res: Response) => {
    try {
        const data = await getAllRecords();
        res.status(200).json(buildStats(data));
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', version: '2.0.0' });
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Analytics service running on http://localhost:${PORT}`);
});

// Keep-alive ping (for free hosting tiers)
const SELF_URL = process.env.SELF_URL || 'https://ip-analytics-backend.onrender.com';
setInterval(async () => {
    try {
        await axios.get(`${SELF_URL}/health`);
        console.log('[Ping] Server alive');
    } catch {
        console.warn('[Ping] Failed');
    }
}, 60000);
