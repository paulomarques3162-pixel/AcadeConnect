import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { orderSchemas } from '../validations/orderSchemas.js';
import * as ctrl from '../controllers/orderController.js';

const router = Router();
router.use(authenticate);

router.get('/mine', ctrl.mine);
router.get('/admin/list', authorize('ADMIN', 'ORGANIZER'), ctrl.adminList);
router.post('/', validate(orderSchemas.create), ctrl.create);
router.get('/:id', validate(orderSchemas.idParam), ctrl.getOne);
router.post('/:id/pay', validate(orderSchemas.idParam), ctrl.pay);
router.post('/:id/cancel', validate(orderSchemas.idParam), ctrl.cancel);
router.get('/:id/receipt', validate(orderSchemas.idParam), ctrl.receipt);
router.post('/:id/status', authorize('ADMIN', 'ORGANIZER'), validate(orderSchemas.status), ctrl.setStatus);

export default router;
