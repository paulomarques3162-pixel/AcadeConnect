import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authLimiter, authPeakLimiter } from '../middlewares/rateLimiter.js';
import { authenticate } from '../middlewares/auth.js';
import { authSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/authController.js';

const router = Router();

// authPeakLimiter = coarse per-IP flood ceiling (counts only failures, so a
// legitimate login wave behind one campus NAT is never throttled).
// authLimiter = per (IP+email) ceiling for routes with no credential check.
//
// /login deliberately does NOT use authLimiter: that middleware blocks on entry,
// so once the (IP+email) budget filled up it rejected even a CORRECT password.
// The controller now verifies credentials first and applies the failure budget
// afterwards (`utils/loginAttempts.js`), and authPeakLimiter still caps floods.
router.post('/register', authPeakLimiter, authLimiter, validate(authSchemas.register), ctrl.register);
router.post('/login', authPeakLimiter, validate(authSchemas.login), ctrl.login);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.post('/forgot-password', authLimiter, validate(authSchemas.forgot), ctrl.forgotPassword);
router.post('/reset-password', validate(authSchemas.reset), ctrl.resetPassword);
router.post('/change-password', authenticate, validate(authSchemas.changePassword), ctrl.changePassword);

export default router;
