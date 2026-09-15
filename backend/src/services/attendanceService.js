import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { isActivityFinished } from '../utils/date.js';
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
  const include = {
    event: true,
    user: true,
    activityRegistrations: true,
    payment: true,
  };

  const token = String(qrToken ?? '').trim();

  if (token) {
    // Legacy QR codes from older builds encoded the PNG data URL instead
    // of the actual registration token. Never accept arbitrary image data.
    if (/^data:image\//i.test(token)) {
      throw new ApiError(
        422,
        'Este QR Code é antigo e não pode ser validado. Peça ao participante para abrir novamente a inscrição e exibir um novo QR Code.'
      );
    }

    const byToken = await prisma.registration.findUnique({
      where: { qrToken: token },
      include,
    });

    if (!byToken) {
      throw new ApiError(404, 'QR Code inválido.');
    }

    return byToken;
  }

  const humanCode = String(code ?? '').trim().toUpperCase();

  if (humanCode) {
    const byCode = await prisma.registration.findUnique({
      where: { code: humanCode },
      include,
    });

    if (!byCode) {
      throw new ApiError(
        404,
        'Inscrição não encontrada para este código.'
      );
    }

    return byCode;
  }

  throw new ApiError(
    400,
    'QR Code ou código de inscrição não informado.'
  );
}

/**
 * Verifica se o instante atual está no mesmo dia de calendário
 * da atividade, considerando o fuso horário oficial do evento.
 *
 * Activity.date é armazenada como meia-noite UTC representando
 * o dia escolhido pelo usuário.
 */
function isSameEventDay(dateValue, timeZone = 'America/Sao_Paulo', now = new Date()) {
  const activityDate = new Date(dateValue);

  if (Number.isNaN(activityDate.getTime())) {
    return false;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Activity.date é um DIA DE CALENDÁRIO gravado à meia-noite UTC. O dia da
  // atividade deve ser lido pelo UTC (ex.: 2026-09-15T00:00:00Z -> 2026-09-15).
  // Formatá-lo no fuso do evento (UTC-3) retornava o dia ANTERIOR, bloqueando a
  // presença no dia correto. "Hoje", sim, é o dia no fuso do evento.
  const activityDay = activityDate.toISOString().slice(0, 10);
  const currentDay = formatter.format(now);

  return activityDay === currentDay;
}

/**
 * Register (or update) attendance, enforcing ALL business rules server-side.
 * The frontend never decides success — the backend validates everything.
 *
 * @param {object} params
 * @param {string} params.qrToken - opaque token from the participant's QR code
 * @param {string} params.code - human-readable registration code
 * @param {string} params.activityId - selected activity
 * @param {string} [params.operatorId] - user performing the registration
 * @param {AttendanceMethod} [params.method] - QR_CODE | MANUAL | ADMIN | IMPORTACAO
 */
export async function registerAttendanceByQr({
  qrToken,
  code,
  activityId,
  operatorId = null,
  method = 'QR_CODE',
}) {
  if (!String(qrToken || code || '').trim()) {
    throw new ApiError(
      400,
      'Informe o QR Code ou o código da inscrição.'
    );
  }

  const registration = await findRegistrationByScan({
    qrToken,
    code,
  });

  if (!registration) {
    throw new ApiError(
      404,
      'QR Code ou código de inscrição inválido.'
    );
  }

  if (registration.status !== 'CONFIRMED') {
    throw new ApiError(
      409,
      `Inscrição ${
        registration.status === 'CANCELLED'
          ? 'cancelada'
          : 'pendente'
      }. Entre em contato com a organização.`
    );
  }

  /*
   * QR validity is independent of payment.
   *
   * This is intentionally checked for ALL events, including free events.
   * Therefore an administrator can invalidate a QR Code and the invalidation
   * is respected immediately.
   */
  if (registration.qrActive === false) {
    throw new ApiError(
      409,
      'Este QR Code não está mais válido. Procure a organização.'
    );
  }

  /*
   * Payment authorization applies only to paid events.
   */
  if (registration.event.isPaid) {
    if (
      !registration.payment ||
      registration.payment.status !== 'PAID'
    ) {
      throw new ApiError(
        409,
        'Pagamento ainda não confirmado. Este evento exige pagamento antes da entrada.'
      );
    }
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { event: true },
  });

  if (!activity) {
    throw new ApiError(404, 'Atividade não encontrada.');
  }

  if (activity.eventId !== registration.eventId) {
    throw new ApiError(
      409,
      'Esta atividade não pertence ao evento da inscrição.'
    );
  }

  /*
   * The QR/manual attendance flow is valid only on the calendar day
   * of the activity.
   *
   * This prevents a valid QR Code from being used days before the event.
   */
  if (
    !isSameEventDay(
      activity.date,
      env.eventTimezone,
      new Date()
    )
  ) {
    throw new ApiError(
      409,
      'A presença só pode ser registrada no dia da atividade.'
    );
  }

  // Event / activity lifecycle checks.
  if (activity.status === 'CANCELLED') {
    throw new ApiError(409, 'Atividade cancelada.');
  }

  if (
    activity.status === 'FINISHED' ||
    isFinished(activity)
  ) {
    throw new ApiError(
      409,
      'Atividade encerrada. Presença não pode ser registrada.'
    );
  }

  if (registration.event.status === 'CANCELLED') {
    throw new ApiError(409, 'Evento cancelado.');
  }

  /*
   * Presence is the primary goal here:
   * the participant does NOT need a prior activity enrollment
   * unless the event explicitly requires it.
   */
  const activityRegistered =
    registration.activityRegistrations.some(
      (ar) => ar.activityId === activityId
    );

  if (
    registration.event.requireActivityRegistration &&
    !activityRegistered
  ) {
    throw new ApiError(
      409,
      'Participante não está inscrito nesta atividade.'
    );
  }

  /*
   * When activity enrollment is not required, create the enrollment
   * automatically at check-in so the activity roster and attendance
   * reports remain consistent.
   */
  if (!activityRegistered) {
    await prisma.activityRegistration.upsert({
      where: {
        registrationId_activityId: {
          registrationId: registration.id,
          activityId,
        },
      },
      create: {
        registrationId: registration.id,
        activityId,
        status: 'CONFIRMED',
      },
      update: {},
    });
  }

  // Duplicate check.
  const existing = await prisma.attendance.findUnique({
    where: {
      registrationId_activityId: {
        registrationId: registration.id,
        activityId,
      },
    },
  });

  if (existing && existing.status === 'PRESENT') {
    throw new ApiError(
      409,
      'Presença já registrada para esta atividade.',
      {
        recordedAt: existing.recordedAt,
        method: existing.method,
      }
    );
  }

  const attendance = await prisma.attendance.upsert({
    where: {
      registrationId_activityId: {
        registrationId: registration.id,
        activityId,
      },
    },
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
    details: {
      activityId,
      method,
    },
  });

  return {
    attendance,
    participant: {
      id: registration.userId,
      name: registration.user.name,
    },
    registrationCode: registration.code,
    activityName: activity.name,
  };
}

/**
 * Manually register/remove presence for a participant+activity.
 *
 * This is an administrative/manual flow and keeps its existing behavior.
 * The event-day restriction above applies to the QR/manual scan endpoint.
 */
export async function setManualAttendance({
  registrationId,
  activityId,
  present,
  operatorId = null,
  method = 'MANUAL',
}) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true },
  });

  if (!registration) {
    throw new ApiError(404, 'Inscrição não encontrada.');
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });

  if (!activity) {
    throw new ApiError(404, 'Atividade não encontrada.');
  }

  if (registration.eventId !== activity.eventId) {
    throw new ApiError(
      409,
      'Atividade não pertence ao evento da inscrição.'
    );
  }

  const existing = await prisma.attendance.findUnique({
    where: {
      registrationId_activityId: {
        registrationId,
        activityId,
      },
    },
  });

  if (!present) {
    if (existing) {
      await prisma.attendance.delete({
        where: { id: existing.id },
      });

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

  // Manual administrative registration follows the existing
  // activity lifecycle/security rules.
  if (activity.status === 'CANCELLED') {
    throw new ApiError(409, 'Atividade cancelada.');
  }

  if (
    activity.status === 'FINISHED' ||
    isFinished(activity)
  ) {
    throw new ApiError(
      409,
      'Atividade encerrada. Presença não pode ser registrada.'
    );
  }

  if (registration.event.status === 'CANCELLED') {
    throw new ApiError(409, 'Evento cancelado.');
  }

  // Keep the activity roster consistent.
  await prisma.activityRegistration.upsert({
    where: {
      registrationId_activityId: {
        registrationId,
        activityId,
      },
    },
    create: {
      registrationId,
      activityId,
      status: 'CONFIRMED',
    },
    update: {},
  });

  const attendance = await prisma.attendance.upsert({
    where: {
      registrationId_activityId: {
        registrationId,
        activityId,
      },
    },
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
    message: 'Sua presença foi confirmada.',
    link: '/minhas-inscricoes',
  });

  await createAuditLog({
    userId: operatorId,
    action: 'ATTENDANCE_REGISTERED',
    resource: 'Attendance',
    resourceId: attendance.id,
    details: {
      activityId,
      method,
    },
  });

  return { attendance };
}

function isFinished(activity) {
  /*
   * `activity.date` is the scheduled calendar day (UTC-midnight)
   * and `endTime` is a wall-clock time in the event timezone.
   *
   * The end instant is calculated in that timezone, not in the
   * server timezone.
   */
  return isActivityFinished(
    activity.date,
    activity.endTime,
    {
      timeZone: env.eventTimezone,
    }
  );
}