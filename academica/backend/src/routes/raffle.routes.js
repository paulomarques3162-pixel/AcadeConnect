import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { raffleSchemas } from '../validations/raffleSchemas.js';
import * as ctrl from '../controllers/raffleController.js';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'ORGANIZER'));

router.get('/', ctrl.list);
router.post('/', validate(raffleSchemas.create), ctrl.create);
router.get('/:id', validate(raffleSchemas.idParam), ctrl.getOne);
router.get('/:id/eligible', validate(raffleSchemas.idParam), ctrl.eligible);
router.post('/:id/draw', validate(raffleSchemas.idParam), ctrl.draw);
router.post('/:id/status', validate(raffleSchemas.status), ctrl.setStatus);

export default router;
