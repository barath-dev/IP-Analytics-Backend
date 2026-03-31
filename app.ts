import { Request, Response } from "express";
import axios from "axios";
import { randomUUID } from "crypto";
import * as http from 'http';
import express from 'express';
import cors from 'cors';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import * as path from 'path';
import PocketBase from 'pocketbase';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow all origins for tracking requests; dashboard endpoints are public reads.
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// Serve the tracker script publicly
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// ─── POCKETBASE CLIENT ───────────────────────────────────────────────────────
const rawDbUrl = process.env.DBURL || 'http://127.0.0.1:8090';
const DBURL = rawDbUrl.endsWith('/api/') ? rawDbUrl : `${rawDbUrl.replace(/\/$/, '')}/api/`;
const BASE_URL = rawDbUrl.replace(/\/api\/$/, '');

const pb = new PocketBase(BASE_URL);

// Programmatically login as admin so we don't need a hardcoded JWT
export async function initAdminAuth() {
    if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
        try {
            // PocketBase SDK >= 0.23 maps pb.admins to _superusers.
            // If the server is <= 0.22, this fails. We can use a direct axios call for older versions.
            try {
                await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
            } catch (e: any) {
                if (e.status === 404) {
                    // Fall back to legacy admin auth for PocketBase <= 0.22 servers
                    const res = await axios.post(`${BASE_URL}/api/admins/auth-with-password`, {
                        identity: process.env.PB_ADMIN_EMAIL,
                        password: process.env.PB_ADMIN_PASSWORD
                    });
                    pb.authStore.save(res.data.token, res.data.admin);
                } else {
                    throw e;
                }
            }
            console.log('[Auth] Successfully authenticated PocketBase admin client');
        } catch (error) {
            console.error('[Auth] Failed to authenticate admin client:', error);
        }
    } else if (process.env.POCKETBASE_TOKEN) {
        pb.authStore.save(process.env.POCKETBASE_TOKEN, null);
    }
}
initAdminAuth();

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
        // Create a temporary client to verify the user token without affecting the main client
        const authClient = new PocketBase(BASE_URL);
        authClient.authStore.save(token, null);

        if (!authClient.authStore.isValid) {
            return res.status(401).json({ error: 'Unauthorized: Invalid session' });
        }

        // Verify and refresh the token to confirm it's still active in the DB
        const authData = await authClient.collection('users').authRefresh();
        
        (req as any).user = authData.record;
        next();
    } catch (err) {
        console.error('[Auth Error]', err);
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
}

async function fetchIPDetails(ip: string): Promise<any> {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,org,query`);
        const data = response.data;
        if (data.status !== 'success') {
            console.error('[IP Lookup Failed]', data.message);
            return null;
        }
        return {
            ip: data.query,
            city: data.city,
            region: data.regionName,
            country: data.country,
            postal: data.zip,
            latitude: data.lat,
            longitude: data.lon,
            timezone: data.timezone,
            org: data.org
        };
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
        const records = await pb.collection('Projects').getFullList({
            filter: `user_id = "${userId}"`,
        });
        const sites = records.map((p: any) => p.site_id);
        console.log(`[getUserSites] User ID: ${userId}, Allowed:`, sites);
        return sites;
    } catch (err) {
        console.error('[getUserSites Error]', err);
        return [];
    }
}

async function getAllRecords(siteId?: string, allowedSites?: string[]): Promise<any[]> {
    if (!pb.authStore.isValid) {
        console.log('[Auth] pb.authStore invalid, re-authenticating...');
        await initAdminAuth();
    }

    let filterParts = [];
    if (siteId) filterParts.push(`site_id="${siteId}"`);
    if (allowedSites) {
        if (allowedSites.length === 0) return []; // User has no sites registered
        const siteFilter = allowedSites.map(s => `site_id="${s}"`).join(' || ');
        filterParts.push(`(${siteFilter})`);
    }

    const filter = filterParts.length > 0 ? filterParts.join(' && ') : '';
    try {
        return await pb.collection('IP_Details').getFullList({ filter });
    } catch (err) {
        console.error('[getAllRecords Error]', err);
        return [];
    }
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
        let record: any = null;
        try {
            record = await pb.collection('IP_Details').getFirstListItem(`ip='${ipDetails.ip}' && site_id='${site_id}'`);
        } catch (err: any) {
            // 404 means no record found, which is fine
            if (err.status !== 404) {
                console.error('[Database Lookup Error]', err);
            }
        }

        if (record) {
            // Returning visitor — bump the visit count
            console.log(`[Database] Updating record: ${record.id}`);
            await pb.collection('IP_Details').update(record.id, { 
                visit_count: (record.visit_count || 1) + 1 
            });
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
            await pb.collection('IP_Details').create(data);
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
        const data = await pb.collection('users').create(req.body);
        res.status(201).json(data);
    } catch (err: any) {
        res.status(err.status || 500).json(err.data || { error: 'Auth service down' });
    }
});

/**
 * POST /v1/auth/login
 * Body: { identity, password }
 */
app.post('/v1/auth/login', async (req: Request, res: Response) => {
    try {
        const { identity, password } = req.body;
        const authData = await pb.collection('users').authWithPassword(identity, password);
        // authData contains { token, record }
        res.status(200).json(authData);
    } catch (err: any) {
        res.status(err.status || 500).json(err.data || { error: 'Auth service down' });
    }
});

app.post('/v1/projects', requireAuth, async (req: Request, res: Response) => {
    try {
        const { site_id } = req.body;
        const user = (req as any).user;

        if (!site_id) return res.status(400).json({ error: 'site_id required' });

        const data = await pb.collection('Projects').create({
            user_id: user.id,
            site_id
        });

        res.status(201).json(data);
    } catch (err: any) {
        console.error('[PocketBase Error]', JSON.stringify(err.data, null, 2));
        res.status(err.status || 500).json(err.data || { error: 'Internal server error' });
    }
});

// ─── v1 RECORDS ENDPOINT (PROTECTED) ─────────────────────────────────────────
app.get('/v1/records', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const siteId = req.query.siteId as string | undefined;

        // Get allowed sites for this user
        const allowedSites = await getUserSites(user.id);
        console.log("allowedSites", allowedSites);
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
