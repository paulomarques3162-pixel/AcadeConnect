import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateRegistrationCode, generateQrToken } from '../utils/codes.js';
import { generateQrDataUrl } from '../utils/qr.js';
import { createAuditLog } from '../services/auditLogService.js';
import { createNotification } from '../services/notificationService.js';
import { sendEmail, emailTemplates } from '../services/emailService.js';

const registrationInclude = {
  event: {
    include: {
      institution: { select: { id: true, name: true } },
      _count: { select: { activities: true } },
    },
  },
  activityRegistrations: { include: { activity: { include: { speaker: true } } } },
  attendance: { include: { activity: true } },
  certificates: true,
};

export const registerForEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const activityIds = req.body.activityIds || [];
  const userId = req.user.id;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { activities: true },
  });
  if (!event) throw new ApiError(404, 'Evento não encontrado.');

  // Rule: event must accept registrations.
  if (!event.allowRegistration) throw new ApiError(409, 'As inscrições para este evento estão fechadas.');
  if (['CANCELLED', 'CLOSED'].includes(event.status)) {
    throw new ApiError(409, `Este evento está ${event.status === 'CANCELLED' ? 'cancelado' : 'encerrado'}.`);
  }
  if (event.status === 'DRAFT') throw new ApiError(409, 'Este evento ainda não está disponível para inscrições.');

  // Rule: registration window.
  const now = new Date();
  if (event.registrationStart && now < event.registrationStart) {
    throw new ApiError(409, 'As inscrições ainda não foram abertas.');
  }
  if (event.registrationEnd && now > event.registrationEnd) {
    throw new ApiError(409, 'O prazo de inscrição já se encerrou.');
  }

  // Rule: no duplicate registration.
  const existing = await prisma.registration.findUnique({
    where: { userId_eventId: { userId, eventId } },
  });
  if (existing) throw new ApiError(409, 'Você já está inscrito neste evento.');

  // Rule: capacity.
  if (event.capacity) {
    const count = await prisma.registration.count({
      where: { eventId, status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    if (count >= event.capacity) throw new ApiError(409, 'As vagas deste evento estão esgotadas.');
  }

  // Validate selected activities belong to event & have capacity.
  const validActivities = event.activities.filter((a) => activityIds.includes(a.id));
  if (event.requireActivityRegistration && validActivities.length === 0) {
    throw new ApiError(409, 'Selecione ao menos uma atividade para se inscrever neste evento.');
  }
  for (const a of validActivities) {
    if (!a.allowsRegistration) throw new ApiError(409, `A atividade "${a.name}" não aceita inscrição.`);
    if (a.capacity) {
      const count = await prisma.activityRegistration.count({ where: { activityId: a.id, status: 'CONFIRMED' } });
      if (count >= a.capacity) throw new ApiError(409, `A atividade "${a.name}" está lotada.`);
    }
  }

  // Generate unique registration code.
  let code = generateRegistrationCode(event.startDate.getFullYear());
  for (let i = 0; i < 6; i += 1) {
    if (!(await prisma.registration.findUnique({ where: { code } }))) break;
    code = generateRegistrationCode(event.startDate.getFullYear());
  }
  const qrToken = generateQrToken();

  const registration = await prisma.registration.create({
    data: {
      code,
      qrToken,
      userId,
      eventId,
      status: 'CONFIRMED',
      activityRegistrations: {
        create: validActivities.map((a) => ({ activityId: a.id, status: 'CONFIRMED' })),
      },
    },
    include: registrationInclude,
  });

  await createNotification({
    userId,
    type: 'REGISTRATION',
    title: 'Inscrição realizada',
    message: `Você está inscrito no evento "${event.name}". Inscrição #${code}`,
    link: `/inscricao/${registration.id}`,
  });
  if (env.emailEnabled) {
    const qrUrl = `${env.appUrl}/inscricao/${registration.id}`;
    const tpl = emailTemplates.registration(req.user.name, event.name, code, qrUrl);
    await sendEmail({ to: req.user.email, ...tpl });
  }
  await createAuditLog({ userId, action: 'REGISTRATION_CREATED', resource: 'Registration', resourceId: registration.id, ip: req.ip });

  const qrCode = await generateQrDataUrl(qrToken);
  return apiResponse(res, {
    status: 201,
    message: 'Inscrição realizada com sucesso!',
    data: { registration, qrCode },
  });
});

export const getMyRegistrations = asyncHandler(async (req, res) => {
  const registrations = await prisma.registration.findMany({
    where: { userId: req.user.id },
    include: registrationInclude,
    orderBy: { createdAt: 'desc' },
  });
  return apiResponse(res, { message: 'Minhas inscrições.', data: { registrations } });
});

export const getRegistration = asyncHandler(async (req, res) => {
  const registration = await prisma.registration.findUnique({
    where: { id: req.params.id },
    include: registrationInclude,
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  // Only owner or admin/organizer can view.
  const isOwner = registration.userId === req.user.id;
  const isStaff = ['ADMIN', 'ORGANIZER'].includes(req.user.role);
  if (!isOwner && !isStaff) throw new ApiError(403, 'Sem permissão para ver esta inscrição.');

  const qrCode = await generateQrDataUrl(registration.qrToken);
  return apiResponse(res, {
    message: 'Inscrição.',
    data: { registration, qrCode, isOwner },
  });
});

export const cancelRegistration = asyncHandler(async (req, res) => {
  const registration = await prisma.registration.findUnique({
    where: { id: req.params.id },
    include: { event: true },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');
  if (registration.userId !== req.user.id && !['ADMIN', 'ORGANIZER'].includes(req.user.role)) {
    throw new ApiError(403, 'Sem permissão.');
  }
  if (!registration.event.allowCancellation) throw new ApiError(409, 'Cancelamento não permitido para este evento.');

  const updated = await prisma.registration.update({
    where: { id: registration.id },
    data: { status: 'CANCELLED' },
    include: registrationInclude,
  });
  await createNotification({
    userId: registration.userId,
    type: 'REGISTRATION',
    title: 'Inscrição cancelada',
    message: `Sua inscrição no evento "${registration.event.name}" foi cancelada.`,
  });
  await createAuditLog({ userId: req.user.id, action: 'REGISTRATION_CANCELLED', resource: 'Registration', resourceId: registration.id, ip: req.ip });
  return apiResponse(res, { message: 'Inscrição cancelada.', data: { registration: updated } });
});

/**
 * Register the participant in additional activities of an already-created registration.
 */
export const registerForActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { activityId } = req.body;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { event: true },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');
  if (registration.userId !== req.user.id) throw new ApiError(403, 'Sem permissão.');
  if (registration.status !== 'CONFIRMED') throw new ApiError(409, 'Inscrição não está ativa.');

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) throw new ApiError(404, 'Atividade não encontrada.');
  if (activity.eventId !== registration.eventId) throw new ApiError(409, 'Atividade não pertence a este evento.');
  if (!activity.allowsRegistration) throw new ApiError(409, 'Esta atividade não aceita inscrição.');

  const dup = await prisma.activityRegistration.findUnique({
    where: { registrationId_activityId: { registrationId: id, activityId } },
  });
  if (dup) throw new ApiError(409, 'Você já está inscrito nesta atividade.');

  if (activity.capacity) {
    const count = await prisma.activityRegistration.count({ where: { activityId, status: 'CONFIRMED' } });
    if (count >= activity.capacity) throw new ApiError(409, 'Esta atividade está lotada.');
  }

  await prisma.activityRegistration.create({
    data: { registrationId: id, activityId, status: 'CONFIRMED' },
  });
  await createNotification({ userId: req.user.id, type: 'REGISTRATION', title: 'Inscrição em atividade', message: `Inscrito na atividade "${activity.name}".`, link: `/inscricao/${id}` });
  return apiResponse(res, { status: 201, message: 'Inscrito na atividade com sucesso.', data: { activityId } });
});

export const unregisterFromActivity = asyncHandler(async (req, res) => {
  const { id, activityId } = req.params;
  const registration = await prisma.registration.findUnique({ where: { id } });
  if (!registration || registration.userId !== req.user.id) throw new ApiError(403, 'Sem permissão.');

  // The activity must actually be selected on this registration. Without this
  // check the old code swallowed the Prisma error and answered 200 even when
  // nothing was removed (wrong/undefined activityId).
  const enrollment = await prisma.activityRegistration.findUnique({
    where: { registrationId_activityId: { registrationId: id, activityId } },
  });
  if (!enrollment) throw new ApiError(404, 'Você não está inscrito nesta atividade.');

  // Do not allow removing the enrollment once presence was recorded: it would
  // leave an orphaned Attendance (participant shown as present in an activity
  // they are no longer enrolled in), an inconsistent state.
  const attendance = await prisma.attendance.findUnique({
    where: { registrationId_activityId: { registrationId: id, activityId } },
  });
  if (attendance && attendance.status === 'PRESENT') {
    throw new ApiError(409, 'Presença já registrada nesta atividade. Não é possível encerrar a inscrição.');
  }

  await prisma.activityRegistration.delete({
    where: { registrationId_activityId: { registrationId: id, activityId } },
  });
  await createAuditLog({ userId: req.user.id, action: 'ACTIVITY_REGISTRATION_REMOVED', resource: 'ActivityRegistration', resourceId: `${id}:${activityId}`, ip: req.ip });
  return apiResponse(res, { message: 'Participação na atividade encerrada.' });
});
