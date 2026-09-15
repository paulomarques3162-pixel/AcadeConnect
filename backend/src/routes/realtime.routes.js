import { Router } from 'express';
import { authenticate, authenticateStreamToken } from '../middlewares/auth.js';
import { streamLimiter } from '../middlewares/rateLimiter.js';
import * as ctrl from '../controllers/realtimeController.js';

const router = Router();

// Authenticated: get a short-lived token for the SSE stream.
router.post('/token', authenticate, streamLimiter, ctrl.streamToken);

// SSE stream. Auth is via the short-lived ?token= (EventSource limitation).
router.get('/stream', streamLimiter, authenticateStreamToken, ctrl.stream);

export default router;
