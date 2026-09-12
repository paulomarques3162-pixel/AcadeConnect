import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../config/multer.js';
import { profileSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/userController.js';

const router = Router();

router.use(authenticate);

router.get('/profile', ctrl.getProfile);
router.put('/profile', upload.single('avatar'), validate(profileSchemas.update), ctrl.updateProfile);
router.delete('/account', ctrl.requestAccountDeletion);

export default router;
