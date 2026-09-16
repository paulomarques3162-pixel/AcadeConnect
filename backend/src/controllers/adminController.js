import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { hashPassword } from '../utils/bcryptPool.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { createAuditLog } from '../services/auditLogService.js';
import { invalidateUserCache } from '../middlewares/auth.js';
import { broadcastToAllUsers } from '../services/notificationService.js';
import { cacheWrap, invalidate } from '../utils/cache.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { env } from '../config/env.js';

const DASHBOARD_CACHE_KEY = 'admin:dashboard';

/**
 * Dashboard with REAL data from the database (no fake numbers).
 * Cached briefly: this endpoint runs several aggregates and is opened on every
 * admin page load; concurrent admins would otherwise repeat identical queries.
 */
export const dashboard = asyncHandler(async (req, res) => {
  const data = await cacheWrap(DASHBOARD_CACHE_KEY, env.dashboardCacheTtlMs, buildDashboard);
  return apiResponse(res, { message: 'Dashboard.', data });
});

async function buildDashboard() {
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

  return {
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
  };
}

// ---------- User management (ADMIN) ----------

export const listUsers = asyncHandler(async (req, res) => {
  const { search, role } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
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
      skip,
      take,
    }),
  ]);
  return apiResponse(res, {
    message: 'Usuários.',
    data: { users: users.map((u) => ({ ...u, avatarUrl: publicUrl(u.avatarUrl) })) },
    meta: paginationMeta({ page, limit, total }),
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
      passwordHash: await hashPassword(password),
      role: role || 'PARTICIPANT',
    },
    select: { id: true, name: true, email: true, role: true },
  });
  invalidate(DASHBOARD_CACHE_KEY);
  await createAuditLog({ userId: req.user.id, action: 'USER_CREATED', resource: 'User', resourceId: user.id, ip: req.ip });
  return apiResponse(res, { status: 201, message: 'Usuário criado.', data: { user } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, role, password, course, phone } = req.body;
  const data = { name, email, role, course, phone };
  if (password) data.passwordHash = await hashPassword(password);
  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, course: true },
  });
  invalidateUserCache(id);
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
  invalidateUserCache(id);
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
  // Whitelist writable scalar fields (never forward the raw body to Prisma).
  const data = {};
  for (const f of ['name', 'cnpj', 'description', 'logoUrl']) {
    if (req.body[f] !== undefined) data[f] = req.body[f] === '' ? null : req.body[f];
  }
  const institution = await prisma.institution.update({ where: { id }, data });
  await createAuditLog({ userId: req.user.id, action: 'INSTITUTION_UPDATED', resource: 'Institution', resourceId: id, ip: req.ip });
  return apiResponse(res, { message: 'Instituição atualizada.', data: { institution } });
});

export const deleteInstitution = asyncHandler(async (req, res) => {
  await prisma.institution.delete({ where: { id: req.params.id } });
  await createAuditLog({ userId: req.user.id, action: 'INSTITUTION_DELETED', resource: 'Institution', resourceId: req.params.id, ip: req.ip });
  return apiResponse(res, { message: 'Instituição excluída.' });
});

// ---------- Audit logs (ADMIN) ----------

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { action } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
  const where = {};
  if (action) where.action = action;
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return apiResponse(res, {
    message: 'Logs de auditoria.',
    data: { logs },
    meta: paginationMeta({ page, limit, total }),
  });
});

// ---------- Admin registrations list ----------

export const listAllRegistrations = asyncHandler(async (req, res) => {
  const { eventId, search, status } = req.query;
  // The admin "ver inscritos" modal asks for limit=500, so this endpoint gets a
  // higher ceiling than the other admin lists.
  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 500 });
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
      skip,
      take,
    }),
  ]);
  return apiResponse(res, {
    message: 'Inscrições.',
    data: { registrations },
    meta: paginationMeta({ page, limit, total }),
  });
});

// ---------- General communication ----------

/**
 * Send a general communication to every active user (e.g. "O AcadeConnect foi
 * atualizado"). In-app notification + realtime push. Admin only.
 */
export const broadcastNotification = asyncHandler(async (req, res) => {
  const { title, message, link, requestId } = req.body;
  const result = await broadcastToAllUsers({ title, message, link, requestId });

  if (!result.duplicate) {
    await createAuditLog({
      userId: req.user.id,
      action: 'GENERAL_BROADCAST',
      resource: 'Notification',
      details: { title, recipients: result.recipients },
    });
  }

  return apiResponse(res, {
    message: result.duplicate
      ? 'Esta comunicação já foi enviada há instantes.'
      : `Comunicação enviada para ${result.recipients} usuário(s).`,
    data: result,
  });
});
