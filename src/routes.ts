import { Router, Request, Response } from 'express';
import { trackVisitor } from './controllers/track.controller';
import { getRecords, getStats } from './controllers/analytics.controller';
import { signup, login, createProject } from './controllers/auth.controller';
import { requireAuth } from './middlewares/auth.middleware';

const router = Router();

// ─── TRACKING ───
router.post('/track', trackVisitor);

// ─── AUTH ───
router.post('/auth/signup', signup);
router.post('/auth/login', login);

// ─── PROJECTS ───
router.post('/projects', requireAuth, createProject);

// ─── ANALYTICS ───
router.get('/records', requireAuth, getRecords);
router.get('/stats', requireAuth, getStats);

export default router;
