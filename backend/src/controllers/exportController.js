import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toCsv, toXlsx } from '../utils/export.js';
import { createAuditLog } from '../services/auditLogService.js';

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/**
 * Generic data export (CSV or XLSX) with filters.
 * POST /api/admin/export/:type
 * body: { format, eventId, activityId, status, search }
 */
export const exportData = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { format = 'csv', eventId, activityId, status, search, from, to } = req.body;
  const fmt = String(format).toLowerCase();
  if (!['csv', 'xlsx'].includes(fmt)) throw new ApiError(422, 'Formato inválido. Use csv ou xlsx.');

  const dateFilter = {};
  if (from && to) {
    dateFilter.gte = new Date(from);
    dateFilter.lte = new Date(to);
  }

  const searchWhere = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
    : undefined;

  let rows = [];
  let columns = [];
  const sheetName = type.charAt(0).toUpperCase() + type.slice(1);

  switch (type) {
    case 'participantes': {
      const users = await prisma.user.findMany({
        where: { deletedAt: null, ...searchWhere },
        select: { name: true, email: true, role: true, course: true, phone: true, city: true, state: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      rows = users;
      columns = [
        { header: 'Nome', key: 'name' },
        { header: 'E-mail', key: 'email' },
        { header: 'Papel', key: 'role' },
        { header: 'Curso', key: 'course' },
        { header: 'Telefone', key: 'phone' },
        { header: 'Cidade', key: 'city' },
        { header: 'UF', key: 'state' },
        { header: 'Cadastro', key: 'createdAt' },
      ];
      rows = rows.map((r) => ({ ...r, createdAt: fmtDate(r.createdAt) }));
      break;
    }
    case 'inscricoes': {
      const regs = await prisma.registration.findMany({
        where: { eventId, status, createdAt: dateFilter.gte || dateFilter.lte ? { gte: dateFilter.gte, lte: dateFilter.lte } : undefined },
        include: { user: { select: { name: true, email: true, course: true } }, event: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      rows = regs.map((r) => ({
        code: r.code,
        event: r.event.name,
        participant: r.user.name,
        email: r.user.email,
        course: r.user.course,
        status: r.status,
        registeredAt: fmtDate(r.createdAt),
      }));
      columns = [
        { header: 'Inscrição', key: 'code' },
        { header: 'Evento', key: 'event' },
        { header: 'Participante', key: 'participant' },
        { header: 'E-mail', key: 'email' },
        { header: 'Curso', key: 'course' },
        { header: 'Status', key: 'status' },
        { header: 'Data', key: 'registeredAt' },
      ];
      break;
    }
    case 'presencas': {
      const atts = await prisma.attendance.findMany({
        where: { eventId, activityId, status, recordedAt: dateFilter.gte || dateFilter.lte ? { gte: dateFilter.gte, lte: dateFilter.lte } : undefined },
        include: {
          user: { select: { name: true, email: true } },
          activity: { select: { name: true, date: true, startTime: true } },
          event: { select: { name: true } },
          registration: { select: { code: true } },
        },
        orderBy: { recordedAt: 'desc' },
      });
      rows = atts.map((a) => ({
        code: a.registration.code,
        participant: a.user.name,
        email: a.user.email,
        event: a.event.name,
        activity: a.activity.name,
        activityDate: fmtDate(a.activity.date),
        startTime: a.activity.startTime,
        status: a.status,
        method: a.method,
        recordedAt: new Date(a.recordedAt).toISOString(),
      }));
      columns = [
        { header: 'Inscrição', key: 'code' },
        { header: 'Participante', key: 'participant' },
        { header: 'E-mail', key: 'email' },
        { header: 'Evento', key: 'event' },
        { header: 'Atividade', key: 'activity' },
        { header: 'Data', key: 'activityDate' },
        { header: 'Início', key: 'startTime' },
        { header: 'Status', key: 'status' },
        { header: 'Método', key: 'method' },
        { header: 'Registrado em', key: 'recordedAt' },
      ];
      break;
    }
    case 'certificados': {
      const certs = await prisma.certificate.findMany({
        where: { eventId, status },
        include: {
          user: { select: { name: true, email: true } },
          event: { select: { name: true } },
          activity: { select: { name: true } },
        },
        orderBy: { issueDate: 'desc' },
      });
      rows = certs.map((c) => ({
        code: c.code,
        participant: c.user.name,
        email: c.user.email,
        event: c.event.name,
        activity: c.activity?.name || 'Evento completo',
        hours: c.hours,
        status: c.status,
        issueDate: fmtDate(c.issueDate),
      }));
      columns = [
        { header: 'Código', key: 'code' },
        { header: 'Participante', key: 'participant' },
        { header: 'E-mail', key: 'email' },
        { header: 'Evento', key: 'event' },
        { header: 'Atividade', key: 'activity' },
        { header: 'Horas', key: 'hours' },
        { header: 'Status', key: 'status' },
        { header: 'Emissão', key: 'issueDate' },
      ];
      break;
    }
    case 'eventos': {
      const events = await prisma.event.findMany({
        where: { deletedAt: null, status },
        include: { _count: { select: { registrations: true, activities: true } } },
        orderBy: { createdAt: 'desc' },
      });
      rows = events.map((e) => ({
        name: e.name,
        category: e.category,
        modality: e.modality,
        startDate: fmtDate(e.startDate),
        endDate: fmtDate(e.endDate),
        location: e.location,
        status: e.status,
        registrations: e._count.registrations,
        activities: e._count.activities,
      }));
      columns = [
        { header: 'Evento', key: 'name' },
        { header: 'Categoria', key: 'category' },
        { header: 'Modalidade', key: 'modality' },
        { header: 'Início', key: 'startDate' },
        { header: 'Fim', key: 'endDate' },
        { header: 'Local', key: 'location' },
        { header: 'Status', key: 'status' },
        { header: 'Inscrições', key: 'registrations' },
        { header: 'Atividades', key: 'activities' },
      ];
      break;
    }
    case 'atividades': {
      const acts = await prisma.activity.findMany({
        where: { eventId },
        include: { event: { select: { name: true } }, _count: { select: { registrations: true, attendance: true } } },
        orderBy: { date: 'asc' },
      });
      rows = acts.map((a) => ({
        name: a.name,
        event: a.event.name,
        type: a.type,
        date: fmtDate(a.date),
        startTime: a.startTime,
        endTime: a.endTime,
        location: a.location,
        status: a.status,
        inscritos: a._count.registrations,
        presentes: a._count.attendance,
      }));
      columns = [
        { header: 'Atividade', key: 'name' },
        { header: 'Evento', key: 'event' },
        { header: 'Tipo', key: 'type' },
        { header: 'Data', key: 'date' },
        { header: 'Início', key: 'startTime' },
        { header: 'Fim', key: 'endTime' },
        { header: 'Local', key: 'location' },
        { header: 'Status', key: 'status' },
        { header: 'Inscritos', key: 'inscritos' },
        { header: 'Presentes', key: 'presentes' },
      ];
      break;
    }
    default:
      throw new ApiError(404, 'Tipo de exportação inválido.');
  }

  await createAuditLog({ userId: req.user.id, action: 'EXPORT', resource: type, ip: req.ip, details: { format: fmt } });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${type}-${stamp}.${fmt}`;

  if (fmt === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + toCsv(rows, columns));
  }

  const buffer = await toXlsx(rows, columns, sheetName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});
