import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { heavyLimiter } from '../middlewares/rateLimiter.js';
import { certificateSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/certificateController.js';

const router = Router();

// Public validation
router.get('/validate/:code', validate(certificateSchemas.codeParam), ctrl.validateCertificate);

// Authenticated (participant area)
router.use(authenticate);
router.get('/me', ctrl.getMyCertificates);
router.get('/:id', validate(certificateSchemas.idParam), ctrl.getCertificate);
router.get('/:id/download', validate(certificateSchemas.idParam), ctrl.downloadCertificatePdf);

// Admin only
router.post('/issue', heavyLimiter, authorize('ADMIN', 'ORGANIZER'), validate(certificateSchemas.issue), ctrl.issueCertificate);
router.post('/:id/correct', heavyLimiter, authorize('ADMIN', 'ORGANIZER'), validate(certificateSchemas.correct), ctrl.correctCertificate);
router.post('/:id/cancel', authorize('ADMIN', 'ORGANIZER'), validate(certificateSchemas.cancel), ctrl.cancelCertificate);
router.post('/auto/:eventId', heavyLimiter, authorize('ADMIN', 'ORGANIZER'), ctrl.runAutoIssue);
router.get('/admin/list', authorize('ADMIN', 'ORGANIZER'), ctrl.listCertificates);

export default router;
