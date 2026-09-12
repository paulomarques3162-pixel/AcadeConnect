import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { attendanceSchemas } from '../validations/schemas.js';
import * as ctrl from '../controllers/attendanceController.js';

const router = Router();

// Operator/Staff only
router.use(authenticate, authorize('ADMIN', 'ORGANIZER'));

router.post('/scan', validate(attendanceSchemas.scan), ctrl.registerByQr);
router.post('/validate', validate(attendanceSchemas.validate), ctrl.validateQr);
router.post('/manual', validate(attendanceSchemas.manual), ctrl.manualRegister);

router.get('/', ctrl.listAllAttendance);
router.get('/summary/:eventId', ctrl.eventAttendanceSummary);
router.get('/activity/:activityId', validate(attendanceSchemas.activityParam), ctrl.listActivityAttendance);
router.get('/participants/search', ctrl.searchParticipants);

export default router;
