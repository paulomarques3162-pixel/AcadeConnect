import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize, optionalAuthenticate } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import { eventSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/eventController.js';
import activityRoutes from './activity.routes.js';

const router = Router();

// Public. optionalAuthenticate lets staff receive their (superset) projection
// without a separate route; the projection is chosen from the verified token,
// never from client input. Query is validated + clamped before the controller.
router.get('/', optionalAuthenticate, validate(eventSchemas.listQuery), ctrl.listEvents);
router.get('/:idOrSlug', optionalAuthenticate, ctrl.getEvent);

// Activities nested under an event (public)
router.use('/:eventId/activities', activityRoutes);

// Admin / Organizer
router.post('/', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('banner'), validate(eventSchemas.create), ctrl.createEvent);
router.put('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('banner'), validate(eventSchemas.update), ctrl.updateEvent);
router.delete('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.deleteEvent);
router.delete('/:id/hard', authenticate, authorize('ADMIN'), ctrl.hardDeleteEvent);
router.post('/:id/duplicate', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.duplicateEvent);
router.post('/:id/close', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.closeEventAndIssueCertificates);

export default router;
