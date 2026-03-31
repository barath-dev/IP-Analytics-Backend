import express, { Request, Response } from 'express';
import * as http from 'http';
import cors from 'cors';
import * as bodyParser from 'body-parser';
import * as path from 'path';
import axios from 'axios';
import router from './routes';
import { trackVisitor } from './controllers/track.controller'; // Make sure track works natively if called at root too sometimes, though we'll mount things properly under v1.

import './config'; // Ensures env and admin auth are initialized

const app = express();
const server = http.createServer(app);

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// Serve the tracker script publicly
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// Mount routes
app.use('/v1', router);

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
