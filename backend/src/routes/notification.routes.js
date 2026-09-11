import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as ctrl from '../controllers/notificationController.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.listMyNotifications);
router.get('/unread-count', ctrl.unreadCount);
router.post('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);

export default router;
