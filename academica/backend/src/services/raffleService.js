import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';

/**
 * Participantes elegíveis = inscrições CONFIRMADAS do evento cujo usuário não
 * está excluído e que possuem ao menos uma presença PRESENT.
 * Se `allowRepeat=false` (padrão), exclui quem já venceu ESTE sorteio.
 */
async function eligibleRegistrations(client, eventId, raffleId, allowRepeat) {
  const regs = await client.registration.findMany({
    where: { eventId, status: 'CONFIRMED', user: { deletedAt: null } },
    include: { attendance: { select: { status: true } }, user: { select: { id: true, name: true } } },
  });
  let present = regs.filter((r) => r.attendance.some((a) => a.status === 'PRESENT'));
  if (!allowRepeat && raffleId) {
    const winners = await client.raffleWinner.findMany({ where: { raffleId }, select: { userId: true } });
    const won = new Set(winners.map((w) => w.userId));
    present = present.filter((r) => !won.has(r.userId));
  }
  return present;
}

export async function listRaffles({ eventId } = {}) {
  return prisma.raffle.findMany({
    where: { ...(eventId ? { eventId } : {}) },
    include: {
      event: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { winners: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getRaffle(id) {
  const raffle = await prisma.raffle.findUnique({
    where: { id },
    include: {
      event: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      winners: {
        include: {
          user: { select: { id: true, name: true, email: true, course: true } },
          drawnBy: { select: { id: true, name: true } },
        },
        orderBy: { drawnAt: 'desc' },
      },
    },
  });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');
  return raffle;
}

export async function getEligible(id) {
  const raffle = await getRaffle(id);
  const eligible = await eligibleRegistrations(prisma, raffle.eventId, raffle.id, raffle.allowRepeat);
  return {
    raffleId: raffle.id,
    prize: raffle.prize,
    allowRepeat: raffle.allowRepeat,
    eligibleCount: eligible.length,
    eligible: eligible.map((r) => ({ registrationId: r.id, userId: r.userId, name: r.user?.name || 'Participante' })),
  };
}

export async function createRaffle({ eventId, prize, allowRepeat = false }, operatorId) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError(404, 'Evento não encontrado.');
  const raffle = await prisma.raffle.create({
    data: { eventId, prize: String(prize).trim(), allowRepeat: !!allowRepeat, createdById: operatorId },
  });
  const eligible = await eligibleRegistrations(prisma, eventId, raffle.id, raffle.allowRepeat);
  const updated = await prisma.raffle.update({ where: { id: raffle.id }, data: { eligibleCount: eligible.length } });
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_CREATED', resource: 'Raffle', resourceId: raffle.id, details: { eventId, prize } });
  return { raffle: updated, eligibleCount: eligible.length };
}

/**
 * Executa o sorteio. O vencedor é decidido AQUI (crypto.randomInt), nunca no
 * navegador. Tudo em transação; o índice único (raffleId,userId) impede
 * duplicidade mesmo sob concorrência.
 */
export async function drawRaffle(id, operatorId) {
  const result = await prisma.$transaction(async (tx) => {
    const raffle = await tx.raffle.findUnique({ where: { id } });
    if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');
    if (raffle.status === 'CANCELLED') throw new ApiError(409, 'Este sorteio foi cancelado.');
    if (raffle.status === 'CLOSED') throw new ApiError(409, 'Este sorteio já foi encerrado.');

    const eligible = await eligibleRegistrations(tx, raffle.eventId, raffle.id, raffle.allowRepeat);
    if (eligible.length === 0) throw new ApiError(409, 'Não há participantes elegíveis (presentes) para este sorteio.');

    const winner = eligible[crypto.randomInt(0, eligible.length)];
    let winnerRow;
    try {
      winnerRow = await tx.raffleWinner.create({
        data: {
          raffleId: raffle.id,
          eventId: raffle.eventId,
          userId: winner.userId,
          registrationId: winner.id,
          prizeSnapshot: raffle.prize,
          eligibleCountAtDraw: eligible.length,
          drawnById: operatorId,
        },
      });
    } catch (e) {
      if (e?.code === 'P2002') throw new ApiError(409, 'Este participante já venceu este sorteio.');
      throw e;
    }
    await tx.raffle.update({ where: { id: raffle.id }, data: { eligibleCount: eligible.length } });
    return {
      winner: {
        id: winnerRow.id,
        userId: winner.userId,
        name: winner.user?.name || 'Participante',
        registrationId: winner.id,
        prize: raffle.prize,
        drawnAt: winnerRow.drawnAt,
      },
      eligibleCount: eligible.length,
    };
  });

  await createNotification({
    userId: result.winner.userId,
    type: 'SYSTEM',
    title: 'Você foi sorteado! 🎉',
    message: `Parabéns! Você venceu o sorteio do prêmio "${result.winner.prize}".`,
    link: '/minha-area',
  });
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_DRAWN', resource: 'Raffle', resourceId: id, details: { winnerUserId: result.winner.userId, prize: result.winner.prize } });
  return result;
}

export async function setRaffleStatus(id, status, operatorId) {
  const raffle = await prisma.raffle.findUnique({ where: { id } });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');
  if (!['OPEN', 'CLOSED', 'CANCELLED'].includes(status)) throw new ApiError(422, 'Status de sorteio inválido.');
  const updated = await prisma.raffle.update({ where: { id }, data: { status } });
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_STATUS_CHANGED', resource: 'Raffle', resourceId: id, details: { status } });
  return updated;
}
