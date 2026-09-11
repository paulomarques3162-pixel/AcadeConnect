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

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, message: 'AcadeConnect API online', data: { time: new Date().toISOString() } })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/activities', activityRoutes);
router.use('/speakers', speakerRoutes);
router.use('/registrations', registrationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/certificates', certificateRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;
