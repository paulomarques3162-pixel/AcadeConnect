import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { adminUserSchemas, institutionSchemas, exportSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/adminController.js';
import * as reportCtrl from '../controllers/reportController.js';
import * as exportCtrl from '../controllers/exportController.js';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'ORGANIZER'));

router.get('/dashboard', ctrl.dashboard);

// Users
router.get('/users', ctrl.listUsers);
router.post('/users', authorize('ADMIN'), validate(adminUserSchemas.create), ctrl.createUser);
router.put('/users/:id', authorize('ADMIN'), validate(adminUserSchemas.update), ctrl.updateUser);
router.delete('/users/:id', authorize('ADMIN'), validate(adminUserSchemas.idParam), ctrl.deleteUser);

// Registrations
router.get('/registrations', ctrl.listAllRegistrations);

// Institutions
router.get('/institutions', ctrl.listInstitutions);
router.post('/institutions', authorize('ADMIN'), validate(institutionSchemas.create), ctrl.createInstitution);
router.put('/institutions/:id', authorize('ADMIN'), validate(institutionSchemas.idParam), ctrl.updateInstitution);
router.delete('/institutions/:id', authorize('ADMIN'), validate(institutionSchemas.idParam), ctrl.deleteInstitution);

// Audit logs
router.get('/logs', ctrl.listAuditLogs);

// Reports
router.get('/reports', reportCtrl.reports);

// Export
router.post('/export/:type', validate(exportSchemas), exportCtrl.exportData);

export default router;
