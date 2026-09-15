import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { heavyLimiter } from '../middlewares/rateLimiter.js';
import { registrationSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/registrationController.js';

const router = Router();

router.use(authenticate);

router.get('/me', ctrl.getMyRegistrations);
router.get('/:id', validate(registrationSchemas.idParam), ctrl.getRegistration);
router.post('/:eventId', heavyLimiter, validate(registrationSchemas.create), ctrl.registerForEvent);
router.delete('/:id', validate(registrationSchemas.idParam), ctrl.cancelRegistration);
router.post('/:id/payment', heavyLimiter, validate(registrationSchemas.idParam), ctrl.generatePayment);

// Restauração/ajuste administrativo da inscrição e atividades
router.put('/:id/admin', authorize('ADMIN', 'ORGANIZER'), validate(registrationSchemas.adminUpdate), ctrl.adminUpdateRegistration);

// Controle administrativo do QR de entrada
router.post('/:id/qr', authorize('ADMIN', 'ORGANIZER'), validate(registrationSchemas.qr), ctrl.adminSetQr);

// Activity subscriptions on a registration
router.post('/:id/activities', validate(registrationSchemas.activity), ctrl.registerForActivity);
router.delete('/:id/activities/:activityId', ctrl.unregisterFromActivity);

export default router;
