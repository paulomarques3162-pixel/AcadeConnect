import { prisma } from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * Dashboard with REAL data from the database (no fake numbers).
 */
export const dashboard = asyncHandler(async (req, res) => {
  const [
    events,
    participants,
    registrations,
    attendance,
    certificates,
    activities,
    activeEvents,
  ] = await Promise.all([
    prisma.event.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.registration.count(),
    prisma.attendance.count(),
    prisma.certificate.count(),
    prisma.activity.count(),
    prisma.event.count({ where: { deletedAt: null, status: { in: ['PUBLISHED', 'OPEN', 'ONGOING'] } } }),
  ]);

  // Registrations per day (last 14 days)
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const regsPerDay = await prisma.registration.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const byDay = {};
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }
  for (const r of regsPerDay) {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (key in byDay) byDay[key] += 1;
  }

  // Attendance by event
  const attendanceByEvent = await prisma.attendance.groupBy({
    by: ['eventId'],
    _count: { _all: true },
  });
  const eventNames = await prisma.event.findMany({ select: { id: true, name: true } });
  const nameMap = Object.fromEntries(eventNames.map((e) => [e.id, e.name]));

  // Participants per activity
  const participantsPerActivity = await prisma.activityRegistration.groupBy({
    by: ['activityId'],
    _count: { _all: true },
  });
  const activityNames = await prisma.activity.findMany({ select: { id: true, name: true } });
  const activityNameMap = Object.fromEntries(activityNames.map((a) => [a.id, a.name]));

  // Certificates by status
  const certByStatus = await prisma.certificate.groupBy({ by: ['status'], _count: { _all: true } });

  // Recent activity (from audit logs)
  const recentActivity = await prisma.auditLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  });

  return apiResponse(res, {
    message: 'Dashboard.',
    data: {
      stats: {
        activeEvents,
        totalEvents: events,
        participants,
        registrations,
        attendance,
        certificates,
        activities,
      },
      charts: {
        registrationsPerDay: Object.entries(byDay).map(([date, count]) => ({ date, count })),
        attendanceByEvent: attendanceByEvent.map((x) => ({ name: nameMap[x.eventId] || 'Evento', count: x._count._all })),
        participantsPerActivity: participantsPerActivity.map((x) => ({ name: activityNameMap[x.activityId] || 'Atividade', count: x._count._all })).sort((a, b) => b.count - a.count).slice(0, 10),
        certificatesByStatus: certByStatus.map((x) => ({ status: x.status, count: x._count._all })),
      },
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        user: a.user?.name || 'Sistema',
        resource: a.resource,
        createdAt: a.createdAt,
      })),
    },
  });
});

// ---------- User management (ADMIN) ----------

export const listUsers = asyncHandler(async (req, res) => {
  const { search, role, page = 1, limit = 20 } = req.query;
  const where = { deletedAt: null };
  if (role) where.role = role;
  if (search) {
    where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
  }
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, course: true, phone: true, avatarUrl: true,
        lastLoginAt: true, createdAt: true, institutionId: true,
        _count: { select: { registrations: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return apiResponse(res, {
    message: 'Usuários.',
    data: { users: users.map((u) => ({ ...u, avatarUrl: publicUrl(u.avatarUrl) })) },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const exists = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (exists) throw new ApiError(409, 'E-mail já cadastrado.');
  const user = await prisma.user.create({
    data: {
      name,
      email: String(email).toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password, 12),
      role: role || 'PARTICIPANT',
    },
    select: { id: true, name: true, email: true, role: true },
  });
  await createAuditLog({ userId: req.user.id, action: 'USER_CREATED', resource: 'User', resourceId: user.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Usuário criado.', data: { user } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, role, password, course, phone } = req.body;
  const data = { name, email, role, course, phone };
  if (password) data.passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, course: true },
  });
  await createAuditLog({ userId: req.user.id, action: 'USER_UPDATED', resource: 'User', resourceId: id, details: { role }, ip: req.ip });
  return apiResponse(res, { message: 'Usuário atualizado.', data: { user } });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) throw new ApiError(400, 'Você não pode excluir a própria conta.');
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), email: `deleted-${id.slice(-8)}@removido.local`, name: 'Usuário removido' },
  });
  await createAuditLog({ userId: req.user.id, action: 'USER_DELETED', resource: 'User', resourceId: id, ip: req.ip });
  return apiResponse(res, { message: 'Usuário desativado.' });
});

// ---------- Institutions (ADMIN) ----------

export const listInstitutions = asyncHandler(async (req, res) => {
  const institutions = await prisma.institution.findMany({ include: { _count: { select: { events: true, users: true } } }, orderBy: { name: 'asc' } });
  return apiResponse(res, { message: 'Instituições.', data: { institutions } });
});

export const createInstitution = asyncHandler(async (req, res) => {
  const { name, cnpj, description } = req.body;
  const institution = await prisma.institution.create({ data: { name, cnpj: cnpj || null, description: description || null } });
  await createAuditLog({ userId: req.user.id, action: 'INSTITUTION_CREATED', resource: 'Institution', resourceId: institution.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Instituição criada.', data: { institution } });
});

export const updateInstitution = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const institution = await prisma.institution.update({ where: { id }, data: req.body });
  return apiResponse(res, { message: 'Instituição atualizada.', data: { institution } });
});

export const deleteInstitution = asyncHandler(async (req, res) => {
  await prisma.institution.delete({ where: { id: req.params.id } });
  await createAuditLog({ userId: req.user.id, action: 'INSTITUTION_DELETED', resource: 'Institution', resourceId: req.params.id, ip: req.ip });
  return apiResponse(res, { message: 'Instituição excluída.' });
});

// ---------- Audit logs (ADMIN) ----------

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, page = 1, limit = 20 } = req.query;
  const where = {};
  if (action) where.action = action;
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return apiResponse(res, {
    message: 'Logs de auditoria.',
    data: { logs },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ---------- Admin registrations list ----------

export const listAllRegistrations = asyncHandler(async (req, res) => {
  const { eventId, search, status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (eventId) where.eventId = eventId;
  if (status) where.status = status;
  if (search) {
    where.user = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] };
  }
  const { from, to } = req.query;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  const [total, registrations] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, course: true } },
        event: { select: { id: true, name: true } },
        _count: { select: { attendance: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return apiResponse(res, {
    message: 'Inscrições.',
    data: { registrations },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});
