import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import * as ctrl from '../controllers/speakerController.js';

const router = Router();

// Public
router.get('/', ctrl.listSpeakers);
router.get('/:id', ctrl.getSpeaker);

// Admin / Organizer
router.post('/', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('photo'), ctrl.createSpeaker);
router.put('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), upload.single('photo'), ctrl.updateSpeaker);
router.delete('/:id', authenticate, authorize('ADMIN', 'ORGANIZER'), ctrl.deleteSpeaker);

export default router;
