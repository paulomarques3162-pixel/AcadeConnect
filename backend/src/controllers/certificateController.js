import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { issueEventCertificate, issueActivityCertificate, autoIssueCertificatesForEvent, correctCertificate as correctCertificateService, cancelCertificate as cancelCertificateService, cancelCertificatesForPresentParticipants } from '../services/certificateService.js';
import { createAuditLog } from '../services/auditLogService.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import fs from 'node:fs';
import path from 'node:path';

const certInclude = {
  event: { select: { id: true, name: true, startDate: true, institution: { select: { name: true } } } },
  activity: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
};

// Lean projection for the "my certificates" LIST. The card renders event name,
// activity name, code, hours and status — it does not need the institution, the
// participant relation (it IS the requester) nor the registration. The detail
// route keeps the full `certInclude`.
const certListInclude = {
  event: { select: { id: true, name: true } },
  activity: { select: { id: true, name: true } },
};

export const getMyCertificates = asyncHandler(async (req, res) => {
  const take = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const certificates = await prisma.certificate.findMany({
    where: { userId: req.user.id },
    include: certListInclude,
    orderBy: { issueDate: 'desc' },
    take,
  });
  return apiResponse(res, {
    message: 'Meus certificados.',
    data: {
      certificates: certificates.map((c) => ({ ...c, pdfUrl: c.pdfUrl ? `${env.apiUrl}/uploads/${c.pdfUrl}` : null })),
    },
  });
});

export const getCertificate = asyncHandler(async (req, res) => {
  const certificate = await prisma.certificate.findUnique({
    where: { id: req.params.id },
    include: { ...certInclude, registration: { select: { code: true } }, user: { select: { id: true, name: true } } },
  });
  if (!certificate) throw new ApiError(404, 'Certificado não encontrado.');
  const isOwner = certificate.userId === req.user.id;
  if (!isOwner && !['ADMIN', 'ORGANIZER'].includes(req.user.role)) throw new ApiError(403, 'Sem permissão.');

  const validationUrl = `${env.appUrl}/validar-certificado?codigo=${certificate.code}`;
  return apiResponse(res, {
    message: 'Certificado.',
    data: {
      ...certificate,
      pdfUrl: certificate.pdfUrl ? `${env.apiUrl}/uploads/${certificate.pdfUrl}` : null,
      validationUrl,
    },
  });
});

export const downloadCertificatePdf = asyncHandler(async (req, res) => {
  const certificate = await prisma.certificate.findUnique({ where: { id: req.params.id } });
  if (!certificate) throw new ApiError(404, 'Certificado não encontrado.');
  if (certificate.userId !== req.user.id && !['ADMIN', 'ORGANIZER'].includes(req.user.role)) {
    throw new ApiError(403, 'Sem permissão.');
  }
  if (!certificate.pdfUrl) throw new ApiError(404, 'PDF não gerado para este certificado.');
  const filePath = path.resolve(env.uploadDir, certificate.pdfUrl);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Arquivo não encontrado.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${certificate.pdfUrl}"`);
  fs.createReadStream(filePath).pipe(res);
});

/**
 * PUBLIC certificate validation. Shows only minimal, non-sensitive data.
 */
export const validateCertificate = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const certificate = await prisma.certificate.findUnique({
    where: { code: String(code).toUpperCase().trim() },
    include: {
      event: { select: { id: true, name: true, startDate: true, institution: { select: { name: true } } } },
      user: { select: { name: true } },
      activity: { select: { name: true } },
    },
  });
  if (!certificate) throw new ApiError(404, 'Certificado não encontrado. Verifique o código.');
  if (certificate.status === 'CANCELLED') {
    throw new ApiError(
      409,
      'Este certificado foi cancelado e substituído por uma versão corrigida. Verifique o código da versão mais recente.'
    );
  }

  return apiResponse(res, {
    message: 'Certificado válido.',
    data: {
      valid: true,
      code: certificate.code,
      // Em certificados corrigidos, usa os dados corrigidos (override).
      participantName: certificate.participantName || certificate.user.name,
      eventName: certificate.eventName || certificate.event.name,
      institutionName: certificate.event.institution?.name || null,
      activityName: certificate.activity?.name || null,
      hours: certificate.hours,
      date: certificate.event.startDate,
      issueDate: certificate.issueDate,
    },
  });
});

// ---------- Admin ----------

export const listCertificates = asyncHandler(async (req, res) => {
  const { search, eventId, status } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
  const where = {};
  if (eventId) where.eventId = eventId;
  if (status) where.status = status;
  if (search) {
    where.user = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] };
  }
  const [total, certificates] = await Promise.all([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where,
      include: { ...certInclude, user: { select: { id: true, name: true, email: true } }, registration: { select: { code: true } } },
      orderBy: { issueDate: 'desc' },
      skip,
      take,
    }),
  ]);
  return apiResponse(res, {
    message: 'Certificados.',
    data: { certificates: certificates.map((c) => ({ ...c, pdfUrl: c.pdfUrl ? `${env.apiUrl}/uploads/${c.pdfUrl}` : null })) },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const issueCertificate = asyncHandler(async (req, res) => {
  const { registrationId, activityId, force } = req.body;
  let certificate;
  if (activityId) {
    certificate = await issueActivityCertificate(registrationId, activityId, { operatorId: req.user.id, force: !!force });
  } else {
    certificate = await issueEventCertificate(registrationId, { operatorId: req.user.id, force: !!force });
  }
  return apiResponse(res, { status: 201, message: 'Certificado emitido com sucesso.', data: { certificate } });
});

export const cancelCertificate = asyncHandler(async (req, res) => {
  const certificate = await cancelCertificateService(req.params.id, {
    reason: req.body.reason,
    operatorId: req.user.id,
  });
  return apiResponse(res, { message: 'Certificado cancelado.', data: { certificate } });
});

/**
 * Bulk-cancel the event-level certificates of all present participants of an
 * event. Used by the admin certificates screen. Returns how many were affected.
 */
export const bulkCancelPresent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const result = await cancelCertificatesForPresentParticipants(eventId, {
    reason: req.body?.reason,
    operatorId: req.user.id,
  });
  return apiResponse(res, {
    message:
      result.affected > 0
        ? `${result.affected} certificado(s) cancelado(s).`
        : 'Nenhum certificado ativo para cancelar entre os participantes presentes.',
    data: result,
  });
});

export const runAutoIssue = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const result = await autoIssueCertificatesForEvent(eventId);
  return apiResponse(res, { message: 'Geração automática concluída.', data: result });
});

/**
 * Corrige um certificado emitido (erro de digitação). Cancela a versão anterior
 * (sem apagar) e emite uma nova, notificando o usuário.
 */
export const correctCertificate = asyncHandler(async (req, res) => {
  const result = await correctCertificateService(req.params.id, {
    participantName: req.body.participantName,
    eventName: req.body.eventName,
    hours: req.body.hours,
    reason: req.body.reason,
    operatorId: req.user.id,
  });
  return apiResponse(res, {
    status: 201,
    message: 'Certificado corrigido. A versão anterior foi cancelada e uma nova versão foi emitida.',
    data: result,
  });
});
