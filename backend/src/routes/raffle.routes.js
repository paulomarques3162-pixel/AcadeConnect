import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { raffleSchemas } from '../validations/raffleSchemas.js';
import * as ctrl from '../controllers/raffleController.js';

const router = Router();
router.use(authenticate);

// Resultado público (qualquer usuário autenticado) — sem controles administrativos.
router.get('/results', ctrl.results);

// Admin / Organizer
router.get('/', authorize('ADMIN', 'ORGANIZER'), ctrl.list);
router.post('/', authorize('ADMIN', 'ORGANIZER'), validate(raffleSchemas.create), ctrl.create);
router.get('/:id', authorize('ADMIN', 'ORGANIZER'), validate(raffleSchemas.idParam), ctrl.getOne);
router.get('/:id/eligible', authorize('ADMIN', 'ORGANIZER'), validate(raffleSchemas.idParam), ctrl.eligible);
router.post('/:id/draw', authorize('ADMIN', 'ORGANIZER'), validate(raffleSchemas.idParam), ctrl.draw);
router.post('/:id/status', authorize('ADMIN', 'ORGANIZER'), validate(raffleSchemas.status), ctrl.setStatus);

export default router;
