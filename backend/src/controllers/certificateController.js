import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { issueEventCertificate, issueActivityCertificate, autoIssueCertificatesForEvent } from '../services/certificateService.js';
import { createAuditLog } from '../services/auditLogService.js';
import fs from 'node:fs';
import path from 'node:path';

const certInclude = {
  event: { select: { id: true, name: true, startDate: true, institution: { select: { name: true } } } },
  activity: { select: { id: true, name: true } },
};

export const getMyCertificates = asyncHandler(async (req, res) => {
  const certificates = await prisma.certificate.findMany({
    where: { userId: req.user.id },
    include: certInclude,
    orderBy: { issueDate: 'desc' },
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

  return apiResponse(res, {
    message: 'Certificado válido.',
    data: {
      valid: true,
      code: certificate.code,
      participantName: certificate.user.name,
      eventName: certificate.event.name,
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
  const { search, eventId, status, page = 1, limit = 20 } = req.query;
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
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return apiResponse(res, {
    message: 'Certificados.',
    data: { certificates: certificates.map((c) => ({ ...c, pdfUrl: c.pdfUrl ? `${env.apiUrl}/uploads/${c.pdfUrl}` : null })) },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
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

export const runAutoIssue = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const result = await autoIssueCertificatesForEvent(eventId);
  return apiResponse(res, { message: 'Geração automática concluída.', data: result });
});
