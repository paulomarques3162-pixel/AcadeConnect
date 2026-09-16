import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import { activitySchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/activityController.js';

// `mergeParams` is REQUIRED: this router is mounted both at /activities and
// nested at /events/:eventId/activities. Without it the parent `:eventId` was
// invisible to the handler and the nested route silently returned every
// activity of every event instead of the event's schedule.
const router = Router({ mergeParams: true });

// Public: list (by query eventId or nested /:eventId/activities) and get by id
router.get('/', ctrl.listActivities);
router.get('/:id', ctrl.getActivity);

// Admin / Organizer
router.post('/', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), validate(activitySchemas.create), ctrl.createActivity);
router.put('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), validate(activitySchemas.update), ctrl.updateActivity);
router.delete('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.deleteActivity);
router.post('/:id/duplicate', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.duplicateActivity);
router.post('/:id/close', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.closeActivity);

export default router;
