import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { buildCertificatePdf } from '../utils/pdf.js';
import { generateCertificateCode } from '../utils/codes.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';
import { sendEmail, emailTemplates } from './emailService.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compute attendance percentage for a registration against the event's
 * required activities (those that require attendance).
 * @returns {Promise<{required:number, present:number, percentage:number}>}
 */
export async function computeAttendanceForRegistration(registrationId) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      event: true,
      activityRegistrations: { include: { activity: true } },
      attendance: true,
    },
  });
  if (!registration) return null;

  const requiredActivities = registration.activityRegistrations
    .map((ar) => ar.activity)
    .filter((a) => a.requiresAttendance && a.generatesCertificate);

  const required = requiredActivities.length;
  const requiredIds = new Set(requiredActivities.map((a) => a.id));
  const present = registration.attendance.filter(
    (at) => at.status === 'PRESENT' && requiredIds.has(at.activityId)
  ).length;
  const percentage = required === 0 ? 0 : Math.round((present / required) * 100);
  return { required, present, percentage };
}

/**
 * Issue a certificate for a registration (event-wide).
 * Validates the configured criteria before creating.
 */
export async function issueEventCertificate(registrationId, opts = {}) {
  const { operatorId = null, force = false } = opts;
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      user: true,
      event: { include: { organizer: { select: { name: true } } } },
      activityRegistrations: { include: { activity: true } },
      attendance: true,
      certificates: true,
    },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  const { event } = registration;
  // Ignora versões canceladas: uma correção pode emitir uma nova versão válida.
  const existing = registration.certificates.find((c) => c.activityId === null && c.status !== 'CANCELLED');
  if (existing) return existing; // already issued

  const hours = event.certificateHours || 0;

  if (!force) {
    const requiredActivities = registration.activityRegistrations
      .map((ar) => ar.activity)
      .filter((a) => a.requiresAttendance && a.generatesCertificate);
    const requiredIds = new Set(requiredActivities.map((a) => a.id));
    const required = requiredActivities.length;
    // Only count presence on the activities that require attendance, otherwise
    // an extra activity could inflate the percentage above 100%.
    const present = registration.attendance.filter(
      (a) => a.status === 'PRESENT' && requiredIds.has(a.activityId)
    ).length;
    const percentage = required === 0 ? 0 : Math.round((present / required) * 100);
    if (required === 0 || percentage < event.minimumAttendancePercentage) {
      throw new ApiError(
        409,
        `Participante não atende ao critério mínimo de presença (exigido ${event.minimumAttendancePercentage}%, atingido ${percentage}%).`
      );
    }
  }

  return createCertificate({
    userId: registration.userId,
    eventId: event.id,
    registrationId: registration.id,
    activityId: null,
    hours,
    participantName: registration.user.name,
    eventName: event.name,
    eventDate: event.startDate,
    responsible: event.organizer?.name || null,
    operatorId,
    code: null,
  });
}

/**
 * Issue a certificate for a single activity.
 */
export async function issueActivityCertificate(registrationId, activityId, opts = {}) {
  const { operatorId = null, force = false } = opts;
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: { include: { organizer: { select: { name: true } } } }, activityRegistrations: true, certificates: true, attendance: true },
  });
  if (!registration) throw new ApiError(404, 'Inscrição não encontrada.');

  const existing = registration.certificates.find((c) => c.activityId === activityId && c.status !== 'CANCELLED');
  if (existing) return existing;

  const attended = registration.attendance.some((a) => a.activityId === activityId && a.status === 'PRESENT');
  if (!force && !attended) {
    throw new ApiError(409, 'Presença não registrada nesta atividade.');
  }

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  const hours = activity?.type === 'MINICURSO' || activity?.type === 'CURSO' || activity?.type === 'OFICINA' || activity?.type === 'WORKSHOP'
    ? 4
    : 2;

  return createCertificate({
    userId: registration.userId,
    eventId: registration.eventId,
    registrationId: registration.id,
    activityId,
    hours,
    participantName: registration.user.name,
    eventName: registration.event.name,
    eventDate: activity?.date || registration.event.startDate,
    activityName: activity?.name || null,
    responsible: registration.event.organizer?.name || null,
    operatorId,
  });
}

/**
 * Core certificate creation: unique code + PDF + QR pointing to validation page.
 */
async function createCertificate({
  userId,
  eventId,
  registrationId,
  activityId,
  hours,
  participantName,
  eventName,
  eventDate,
  activityName = null,
  responsible = null,
  operatorId = null,
  correctionOfId = null,
  storeOverrides = false,
  notificationOverride = null,
}) {
  // Generate a guaranteed-unique code.
  let code = generateCertificateCode();
  for (let i = 0; i < 5; i += 1) {
    const exists = await prisma.certificate.findUnique({ where: { code } });
    if (!exists) break;
    code = generateCertificateCode();
  }

  const validationUrl = `${env.appUrl}/validar-certificado?codigo=${code}`;
  const pdf = await buildCertificatePdf({
    code,
    participantName,
    eventName,
    hours,
    date: eventDate,
    activityName,
    responsible,
    qrValidationUrl: validationUrl,
  });

  // Persist PDF to local uploads dir (swap with S3 in production).
  const uploadsRoot = path.resolve(env.uploadDir);
  fs.mkdirSync(uploadsRoot, { recursive: true });
  const filename = `certificado-${code}.pdf`;
  const pdfPath = path.join(uploadsRoot, filename);
  fs.writeFileSync(pdfPath, pdf);

  const certificate = await prisma.certificate.create({
    data: {
      code,
      userId,
      eventId,
      registrationId,
      activityId: activityId || null,
      hours,
      pdfUrl: filename,
      status: 'AVAILABLE',
      ...(correctionOfId ? { correctionOfId } : {}),
      // Guarda os dados corrigidos como override (usados na exibição/PDF).
      ...(storeOverrides ? { participantName, eventName } : {}),
    },
  });

  await createNotification({
    userId,
    type: 'CERTIFICATE',
    title: notificationOverride?.title || 'Certificado disponível',
    message: notificationOverride?.message || `Seu certificado do evento "${eventName}" está disponível.`,
    link: notificationOverride?.link || '/certificados',
  });

  if (env.emailEnabled) {
    const tpl = emailTemplates.certificate(participantName, eventName, code, validationUrl);
    await sendEmail({ to: (await prisma.user.findUnique({ where: { id: userId } })).email, ...tpl });
  }

  await createAuditLog({
    userId: operatorId,
    action: 'CERTIFICATE_ISSUED',
    resource: 'Certificate',
    resourceId: certificate.id,
    details: { code, userId },
  });

  return certificate;
}

/**
 * Run automatic certificate generation for all eligible registrations of an event.
 */
export async function autoIssueCertificatesForEvent(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { registrations: true, activities: true },
  });
  if (!event || !event.automaticCertificate) return { issued: 0 };

  const requiredActivities = event.activities.filter((a) => a.requiresAttendance && a.generatesCertificate);
  const requiredIds = new Set(requiredActivities.map((a) => a.id));
  const eligibleRegs = event.registrations.filter((r) => r.status === 'CONFIRMED');
  if (eligibleRegs.length === 0 || requiredIds.size === 0) return { issued: 0 };

  const regIds = eligibleRegs.map((r) => r.id);

  // Uma única rodada de consultas em lote (antes eram 3 por inscrição — N+1).
  const [activityRegs, attendances, existingCerts] = await Promise.all([
    // Só as inscrições em atividades que exigem presença e geram certificado.
    prisma.activityRegistration.findMany({
      where: { registrationId: { in: regIds }, activityId: { in: [...requiredIds] } },
      select: { registrationId: true, activityId: true },
    }),
    prisma.attendance.findMany({
      where: { registrationId: { in: regIds }, activityId: { in: [...requiredIds] } },
      select: { registrationId: true, status: true },
    }),
    prisma.certificate.findMany({
      where: { registrationId: { in: regIds }, activityId: null, status: { not: 'CANCELLED' } },
      select: { registrationId: true },
    }),
  ]);

  // reqCount = atividades exigidas em que o participante está inscrito
  // present  = presenças registradas nessas mesmas atividades
  // (mesma fórmula/regra de antes, apenas calculada em memória)
  const reqCountByReg = new Map();
  for (const ar of activityRegs) {
    reqCountByReg.set(ar.registrationId, (reqCountByReg.get(ar.registrationId) || 0) + 1);
  }
  const presentByReg = new Map();
  for (const at of attendances) {
    if (at.status !== 'PRESENT') continue;
    presentByReg.set(at.registrationId, (presentByReg.get(at.registrationId) || 0) + 1);
  }
  const hasCert = new Set(existingCerts.map((c) => c.registrationId));

  let issued = 0;
  let skipped = 0;
  let notEligible = 0;
  for (const reg of eligibleRegs) {
    // Já possui certificado válido -> não duplica.
    if (hasCert.has(reg.id)) { skipped += 1; continue; }
    const reqCount = reqCountByReg.get(reg.id) || 0;
    const present = presentByReg.get(reg.id) || 0;
    const percentage = reqCount === 0 ? 0 : Math.round((present / reqCount) * 100);
    if (reqCount === 0 || percentage < event.minimumAttendancePercentage) { notEligible += 1; continue; }
    await issueEventCertificate(reg.id);
    issued += 1;
  }
  return { issued, skipped, notEligible };
}

/**
 * Cancela um certificado (ação administrativa). Não apaga: preserva o
 * histórico e notifica o usuário.
 */
export async function cancelCertificate(certificateId, { reason, operatorId = null } = {}) {
  const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!certificate) throw new ApiError(404, 'Certificado não encontrado.');
  if (certificate.status === 'CANCELLED') throw new ApiError(409, 'Este certificado já está cancelado.');

  const updated = await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      status: 'CANCELLED',
      invalidatedAt: new Date(),
      correctionReason: reason ? String(reason).trim() : 'Cancelado pelo administrador',
      correctedById: operatorId || null,
      correctedAt: new Date(),
    },
  });

  await createNotification({
    userId: certificate.userId,
    type: 'CERTIFICATE',
    title: 'Certificado cancelado',
    message: 'Seu certificado foi cancelado pela organização.',
    link: '/certificados',
  });
  await createAuditLog({
    userId: operatorId,
    action: 'CERTIFICATE_CANCELLED',
    resource: 'Certificate',
    resourceId: certificateId,
    details: { reason: reason ? String(reason).trim() : null },
  });
  return updated;
}

/**
 * Corrige um certificado já emitido (erro de digitação).
 * Preserva o histórico: a versão anterior é marcada como CANCELLED (não é
 * apagada) e uma nova versão é emitida, vinculada à original. O usuário é
 * notificado com destaque.
 */
export async function correctCertificate(certificateId, { participantName, eventName, hours, reason, operatorId = null } = {}) {
  const original = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      user: { select: { id: true, name: true } },
      event: { include: { organizer: { select: { name: true } } } },
      activity: true,
    },
  });
  if (!original) throw new ApiError(404, 'Certificado não encontrado.');
  if (original.status === 'CANCELLED' || original.invalidatedAt) {
    throw new ApiError(409, 'Este certificado já foi cancelado/substituído por uma correção.');
  }

  const correctedName = (participantName && String(participantName).trim()) || original.participantName || original.user.name;
  const correctedEvent = (eventName && String(eventName).trim()) || original.eventName || original.event.name;
  const correctedHours =
    hours !== undefined && hours !== null && hours !== '' ? Number(hours) : original.hours;

  const newCertificate = await createCertificate({
    userId: original.userId,
    eventId: original.eventId,
    registrationId: original.registrationId,
    activityId: original.activityId,
    hours: correctedHours,
    participantName: correctedName,
    eventName: correctedEvent,
    eventDate: original.activity?.date || original.event.startDate,
    activityName: original.activity?.name || null,
    responsible: original.event.organizer?.name || null,
    operatorId,
    correctionOfId: original.id,
    storeOverrides: true,
    notificationOverride: {
      title: 'Seu certificado foi corrigido',
      message: `Um administrador corrigiu seu certificado do evento "${correctedEvent}". A versão anterior foi cancelada e uma nova versão corrigida está disponível.`,
      link: '/certificados',
    },
  });

  const previous = await prisma.certificate.update({
    where: { id: original.id },
    data: {
      status: 'CANCELLED',
      invalidatedAt: new Date(),
      correctionReason: reason ? String(reason).trim() : 'Correção de dados',
      correctedById: operatorId || null,
      correctedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: operatorId,
    action: 'CERTIFICATE_CORRECTED',
    resource: 'Certificate',
    resourceId: original.id,
    details: {
      newCertificateId: newCertificate.id,
      newCode: newCertificate.code,
      reason: reason ? String(reason).trim() : null,
    },
  });

  return { previous, certificate: newCertificate };
}


