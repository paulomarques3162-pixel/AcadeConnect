import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { slugify, generateRegistrationCode } from '../utils/codes.js';
import { parseDate } from '../utils/date.js';
import { createAuditLog } from '../services/auditLogService.js';
import { autoIssueCertificatesForEvent } from '../services/certificateService.js';

const eventInclude = (includeStats = false) => ({
  institution: { select: { id: true, name: true } },
  organizer: { select: { id: true, name: true } },
  ...(includeStats
    ? {
        _count: {
          select: {
            activities: true,
            registrations: true,
            attendance: true,
            certificates: true,
          },
        },
      }
    : { _count: { select: { activities: true, registrations: true } } }),
});

function enrichEvent(e) {
  if (e.bannerUrl) e.bannerUrl = publicUrl(e.bannerUrl);
  return e;
}

/** FormData sends booleans as strings ("true"/"false"); normalize both cases. */
function toBool(value) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'on', 'yes'].includes(String(value).toLowerCase());
}

/** Convert an optional numeric form field: '' / null -> null, otherwise Number. */
function toNumberOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

export const listEvents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    search = '',
    category,
    modality,
    status,
    location,
    date,
    sort = 'recent',
  } = req.query;

  const where = { deletedAt: null };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (category) where.category = category;
  if (modality) where.modality = modality;
  if (status) where.status = status;
  if (location) where.location = { contains: location, mode: 'insensitive' };
  if (date === 'upcoming') where.startDate = { gte: new Date() };
  if (date === 'past') where.endDate = { lt: new Date() };

  const orderBy =
    sort === 'closest'
      ? { startDate: 'asc' }
      : sort === 'popular'
        ? { registrations: { _count: 'desc' } }
        : { createdAt: 'desc' };

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: eventInclude(),
    }),
  ]);

  return apiResponse(res, {
    message: 'Eventos listados.',
    data: { events: events.map(enrichEvent) },
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getEvent = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const event = await prisma.event.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      deletedAt: null,
    },
    include: {
      institution: true,
      organizer: { select: { id: true, name: true } },
      activities: {
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        include: { speaker: true, _count: { select: { registrations: true, attendance: true } } },
      },
      _count: { select: { activities: true, registrations: true, attendance: true } },
    },
  });
  if (!event) throw new ApiError(404, 'Evento não encontrado.');

  const totalRegistered = event._count.registrations;
  return apiResponse(res, {
    message: 'Evento.',
    data: {
      ...enrichEvent(event),
      _count: { ...event._count },
      capacityProgress: event.capacity ? Math.min(100, Math.round((totalRegistered / event.capacity) * 100)) : null,
    },
  });
});

// ---------- Admin / Organizer operations ----------

export const createEvent = asyncHandler(async (req, res) => {
  const body = req.body;
  const banner = req.file?.filename || null;

  // Ensure unique slug
  let slug = slugify(body.name || body.slug);
  if (!slug) throw new ApiError(422, 'Informe um nome para o evento.');
  let candidate = slug;
  let n = 1;
  while (await prisma.event.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${n}`;
    n += 1;
  }

  const organizerId = req.user.role === 'ADMIN' ? body.organizerId || req.user.id : req.user.id;

  const event = await prisma.event.create({
    data: {
      name: body.name,
      slug: candidate,
      shortDescription: body.shortDescription || null,
      description: body.description || null,
      bannerUrl: banner,
      startDate: parseDate(body.startDate),
      endDate: parseDate(body.endDate),
      startTime: body.startTime || null,
      location: body.location || null,
      address: body.address || null,
      modality: body.modality || 'PRESENCIAL',
      category: body.category || null,
      capacity: body.capacity ? Number(body.capacity) : null,
      registrationStart: body.registrationStart ? parseDate(body.registrationStart) : new Date(),
      registrationEnd: body.registrationEnd ? parseDate(body.registrationEnd, { endOfDay: true }) : null,
      status: body.status || 'DRAFT',
      allowRegistration: body.allowRegistration ?? true,
      allowCancellation: body.allowCancellation ?? true,
      requireActivityRegistration: body.requireActivityRegistration ?? false,
      requireAttendance: body.requireAttendance ?? true,
      automaticCertificate: body.automaticCertificate ?? false,
      minimumAttendancePercentage: Number(body.minimumAttendancePercentage ?? 75),
      certificateHours: Number(body.certificateHours ?? 8),
      institutionId: body.institutionId || null,
      organizerId,
    },
    include: eventInclude(),
  });

  await createAuditLog({ userId: req.user.id, action: 'EVENT_CREATED', resource: 'Event', resourceId: event.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Evento criado com sucesso.', data: { event: enrichEvent(event) } });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const banner = req.file?.filename || null;

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Evento não encontrado.');

  // Whitelist only the writable scalar columns. The frontend edits send back
  // the full event object returned by GET (with nested `institution`,
  // `organizer`, `activities`, `_count`, `capacityProgress`, timestamps...).
  // Passing those nested/relation values to Prisma's update() raises a
  // PrismaClientValidationError and silently discards the whole save — which is
  // exactly why event edits (dates, times, text) were not persisted before.
  const data = {};

  const textFields = ['name', 'shortDescription', 'description', 'startTime', 'location', 'address', 'modality', 'category', 'status'];
  for (const f of textFields) {
    if (body[f] !== undefined) data[f] = body[f] === '' ? null : body[f];
  }

  if (body.startDate !== undefined) {
    const d = parseDate(body.startDate);
    if (!d) throw new ApiError(422, 'Data inicial inválida.');
    data.startDate = d;
  }
  if (body.endDate !== undefined) {
    const d = parseDate(body.endDate);
    if (!d) throw new ApiError(422, 'Data final inválida.');
    data.endDate = d;
  }
  if (body.registrationStart !== undefined) {
    data.registrationStart = body.registrationStart ? parseDate(body.registrationStart) : null;
  }
  if (body.registrationEnd !== undefined) {
    data.registrationEnd = body.registrationEnd ? parseDate(body.registrationEnd, { endOfDay: true }) : null;
  }

  if (body.capacity !== undefined) data.capacity = toNumberOrNull(body.capacity);
  if (body.minimumAttendancePercentage !== undefined) data.minimumAttendancePercentage = toNumberOrNull(body.minimumAttendancePercentage);
  if (body.certificateHours !== undefined) data.certificateHours = toNumberOrNull(body.certificateHours);

  for (const f of ['allowRegistration', 'allowCancellation', 'requireActivityRegistration', 'requireAttendance', 'automaticCertificate']) {
    if (body[f] !== undefined) data[f] = toBool(body[f]);
  }

  if (body.institutionId !== undefined) data.institutionId = body.institutionId || null;
  // Only an ADMIN may reassign the organizer; organizers keep ownership of their events.
  if (body.organizerId !== undefined && req.user.role === 'ADMIN') data.organizerId = body.organizerId || null;
  if (banner) data.bannerUrl = banner;

  // Regenerate the slug from the (possibly new) name, keeping it unique.
  if (data.name && data.name !== existing.name) {
    const base = slugify(data.name) || existing.slug;
    let candidate = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (true) {
      const clash = await prisma.event.findUnique({ where: { slug: candidate } });
      if (!clash || clash.id === id) break;
      candidate = `${base}-${n}`;
      n += 1;
    }
    data.slug = candidate;
  }

  const event = await prisma.event.update({
    where: { id },
    data,
    include: eventInclude(),
  });

  await createAuditLog({ userId: req.user.id, action: 'EVENT_UPDATED', resource: 'Event', resourceId: id, ip: req.ip });
  return apiResponse(res, { message: 'Evento atualizado com sucesso.', data: { event: enrichEvent(event) } });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Soft delete: keep relational data but hide the event.
  const event = await prisma.event.update({
    where: { id },
    data: { status: 'CANCELLED', deletedAt: new Date() },
  });
  await createAuditLog({ userId: req.user.id, action: 'EVENT_DELETED', resource: 'Event', resourceId: id, ip: req.ip });
  return apiResponse(res, { message: 'Evento desativado.', data: { id: event.id } });
});

export const hardDeleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.event.delete({ where: { id } });
  await createAuditLog({ userId: req.user.id, action: 'EVENT_HARD_DELETED', resource: 'Event', resourceId: id, ip: req.ip });
  return apiResponse(res, { message: 'Evento excluído permanentemente.' });
});

export const duplicateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const src = await prisma.event.findUnique({
    where: { id },
    include: { activities: { include: { speaker: true } } },
  });
  if (!src) throw new ApiError(404, 'Evento não encontrado.');

  let slug = slugify(`${src.name}-copia`);
  let candidate = slug;
  let n = 1;
  while (await prisma.event.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${n}`;
    n += 1;
  }

  const copy = await prisma.event.create({
    data: {
      name: `${src.name} (cópia)`,
      slug: candidate,
      shortDescription: src.shortDescription,
      description: src.description,
      bannerUrl: src.bannerUrl,
      startDate: src.startDate,
      endDate: src.endDate,
      startTime: src.startTime,
      location: src.location,
      address: src.address,
      modality: src.modality,
      category: src.category,
      capacity: src.capacity,
      registrationStart: src.registrationStart,
      registrationEnd: src.registrationEnd,
      status: 'DRAFT',
      allowRegistration: src.allowRegistration,
      allowCancellation: src.allowCancellation,
      requireActivityRegistration: src.requireActivityRegistration,
      requireAttendance: src.requireAttendance,
      automaticCertificate: src.automaticCertificate,
      minimumAttendancePercentage: src.minimumAttendancePercentage,
      certificateHours: src.certificateHours,
      institutionId: src.institutionId,
      organizerId: req.user.id,
      activities: {
        create: src.activities.map((a) => ({
          name: a.name,
          slug: a.slug,
          description: a.description,
          type: a.type,
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          location: a.location,
          capacity: a.capacity,
          speakerId: a.speakerId,
          imageUrl: a.imageUrl,
          status: 'SCHEDULED',
          allowsRegistration: a.allowsRegistration,
          requiresAttendance: a.requiresAttendance,
          generatesCertificate: a.generatesCertificate,
        })),
      },
    },
  });

  await createAuditLog({ userId: req.user.id, action: 'EVENT_DUPLICATED', resource: 'Event', resourceId: copy.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Evento duplicado com sucesso.', data: { event: copy } });
});

export const closeEventAndIssueCertificates = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const event = await prisma.event.update({ where: { id }, data: { status: 'CLOSED', allowRegistration: false } });
  const result = await autoIssueCertificatesForEvent(id);
  await createAuditLog({ userId: req.user.id, action: 'EVENT_CLOSED', resource: 'Event', resourceId: id, details: result, ip: req.ip });
  return apiResponse(res, { message: 'Evento encerrado.', data: { event, certificatesIssued: result.issued } });
});

export { generateRegistrationCode };
