import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { registrationSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/registrationController.js';

const router = Router();

router.use(authenticate);

router.get('/me', ctrl.getMyRegistrations);
router.get('/:id', validate(registrationSchemas.idParam), ctrl.getRegistration);
router.post('/:eventId', validate(registrationSchemas.create), ctrl.registerForEvent);
router.delete('/:id', validate(registrationSchemas.idParam), ctrl.cancelRegistration);

// Activity subscriptions on a registration
router.post('/:id/activities', validate(registrationSchemas.activity), ctrl.registerForActivity);
router.delete('/:id/activities/:activityId', ctrl.unregisterFromActivity);

export default router;
