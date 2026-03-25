import { Request, Response } from "express";
import axios from "axios";
import { RecordModel } from "./models/record.model";
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
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Serve the tracker script publicly
app.use('/static', express.static(path.join(__dirname, 'public')));

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

async function getAllRecords(siteId?: string): Promise<any[]> {
    const filter = siteId ? `?filter=(site_id='${siteId}')` : '';
    const response = await fetch(
        `${process.env.DBURL}collections/IP_Details/records${filter}`,
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
                `${process.env.DBURL}collections/IP_Details/records/${record.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                    },
                    body: JSON.stringify({ visit_count: record.visit_count + 1 }),
                }
            );
        } else {
            // New visitor — create the record
            const newRecord = new RecordModel(
                randomUUID().toString().substring(0, 15),
                site_id,
                ipDetails.ip,
                ipDetails.city,
                ipDetails.region,
                ipDetails.country,
                ipDetails.postal,
                ipDetails.latitude,
                ipDetails.longitude,
                ipDetails.timezone,
                ipDetails.org,
                os,
                browser,
                device,
                referrer,
                pathname,
                1,
                Date.now() as unknown as string,
                Date.now() as unknown as string
            );

            await fetch(`${process.env.DBURL}collections/IP_Details/records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                },
                body: JSON.stringify(newRecord),
            });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Track Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── v1 RECORDS ENDPOINT ──────────────────────────────────────────────────────
/**
 * GET /v1/records?siteId=XXX
 * Returns raw records, optionally filtered by site.
 */
app.get('/v1/records', async (req: Request, res: Response) => {
    try {
        const siteId = req.query.siteId as string | undefined;
        const records = await getAllRecords(siteId);
        res.status(200).json(records);
    } catch (error) {
        console.error('[Records Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── v1 STATS ENDPOINT ────────────────────────────────────────────────────────
/**
 * GET /v1/stats?siteId=XXX
 * Returns aggregated analytics stats, optionally filtered by site.
 */
app.get('/v1/stats', async (req: Request, res: Response) => {
    try {
        const siteId = req.query.siteId as string | undefined;
        const data = await getAllRecords(siteId);

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
