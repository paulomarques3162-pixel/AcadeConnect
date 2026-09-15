import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { slugify } from '../utils/codes.js';
import { parseDate } from '../utils/date.js';
import { createAuditLog } from '../services/auditLogService.js';

const include = {
  speaker: true,
  event: { select: { id: true, name: true, slug: true, status: true } },
  _count: { select: { registrations: true, attendance: true } },
};

function enrich(a) {
  if (a.imageUrl) a.imageUrl = publicUrl(a.imageUrl);
  return a;
}

export const listActivities = asyncHandler(async (req, res) => {
  const { eventId } = req.query;
  const { id } = req.params;
  const where = {};
  if (eventId) where.eventId = eventId;
  if (id) where.eventId = id;

  const activities = await prisma.activity.findMany({
    where,
    include,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    // Bounded: an event cannot return an unbounded activity list.
    take: Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000),
  });
  return apiResponse(res, { message: 'Atividades.', data: { activities: activities.map(enrich) } });
});

export const getActivity = asyncHandler(async (req, res) => {
  const activity = await prisma.activity.findUnique({ where: { id: req.params.id }, include });
  if (!activity) throw new ApiError(404, 'Atividade não encontrada.');
  return apiResponse(res, { message: 'Atividade.', data: { activity: enrich(activity) } });
});

export const createActivity = asyncHandler(async (req, res) => {
  const body = req.body;
  const image = req.file?.filename || null;

  const event = await prisma.event.findUnique({ where: { id: body.eventId } });
  if (!event) throw new ApiError(404, 'Evento não encontrado.');

  const activity = await prisma.activity.create({
    data: {
      eventId: body.eventId,
      name: body.name,
      slug: slugify(body.name),
      description: body.description || null,
      type: body.type || 'OUTRO',
      date: parseDate(body.date),
      startTime: body.startTime,
      endTime: body.endTime,
      location: body.location || null,
      capacity: body.capacity ? Number(body.capacity) : null,
      speakerId: body.speakerId || null,
      imageUrl: image,
      status: body.status || 'SCHEDULED',
      allowsRegistration: body.allowsRegistration ?? true,
      requiresAttendance: body.requiresAttendance ?? true,
      generatesCertificate: body.generatesCertificate ?? true,
    },
    include,
  });

  await createAuditLog({ userId: req.user.id, action: 'ACTIVITY_CREATED', resource: 'Activity', resourceId: activity.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Atividade criada.', data: { activity: enrich(activity) } });
});

export const updateActivity = asyncHandler(async (req, res) => {
  const body = req.body;
  const image = req.file?.filename || null;

  // Pick only the writable scalar fields. The frontend sends back the full
  // activity object (including the nested `speaker` / `event` relation objects
  // returned by GET). Passing those to Prisma's update() raises a
  // PrismaClientValidationError, which silently discards the whole save
  // (notably date / startTime / endTime). Whitelisting scalars fixes it.
  const data = {};
  const writableFields = [
    'name', 'slug', 'description', 'type', 'date', 'startTime', 'endTime',
    'location', 'capacity', 'speakerId', 'status',
    'allowsRegistration', 'requiresAttendance', 'generatesCertificate',
  ];
  for (const f of writableFields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (image) data.imageUrl = image;
  if (data.date) data.date = parseDate(data.date);
  if (data.capacity !== undefined) data.capacity = data.capacity ? Number(data.capacity) : null;
  if (data.speakerId === '') data.speakerId = null;

  const activity = await prisma.activity.update({
    where: { id: req.params.id },
    data,
    include,
  });
  await createAuditLog({ userId: req.user.id, action: 'ACTIVITY_UPDATED', resource: 'Activity', resourceId: activity.id, ip: req.ip });
  return apiResponse(res, { message: 'Atividade atualizada.', data: { activity: enrich(activity) } });
});

export const closeActivity = asyncHandler(async (req, res) => {
  const existing = await prisma.activity.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, 'Atividade não encontrada.');

  const activity = await prisma.activity.update({
    where: { id: req.params.id },
    data: { status: 'FINISHED', allowsRegistration: false },
    include,
  });
  await createAuditLog({ userId: req.user.id, action: 'ACTIVITY_CLOSED', resource: 'Activity', resourceId: activity.id, ip: req.ip });
  return apiResponse(res, { message: 'Atividade encerrada.', data: { activity: enrich(activity) } });
});

export const deleteActivity = asyncHandler(async (req, res) => {
  await prisma.activity.delete({ where: { id: req.params.id } });
  await createAuditLog({ userId: req.user.id, action: 'ACTIVITY_DELETED', resource: 'Activity', resourceId: req.params.id, ip: req.ip });
  return apiResponse(res, { message: 'Atividade excluída.' });
});

export const duplicateActivity = asyncHandler(async (req, res) => {
  const src = await prisma.activity.findUnique({ where: { id: req.params.id } });
  if (!src) throw new ApiError(404, 'Atividade não encontrada.');
  const copy = await prisma.activity.create({
    data: {
      eventId: src.eventId,
      name: `${src.name} (cópia)`,
      slug: slugify(`${src.name}-copia`),
      description: src.description,
      type: src.type,
      date: src.date,
      startTime: src.startTime,
      endTime: src.endTime,
      location: src.location,
      capacity: src.capacity,
      speakerId: src.speakerId,
      imageUrl: src.imageUrl,
      status: 'SCHEDULED',
      allowsRegistration: src.allowsRegistration,
      requiresAttendance: src.requiresAttendance,
      generatesCertificate: src.generatesCertificate,
    },
    include,
  });
  return apiResponse(res, { status: 201, message: 'Atividade duplicada.', data: { activity: copy } });
});
