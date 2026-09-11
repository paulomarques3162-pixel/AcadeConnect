import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { createAuditLog } from '../services/auditLogService.js';

const select = {
  id: true, name: true, email: true, specialty: true, bio: true, photoUrl: true, institutionId: true,
};

function enrich(s) {
  if (s.photoUrl) s.photoUrl = publicUrl(s.photoUrl);
  return s;
}

export const listSpeakers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const speakers = await prisma.speaker.findMany({
    where: search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { specialty: { contains: search, mode: 'insensitive' } }] }
      : undefined,
    select,
    orderBy: { name: 'asc' },
  });
  return apiResponse(res, { message: 'Palestrantes.', data: { speakers: speakers.map(enrich) } });
});

export const getSpeaker = asyncHandler(async (req, res) => {
  const speaker = await prisma.speaker.findUnique({
    where: { id: req.params.id },
    select: { ...select, activities: { include: { event: { select: { name: true } } } } },
  });
  if (!speaker) throw new ApiError(404, 'Palestrante não encontrado.');
  return apiResponse(res, { message: 'Palestrante.', data: { speaker: enrich(speaker) } });
});

export const createSpeaker = asyncHandler(async (req, res) => {
  const body = req.body;
  const photo = req.file?.filename || null;
  const speaker = await prisma.speaker.create({
    data: {
      name: body.name,
      email: body.email || null,
      specialty: body.specialty || null,
      bio: body.bio || null,
      photoUrl: photo,
      institutionId: body.institutionId || null,
    },
    select,
  });
  await createAuditLog({ userId: req.user.id, action: 'SPEAKER_CREATED', resource: 'Speaker', resourceId: speaker.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Palestrante criado.', data: { speaker: enrich(speaker) } });
});

export const updateSpeaker = asyncHandler(async (req, res) => {
  const body = req.body;
  const photo = req.file?.filename || null;
  const data = { ...body };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  if (photo) data.photoUrl = photo;
  const speaker = await prisma.speaker.update({ where: { id: req.params.id }, data, select });
  await createAuditLog({ userId: req.user.id, action: 'SPEAKER_UPDATED', resource: 'Speaker', resourceId: speaker.id, ip: req.ip });
  return apiResponse(res, { message: 'Palestrante atualizado.', data: { speaker: enrich(speaker) } });
});

export const deleteSpeaker = asyncHandler(async (req, res) => {
  await prisma.speaker.delete({ where: { id: req.params.id } });
  await createAuditLog({ userId: req.user.id, action: 'SPEAKER_DELETED', resource: 'Speaker', resourceId: req.params.id, ip: req.ip });
  return apiResponse(res, { message: 'Palestrante excluído.' });
});
