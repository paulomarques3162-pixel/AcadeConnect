import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import { activitySchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/activityController.js';

const router = Router();

// Public: list (by query eventId or nested /:eventId/activities) and get by id
router.get('/', ctrl.listActivities);
router.get('/:id', ctrl.getActivity);

// Admin / Organizer
router.post('/', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), validate(activitySchemas.create), ctrl.createActivity);
router.put('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('image'), ctrl.updateActivity);
router.delete('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.deleteActivity);
router.post('/:id/duplicate', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.duplicateActivity);
router.post('/:id/close', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.closeActivity);

export default router;
