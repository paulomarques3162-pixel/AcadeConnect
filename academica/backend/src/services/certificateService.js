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
  const existing = registration.certificates.find((c) => c.activityId === null);
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

  const existing = registration.certificates.find((c) => c.activityId === activityId);
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
async function createCertificate({ userId, eventId, registrationId, activityId, hours, participantName, eventName, eventDate, activityName = null, responsible = null, operatorId = null }) {
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
    },
  });

  await createNotification({
    userId,
    type: 'CERTIFICATE',
    title: 'Certificado disponível',
    message: `Seu certificado do evento "${eventName}" está disponível.`,
    link: '/certificados',
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
  let issued = 0;

  for (const reg of event.registrations) {
    if (reg.status !== 'CONFIRMED') continue;
    const requiredIds = new Set(requiredActivities.map((a) => a.id));
    // Only count activities the participant is registered for and that require attendance.
    const ar = await prisma.activityRegistration.findMany({ where: { registrationId: reg.id } });
    const reqCount = ar.filter((x) => requiredIds.has(x.activityId)).length;
    if (reqCount === 0) continue;

    const attendance = await prisma.attendance.findMany({
      where: { registrationId: reg.id, activityId: { in: [...requiredIds] } },
    });
    const present = attendance.filter((a) => a.status === 'PRESENT').length;
    const percentage = Math.round((present / reqCount) * 100);
    if (percentage >= event.minimumAttendancePercentage) {
      const has = await prisma.certificate.findFirst({ where: { registrationId: reg.id, activityId: null } });
      if (!has) {
        await issueEventCertificate(reg.id);
        issued += 1;
      }
    }
  }
  return { issued };
}


