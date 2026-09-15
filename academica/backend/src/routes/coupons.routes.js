import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { couponSchemas } from '../validations/couponSchemas.js';
import * as ctrl from '../controllers/couponController.js';

const router = Router();
router.use(authenticate);

// Área do participante
router.get('/public', ctrl.publicList);
router.post('/validate', validate(couponSchemas.validate), ctrl.validate);

// Admin / Organizer
router.get('/', authorize('ADMIN', 'ORGANIZER'), ctrl.list);
router.post('/', authorize('ADMIN', 'ORGANIZER'), validate(couponSchemas.create), ctrl.create);
router.get('/:id', authorize('ADMIN', 'ORGANIZER'), validate(couponSchemas.idParam), ctrl.getOne);
router.put('/:id', authorize('ADMIN', 'ORGANIZER'), validate(couponSchemas.update), ctrl.update);
router.delete('/:id', authorize('ADMIN', 'ORGANIZER'), validate(couponSchemas.idParam), ctrl.remove);

export default router;
