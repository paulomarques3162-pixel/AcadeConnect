import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { paymentSchemas } from '../validations/paymentSchemas.js';
import * as ctrl from '../controllers/paymentController.js';

const router = Router();
router.use(authenticate);

router.get('/mine', ctrl.mine);
router.get('/admin/list', authorize('ADMIN', 'ORGANIZER'), ctrl.adminList);
router.get('/:id', validate(paymentSchemas.idParam), ctrl.getOne);
router.post('/:id/confirm', authorize('ADMIN', 'ORGANIZER'), validate(paymentSchemas.confirm), ctrl.confirm);
router.post('/:id/status', authorize('ADMIN', 'ORGANIZER'), validate(paymentSchemas.status), ctrl.setStatus);

export default router;
