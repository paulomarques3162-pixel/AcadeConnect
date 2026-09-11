import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';

/**
 * Resolve a registration from a scanned QR token OR a manually typed code.
 * The two inputs are explicit and are NEVER mixed:
 *   - qrToken -> exact, case-sensitive lookup on Registration.qrToken (camera)
 *   - code    -> normalized (trim + UPPERCASE) lookup on Registration.code (manual)
 * The backend is the single authority and never trusts the browser.
 */
export async function findRegistrationByScan({ qrToken, code } = {}) {
  const include = { event: true, user: true, activityRegistrations: true };
  const token = String(qrToken ?? '').trim();

  if (token) {
    // Legacy QR codes (older builds) encoded the PNG data URL instead of the
    // token. That content cannot be turned back into a token, so reject it
    // explicitly with a clear message — never accept arbitrary content.
    if (/^data:image\//i.test(token)) {
      throw new ApiError(422, 'Este QR Code é antigo e não pode ser validado. Peça ao participante para abrir novamente a inscrição e exibir um novo QR Code.');
    }
    const byToken = await prisma.registration.findUnique({ where: { qrToken: token }, include });
    if (!byToken) throw new ApiError(404, 'QR Code inválido.');
    return byToken;
  }

  const humanCode = String(code ?? '').trim().toUpperCase();
  if (humanCode) {
    const byCode = await prisma.registration.findUnique({ where: { code: humanCode }, include });
    if (!byCode) throw new ApiError(404, 'Inscrição não encontrada para este código.');
    return byCode;
  }

  throw new ApiError(400, 'QR Code ou código de inscrição não informado.');
}

/**
 * Register (or update) attendance, enforcing ALL business rules server-side.
 * The frontend never decides success — the backend validates everything.
 *
 * @param {object} params
 * @param {string} params.qrToken - opaque token from the participant's QR code
 * @param {string} params.code - human-readable registration code (EVT-2026-000123) for manual entry
 * @param {string} params.activityId - selected activity
 * @param {string} [params.operatorId] - user performing the registration
 * @param {AttendanceMethod} [params.method] - QR_CODE | MANUAL | ADMIN | IMPORTACAO
 */
export async function registerAttendanceByQr({ qrToken, code, activityId, operatorId = null, method = 'QR_CODE' }) {
  if (!String(qrToken || code || '').trim()) {
    throw new ApiError(400, 'Informe o QR Code ou o código da inscrição.');
  }

  const registration = await findRegistrationByScan({ qrToken, code });
  if (!registration) throw new ApiError(404, 'QR Code ou código de inscrição inválido.');
  if (registration.status !== 'CONFIRMED') {
    throw new ApiError(409, `Inscrição ${registration.status === 'CANCELLED' ? 'cancelada' : 'pendente'}. Entre em contato com a organização.`);
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { event: true },
  });
  if (!activity) throw new ApiError(404, 'Atividade não encontrada.');
  if (activity.eventId !== registration.eventId) {
    throw new ApiError(409, 'Esta atividade não pertence ao evento da inscrição.');
  }

  // Event / activity lifecycle checks
  if (activity.status === 'CANCELLED') throw new ApiError(409, 'Atividade cancelada.');
  if (activity.status === 'FINISHED' || isFinished(activity)) {
    throw new ApiError(409, 'Atividade encerrada. Presença não pode ser registrada.');
  }
  if (registration.event.status === 'CANCELLED') throw new ApiError(409, 'Evento cancelado.');

  // Presence is the primary goal here: the participant does NOT need a prior
  // activity enrollment just to check in. When the event optionally requires
  // activity enrollment, we validate it; otherwise we create the (idempotent)
  // activity enrollment at check-in so the participant shows up in the
  // activity roster and the reports stay consistent (no orphan Attendance).
  const activityRegistered = registration.activityRegistrations.some((ar) => ar.activityId === activityId);
  if (registration.event.requireActivityRegistration && !activityRegistered) {
    throw new ApiError(409, 'Participante não está inscrito nesta atividade.');
  }
  if (!activityRegistered) {
    await prisma.activityRegistration.upsert({
      where: { registrationId_activityId: { registrationId: registration.id, activityId } },
      create: { registrationId: registration.id, activityId, status: 'CONFIRMED' },
      update: {},
    });
  }

  // Duplicate check.
  const existing = await prisma.attendance.findUnique({
    where: { registrationId_activityId: { registrationId: registration.id, activityId } },
  });
  if (existing && existing.status === 'PRESENT') {
    throw new ApiError(409, 'Presença já registrada para esta atividade.', {
      recordedAt: existing.recordedAt,
      method: existing.method,
    });
  }

  const attendance = await prisma.attendance.upsert({
    where: { registrationId_activityId: { registrationId: registration.id, activityId } },
    create: {
      registrationId: registration.id,
      activityId,
      userId: registration.userId,
      eventId: registration.eventId,
      status: 'PRESENT',
      method,
      recordedAt: new Date(),
      operatorId,
    },
    update: {
      status: 'PRESENT',
      method,
      recordedAt: new Date(),
      operatorId,
    },
  });

  await createNotification({
    userId: registration.userId,
    type: 'ATTENDANCE',
    title: 'Presença registrada',
    message: `Sua presença foi registrada na atividade "${activity.name}".`,
    link: '/minhas-inscricoes',
  });

  await createAuditLog({
    userId: operatorId,
    action: 'ATTENDANCE_REGISTERED',
    resource: 'Attendance',
    resourceId: attendance.id,
    details: { activityId, method },
  });

  return {
    attendance,
    participant: { id: registration.userId, name: registration.user.name },
    registrationCode: registration.code,
    activityName: activity.name,
  };
}

/**
 * Manually register/remove presence for a participant+activity.
 */
export async function setManualAttendance({ registrationId, activityId, present, operatorId = null, method = 'MANUAL' }) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) throw new ApiError(404, 'Atividade não encontrada.');
  if (registration.eventId !== activity.eventId) {
    throw new ApiError(409, 'Atividade não pertence ao evento da inscrição.');
  }

  const existing = await prisma.attendance.findUnique({
    where: { registrationId_activityId: { registrationId, activityId } },
  });

  if (!present) {
    if (existing) {
      await prisma.attendance.delete({ where: { id: existing.id } });
      await createAuditLog({
        userId: operatorId,
        action: 'ATTENDANCE_REMOVED',
        resource: 'Attendance',
        resourceId: existing.id,
        details: { activityId },
      });
    }
    return { removed: true };
  }

  // Manual registration follows the same lifecycle/security rules as QR.
  // Only allow presence on an active (non-cancelled, non-finished) activity.
  if (activity.status === 'CANCELLED') throw new ApiError(409, 'Atividade cancelada.');
  if (activity.status === 'FINISHED' || isFinished(activity)) {
    throw new ApiError(409, 'Atividade encerrada. Presença não pode ser registrada.');
  }
  if (registration.event.status === 'CANCELLED') throw new ApiError(409, 'Evento cancelado.');

  // Keep the activity roster consistent: an attendance row must never be orphaned
  // (present in Attendance but absent from the activity's enrollments).
  await prisma.activityRegistration.upsert({
    where: { registrationId_activityId: { registrationId, activityId } },
    create: { registrationId, activityId, status: 'CONFIRMED' },
    update: {},
  });

  const attendance = await prisma.attendance.upsert({
    where: { registrationId_activityId: { registrationId, activityId } },
    create: {
      registrationId,
      activityId,
      userId: registration.userId,
      eventId: registration.eventId,
      status: 'PRESENT',
      method,
      recordedAt: new Date(),
      operatorId,
    },
    update: { status: 'PRESENT', method, recordedAt: new Date(), operatorId },
  });

  await createNotification({
    userId: registration.userId,
    type: 'ATTENDANCE',
    title: 'Presença registrada',
    message: 'Sua presença foi confirmada.',
    link: '/minhas-inscricoes',
  });

  await createAuditLog({
    userId: operatorId,
    action: 'ATTENDANCE_REGISTERED',
    resource: 'Attendance',
    resourceId: attendance.id,
    details: { activityId, method },
  });

  return { attendance };
}

function isFinished(activity) {
  // `activity.date` is stored as UTC-midnight of the scheduled calendar day
  // (the frontend sends a date-only string; the controller stores `new Date(date)`).
  // Rebuild the end instant on that same calendar day (UTC components) applying the
  // endTime as local wall-clock time, then compare with the current local time.
  // This is timezone-independent: a same-day/future activity is NOT wrongly treated
  // as finished when the server runs in a non-UTC timezone (e.g. America/Sao_Paulo,
  // where calling setHours() on the UTC-midnight Date would shift the end to the
  // previous day).
  const d = new Date(activity.date);
  const [h, m] = String(activity.endTime || '23:59').split(':').map(Number);
  const end = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0, 0);
  return new Date() > end;
}
