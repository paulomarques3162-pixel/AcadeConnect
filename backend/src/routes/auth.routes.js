import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authLimiter, authPeakLimiter } from '../middlewares/rateLimiter.js';
import { authenticate } from '../middlewares/auth.js';
import { authSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/authController.js';

const router = Router();

// authPeakLimiter = coarse per-IP flood ceiling; authLimiter = per (IP+email)
// brute-force ceiling that only counts FAILED attempts.
router.post('/register', authPeakLimiter, authLimiter, validate(authSchemas.register), ctrl.register);
router.post('/login', authPeakLimiter, authLimiter, validate(authSchemas.login), ctrl.login);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.post('/forgot-password', authLimiter, validate(authSchemas.forgot), ctrl.forgotPassword);
router.post('/reset-password', validate(authSchemas.reset), ctrl.resetPassword);
router.post('/change-password', authenticate, validate(authSchemas.changePassword), ctrl.changePassword);

export default router;
