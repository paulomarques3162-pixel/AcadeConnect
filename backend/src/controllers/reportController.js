import { prisma } from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Reports with filters (event, activity, period, status).
 * All numbers computed from the database.
 */
export const reports = asyncHandler(async (req, res) => {
  const { eventId, activityId, from, to, status } = req.query;

  const period = {};
  if (from || to) {
    period.gte = from ? new Date(from) : undefined;
    period.lte = to ? new Date(to) : undefined;
  }

  const attWhere = {
    ...(eventId ? { eventId } : {}),
    ...(activityId ? { activityId } : {}),
    ...(status ? { status } : {}),
    ...(Object.keys(period).length ? { recordedAt: period } : {}),
  };

  const regWhere = {
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {}),
    ...(Object.keys(period).length ? { createdAt: period } : {}),
  };

  const [totalInscritos, totalPresentes, totalAusentes, totalCertificados, registrations] = await Promise.all([
    prisma.registration.count({ where: regWhere }),
    prisma.attendance.count({ where: { ...attWhere, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { ...attWhere, status: 'ABSENT' } }),
    prisma.certificate.count({ where: { ...(eventId ? { eventId } : {}), ...(status ? { status } : {}) } }),
    prisma.registration.findMany({ where: regWhere, include: { _count: { select: { attendance: true } }, event: { select: { name: true } } } }),
  ]);

  const participantesPorAtividade = await prisma.activityRegistration.groupBy({
    by: ['activityId'],
    where: activityId ? { activityId } : undefined,
    _count: { _all: true },
  });
  const activities = await prisma.activity.findMany({
    where: activityId ? { id: activityId } : (eventId ? { eventId } : undefined),
    select: { id: true, name: true },
  });
  const actMap = Object.fromEntries(activities.map((a) => [a.id, a.name]));

  const totalAtividadesParticipadas = registrations.reduce((acc, r) => acc + r._count.attendance, 0);
  const percentualPresenca = totalInscritos === 0 ? 0 : Math.round((totalPresentes / totalInscritos) * 100);

  return apiResponse(res, {
    message: 'Relatório.',
    data: {
      totals: {
        totalInscritos,
        totalPresentes,
        totalAusentes,
        totalCertificados,
        percentualPresenca,
        totalAtividadesParticipadas,
      },
      participantesPorAtividade: participantesPorAtividade.map((x) => ({
        activity: actMap[x.activityId] || 'Atividade',
        count: x._count._all,
      })),
      porEvento: registrations.reduce((acc, r) => {
        const name = r.event?.name || 'Evento';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {}),
    },
  });
});
