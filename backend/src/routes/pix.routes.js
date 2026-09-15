import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { pixSchemas } from '../validations/pixSchemas.js';
import * as ctrl from '../controllers/pixController.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/', ctrl.list);
router.post('/', validate(pixSchemas.create), ctrl.create);
router.put('/:id', validate(pixSchemas.update), ctrl.update);
router.delete('/:id', validate(pixSchemas.idParam), ctrl.remove);

export default router;
