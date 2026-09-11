import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { registerAttendanceByQr, setManualAttendance, findRegistrationByScan } from '../services/attendanceService.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * Operator scans a QR code (opaque token) + selects activity.
 * Backend validates everything and records presence.
 */
export const registerByQr = asyncHandler(async (req, res) => {
  const { qrToken, code, activityId } = req.body;
  // Camera sends the QR token; manual entry sends the registration code. The
  // method reflects which one was used (both are validated by the backend).
  const usedToken = Boolean(String(qrToken || '').trim());
  const result = await registerAttendanceByQr({
    qrToken,
    code,
    activityId,
    operatorId: req.user.id,
    method: usedToken ? 'QR_CODE' : 'MANUAL',
  });
  return apiResponse(res, { status: 201, message: 'Presença registrada com sucesso!', data: result });
});

/** Validate a QR token / registration code without recording (confirmation screen). */
export const validateQr = asyncHandler(async (req, res) => {
  const { qrToken, code } = req.body;
  const registration = await findRegistrationByScan({ qrToken, code });
  if (!registration) throw new ApiError(404, 'QR Code ou código de inscrição inválido.');
  return apiResponse(res, {
    message: 'Inscrição encontrada.',
    data: {
      registration: {
        id: registration.id,
        code: registration.code,
        status: registration.status,
        event: { id: registration.event.id, name: registration.event.name },
        user: { id: registration.user.id, name: registration.user.name },
      },
    },
  });
});

/**
 * Attendance list for an activity (participant rows).
 */
export const listActivityAttendance = asyncHandler(async (req, res) => {
  const { activityId } = req.params;
  const { search, status } = req.query;

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { event: { select: { id: true, name: true } } },
  });
  if (!activity) throw new ApiError(404, 'Atividade não encontrada.');

  const activityRegs = await prisma.activityRegistration.findMany({
    where: { activityId, status: 'CONFIRMED' },
    include: {
      registration: {
        include: {
          user: { select: { id: true, name: true, email: true, course: true } },
          attendance: { where: { activityId } },
        },
      },
    },
  });

  const statusFilter = status ? [status] : ['PRESENT', 'ABSENT', 'PENDING'];
  let rows = activityRegs.map((ar) => {
    const att = ar.registration.attendance[0];
    return {
      registrationId: ar.registrationId,
      activityId,
      code: ar.registration.code,
      participant: ar.registration.user,
      status: att ? att.status : 'PENDING',
      method: att?.method || null,
      recordedAt: att?.recordedAt || null,
      operatorId: att?.operatorId || null,
    };
  });

  // Legacy/edge safety: include any attendance whose participant is not in the
  // activity enrollment list, so a recorded presence is never hidden from the
  // roster (and can be reconciled instead of becoming an invisible orphan).
  const enrolledIds = new Set(activityRegs.map((ar) => ar.registrationId));
  const orphanAttendance = await prisma.attendance.findMany({
    where: { activityId, registrationId: { notIn: [...enrolledIds] } },
    include: {
      user: { select: { id: true, name: true, email: true, course: true } },
      registration: { select: { id: true, code: true } },
    },
  });
  rows = rows.concat(
    orphanAttendance.map((att) => ({
      registrationId: att.registrationId,
      activityId,
      code: att.registration.code,
      participant: att.user,
      status: att.status,
      method: att.method,
      recordedAt: att.recordedAt,
      operatorId: att.operatorId,
    }))
  );

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.participant.name.toLowerCase().includes(q) ||
        r.participant.email?.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
    );
  }
  if (statusFilter) rows = rows.filter((r) => statusFilter.includes(r.status));

  return apiResponse(res, {
    message: 'Presenças da atividade.',
    data: {
      activity,
      rows,
      summary: {
        inscritos: rows.length,
        presentes: rows.filter((r) => r.status === 'PRESENT').length,
        ausentes: rows.filter((r) => r.status === 'ABSENT').length,
        pendentes: rows.filter((r) => r.status === 'PENDING').length,
      },
    },
  });
});

/**
 * Attendance summary grouped by activity for an event.
 */
export const eventAttendanceSummary = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const activities = await prisma.activity.findMany({
    where: { eventId },
    include: {
      _count: { select: { attendance: true } },
      registrations: { where: { status: 'CONFIRMED' } },
      attendance: true,
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  const summary = activities.map((a) => {
    const presentes = a.attendance.filter((x) => x.status === 'PRESENT').length;
    // The denominator is the union of enrolled participants and recorded
    // attendees, so an attendance without a prior enrollment never pushes the
    // percentage above 100%.
    const enrolledCount = a.registrations.length;
    const presentRegistrationIds = new Set(a.attendance.filter((x) => x.status === 'PRESENT').map((x) => x.registrationId));
    const inscritos = new Set([
      ...a.registrations.map((r) => r.registrationId),
      ...presentRegistrationIds,
    ]).size || enrolledCount;
    const ausentes = Math.max(0, inscritos - presentes);
    const percentual = inscritos === 0 ? 0 : Math.min(100, Math.round((presentes / inscritos) * 100));
    return {
      activityId: a.id,
      activityName: a.name,
      type: a.type,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      inscritos,
      presentes,
      ausentes,
      percentual,
    };
  });

  return apiResponse(res, { message: 'Resumo de presença.', data: { summary } });
});

/**
 * Manual presence registration / removal.
 */
export const manualRegister = asyncHandler(async (req, res) => {
  const { registrationId, activityId, present } = req.body;
  const result = await setManualAttendance({
    registrationId,
    activityId,
    present,
    operatorId: req.user.id,
    method: 'MANUAL',
  });
  return apiResponse(res, { status: 201, message: present ? 'Presença registrada.' : 'Presença removida.', data: result });
});

/**
 * Search participants registered in an event (for manual registration).
 */
export const searchParticipants = asyncHandler(async (req, res) => {
  const { eventId, q } = req.query;
  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, course: true } },
      activityRegistrations: true,
      attendance: true,
    },
    take: 50,
  });

  return apiResponse(res, {
    message: 'Participantes.',
    data: {
      registrations: registrations.map((r) => ({
        registrationId: r.id,
        code: r.code,
        participant: r.user,
        activitiesCount: r.activityRegistrations.length,
      })),
    },
  });
});

export const listAllAttendance = asyncHandler(async (req, res) => {
  const { eventId, activityId, search, status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (eventId) where.eventId = eventId;
  if (activityId) where.activityId = activityId;
  if (status) where.status = status;
  if (search) {
    where.user = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] };
  }
  const [total, attendance] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        activity: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        registration: { select: { code: true } },
      },
      orderBy: { recordedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return apiResponse(res, {
    message: 'Presenças.',
    data: { attendance },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});
