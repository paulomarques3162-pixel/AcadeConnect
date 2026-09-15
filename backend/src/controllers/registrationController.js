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
import { createPayment } from '../services/paymentService.js';
import { invalidate } from '../utils/cache.js';

// Public event detail/list include registration counts; a new/cancelled
// registration can change them, so drop the cached copies.
const EVENTS_CACHE_PREFIX = 'events:';

/**
 * Retry a serializable transaction when Postgres reports a serialization
 * failure (P2034). This is the mechanism that prevents two participants from
 * taking the last seat at the same instant.
 */
async function withSerializableRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (err) {
      lastErr = err;
      if (err?.code !== 'P2034') throw err;
    }
  }
  throw lastErr;
}

const registrationInclude = {
  // O dono da inscrição (para a tela de detalhe não depender do usuário logado).
  user: { select: { id: true, name: true, email: true, course: true } },
  event: {
    include: {
      institution: { select: { id: true, name: true } },
      _count: { select: { activities: true } },
    },
  },
  activityRegistrations: { include: { activity: { include: { speaker: true } } } },
  attendance: { include: { activity: true } },
  certificates: true,
  payment: { select: { id: true, code: true, status: true, amountCents: true, pixPayload: true, txid: true, paidAt: true, expiresAt: true } },
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

  // Static activity rules (no concurrency implications).
  const validActivities = event.activities.filter((a) => activityIds.includes(a.id));
  if (event.requireActivityRegistration && validActivities.length === 0) {
    throw new ApiError(409, 'Selecione ao menos uma atividade para se inscrever neste evento.');
  }
  for (const a of validActivities) {
    if (!a.allowsRegistration) throw new ApiError(409, `A atividade "${a.name}" não aceita inscrição.`);
  }

  // Generate unique registration code.
  // Use the UTC year: event dates are calendar days stored as UTC-midnight, so
  // getFullYear() could return the previous year on 31/12 in UTC-3.
  let code = generateRegistrationCode(event.startDate.getUTCFullYear());
  for (let i = 0; i < 6; i += 1) {
    if (!(await prisma.registration.findUnique({ where: { code } }))) break;
    code = generateRegistrationCode(event.startDate.getUTCFullYear());
  }
  const qrToken = generateQrToken();

  // Duplicate + capacity checks and the INSERT run in ONE serializable
  // transaction, so two users racing for the last seat cannot both succeed.
  const registration = await withSerializableRetry(async (tx) => {
    // Rule: no duplicate registration.
    const existing = await tx.registration.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (existing) throw new ApiError(409, 'Você já está inscrito neste evento.');

    // Rule: event capacity (re-read inside the transaction).
    if (event.capacity) {
      const count = await tx.registration.count({
        where: { eventId, status: { in: ['PENDING', 'CONFIRMED'] } },
      });
      if (count >= event.capacity) throw new ApiError(409, 'As vagas deste evento estão esgotadas.');
    }

    // Rule: activity capacity (re-read inside the transaction).
    for (const a of validActivities) {
      if (a.capacity) {
        // eslint-disable-next-line no-await-in-loop
        const count = await tx.activityRegistration.count({ where: { activityId: a.id, status: 'CONFIRMED' } });
        if (count >= a.capacity) throw new ApiError(409, `A atividade "${a.name}" está lotada.`);
      }
    }

    return tx.registration.create({
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
  });

  invalidate(EVENTS_CACHE_PREFIX);

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

  // Evento pago: gera o PIX imediatamente. O QR de entrada só passa a valer
  // quando o pagamento for confirmado pelo administrador.
  let payment = null;
  let paymentWarning = null;
  if (event.isPaid) {
    try {
      payment = await createPayment({
        userId,
        eventId,
        registrationId: registration.id,
        amountCents: event.priceCents,
        description: `Inscrição ${code}`,
      });
    } catch (e) {
      paymentWarning = e?.message || 'Não foi possível gerar o PIX agora.';
    }
  }

  const qrCode = await generateQrDataUrl(qrToken);
  return apiResponse(res, {
    status: 201,
    message: event.isPaid
      ? 'Inscrição realizada! Efetue o pagamento PIX para liberar o QR Code de entrada.'
      : 'Inscrição realizada com sucesso!',
    data: { registration, qrCode, payment, paymentWarning, requiresPayment: !!event.isPaid },
  });
});

/**
 * Gera (ou reaproveita) o PIX de uma inscrição existente em evento pago.
 * Usado quando a chave PIX ainda não existia no momento da inscrição.
 */
export const generatePayment = asyncHandler(async (req, res) => {
  const registration = await prisma.registration.findUnique({
    where: { id: req.params.id },
    include: { event: true, payment: true },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');
  const isStaff = ['ADMIN', 'ORGANIZER'].includes(req.user.role);
  if (registration.userId !== req.user.id && !isStaff) throw new ApiError(403, 'Sem permissão.');
  if (!registration.event.isPaid) throw new ApiError(409, 'Este evento é gratuito — não há pagamento.');
  if (registration.status !== 'CONFIRMED') throw new ApiError(409, 'Inscrição não está ativa.');
  if (registration.payment && registration.payment.status === 'PAID') throw new ApiError(409, 'Pagamento já confirmado.');

  const payment = await createPayment({
    userId: registration.userId,
    eventId: registration.eventId,
    registrationId: registration.id,
    amountCents: registration.event.priceCents,
    description: `Inscrição ${registration.code}`,
  });
  return apiResponse(res, { status: 201, message: 'PIX gerado.', data: { payment } });
});

export const getMyRegistrations = asyncHandler(async (req, res) => {
  const take = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const registrations = await prisma.registration.findMany({
    where: { userId: req.user.id },
    include: registrationInclude,
    orderBy: { createdAt: 'desc' },
    take,
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
  invalidate(EVENTS_CACHE_PREFIX);
  await createAuditLog({ userId: req.user.id, action: 'REGISTRATION_CANCELLED', resource: 'Registration', resourceId: registration.id, ip: req.ip });
  return apiResponse(res, { message: 'Inscrição cancelada.', data: { registration: updated } });
});

/**
 * Register the participant in additional activities of an already-created registration.
 */
/**
 * ADMIN/ORGANIZER: restaura/atualiza uma inscrição e suas atividades.
 * Usuário comum não tem acesso (rota protegida).
 */
export const adminUpdateRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, activityIds } = req.body;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { event: { include: { activities: true } } },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  if (Array.isArray(activityIds)) {
    const eventActivityIds = new Set(registration.event.activities.map((a) => a.id));
    const wanted = [...new Set(activityIds.map(String))];
    for (const aid of wanted) {
      if (!eventActivityIds.has(aid)) throw new ApiError(409, 'Atividade não pertence a este evento.');
    }
    const current = await prisma.activityRegistration.findMany({ where: { registrationId: id } });
    const currentIds = new Set(current.map((x) => x.activityId));
    const toAdd = wanted.filter((x) => !currentIds.has(x));
    const toRemove = current.filter((x) => !wanted.includes(x.activityId));

    for (const r of toRemove) {
      const att = await prisma.attendance.findUnique({
        where: { registrationId_activityId: { registrationId: id, activityId: r.activityId } },
      });
      if (att && att.status === 'PRESENT') {
        throw new ApiError(409, 'Não é possível remover uma atividade com presença já registrada.');
      }
    }

    await prisma.$transaction(async (tx) => {
      if (toAdd.length) {
        await tx.activityRegistration.createMany({
          data: toAdd.map((aid) => ({ registrationId: id, activityId: aid, status: 'CONFIRMED' })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length) {
        await tx.activityRegistration.deleteMany({
          where: { registrationId: id, activityId: { in: toRemove.map((r) => r.activityId) } },
        });
      }
    });
  }

  if (status) {
    await prisma.registration.update({ where: { id }, data: { status } });
  }

  const updated = await prisma.registration.findUnique({ where: { id }, include: registrationInclude });
  await createAuditLog({
    userId: req.user.id,
    action: 'REGISTRATION_ADMIN_UPDATED',
    resource: 'Registration',
    resourceId: id,
    details: { status: status || null, activityIds: Array.isArray(activityIds) ? activityIds : null },
    ip: req.ip,
  });
  await createNotification({
    userId: registration.userId,
    type: 'REGISTRATION',
    title: 'Inscrição atualizada',
    message: `Sua inscrição no evento "${registration.event.name}" foi atualizada pela organização.`,
    link: `/inscricao/${id}`,
  });
  return apiResponse(res, { message: 'Inscrição atualizada.', data: { registration: updated } });
});

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

/**
 * Controle administrativo do QR de entrada: regenerar, invalidar ou reativar.
 * Toda ação é auditada.
 */
export const adminSetQr = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const registration = await prisma.registration.findUnique({ where: { id: req.params.id } });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  const data = {};
  if (action === 'regenerate') {
    data.qrToken = generateQrToken();
    data.qrActive = true;
  } else if (action === 'invalidate') {
    data.qrActive = false;
  } else if (action === 'reactivate') {
    data.qrActive = true;
  } else {
    throw new ApiError(422, 'Ação de QR inválida.');
  }

  const updated = await prisma.registration.update({ where: { id: registration.id }, data, include: registrationInclude });
  await createAuditLog({
    userId: req.user.id,
    action: `REGISTRATION_QR_${action.toUpperCase()}`,
    resource: 'Registration',
    resourceId: registration.id,
    ip: req.ip,
  });
  return apiResponse(res, { message: 'QR Code atualizado.', data: { registration: updated } });
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
