import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { authenticate } from '../middlewares/auth.js';
import { authSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/authController.js';

const router = Router();

router.post('/register', authLimiter, validate(authSchemas.register), ctrl.register);
router.post('/login', authLimiter, validate(authSchemas.login), ctrl.login);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.post('/forgot-password', authLimiter, validate(authSchemas.forgot), ctrl.forgotPassword);
router.post('/reset-password', validate(authSchemas.reset), ctrl.resetPassword);
router.post('/change-password', authenticate, validate(authSchemas.changePassword), ctrl.changePassword);

export default router;
