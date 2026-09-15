import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { conversationSchemas } from '../validations/conversationSchemas.js';
import * as ctrl from '../controllers/conversationController.js';

const router = Router();
router.use(authenticate);

router.get('/admins', ctrl.admins);
router.get('/mine', ctrl.mine);
router.get('/unread-count', ctrl.unreadCount);
router.get('/admin/list', authorize('ADMIN', 'ORGANIZER'), ctrl.adminList);
router.post('/admin/start', authorize('ADMIN', 'ORGANIZER'), validate(conversationSchemas.adminStart), ctrl.adminStart);
router.post('/', validate(conversationSchemas.start), ctrl.start);
router.get('/:id', validate(conversationSchemas.idParam), ctrl.getOne);
router.post('/:id/messages', validate(conversationSchemas.message), ctrl.send);
router.post('/:id/read', validate(conversationSchemas.idParam), ctrl.markRead);
router.post('/:id/status', authorize('ADMIN', 'ORGANIZER'), validate(conversationSchemas.status), ctrl.setStatus);

export default router;
