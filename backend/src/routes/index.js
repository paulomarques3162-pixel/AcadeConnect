import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import eventRoutes from './event.routes.js';
import activityRoutes from './activity.routes.js';
import speakerRoutes from './speaker.routes.js';
import registrationRoutes from './registration.routes.js';
import attendanceRoutes from './attendance.routes.js';
import certificateRoutes from './certificate.routes.js';
import notificationRoutes from './notification.routes.js';
import adminRoutes from './admin.routes.js';
import pixRoutes from './pix.routes.js';
import paymentRoutes from './payments.routes.js';
import raffleRoutes from './raffle.routes.js';
import productRoutes from './products.routes.js';
import couponRoutes from './coupons.routes.js';
import orderRoutes from './orders.routes.js';
import conversationRoutes from './conversations.routes.js';
import realtimeRoutes from './realtime.routes.js';
import { authenticate } from '../middlewares/auth.js';
import * as bootstrapCtrl from '../controllers/bootstrapController.js';
import { metricsSnapshot } from '../utils/metrics.js';
import { env } from '../config/env.js';

const router = Router();

// Lightweight liveness probe. Intentionally does NOT hit the database, so it
// stays fast and never becomes a bottleneck under load.
router.get('/health', (_req, res) =>
  res.json({ success: true, message: 'AcadeConnect API online', data: { time: new Date().toISOString(), uptime: Math.round(process.uptime()) } })
);

// Aggregate session bootstrap (1 request instead of notifications + unread-count).
router.get('/bootstrap', authenticate, bootstrapCtrl.bootstrap);

/**
 * Aggregate metrics (V9.2). Protected by METRICS_TOKEN when configured;
 * otherwise available only outside production. Never exposes user data.
 */
router.get('/metrics', (req, res) => {
  const allowed = env.metricsToken
    ? req.headers['x-metrics-token'] === env.metricsToken
    : env.nodeEnv !== 'production';
  if (!allowed) return res.status(404).json({ success: false, message: 'Not found.' });
  return res.json({ success: true, message: 'Métricas.', data: metricsSnapshot() });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/activities', activityRoutes);
router.use('/speakers', speakerRoutes);
router.use('/registrations', registrationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/certificates', certificateRoutes);
router.use('/notifications', notificationRoutes);
router.use('/pix', pixRoutes);
router.use('/payments', paymentRoutes);
router.use('/raffles', raffleRoutes);
router.use('/products', productRoutes);
router.use('/coupons', couponRoutes);
router.use('/orders', orderRoutes);
router.use('/conversations', conversationRoutes);
router.use('/realtime', realtimeRoutes);
router.use('/admin', adminRoutes);

export default router;
