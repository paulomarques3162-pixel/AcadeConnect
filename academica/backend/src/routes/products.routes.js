import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import { productSchemas } from '../validations/productSchemas.js';
import * as ctrl from '../controllers/productController.js';

const router = Router();

// Loja (público)
router.get('/', ctrl.listPublic);
router.get('/admin/list', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.listAdmin);
router.get('/:id', ctrl.getOne);

// Admin / Organizer
router.post('/', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), validate(productSchemas.create), ctrl.create);
router.put('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), validate(productSchemas.update), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), validate(productSchemas.idParam), ctrl.remove);

export default router;
