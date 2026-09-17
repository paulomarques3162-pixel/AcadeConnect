import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';
import { cacheWrap, invalidate } from '../utils/cache.js';
import { env } from '../config/env.js';

const RESULTS_KEY = 'raffles:results';
const MAX_RAFFLES = 200;

// Limites administrativos de peso. Impedem 0, negativos, NaN, Infinity e
// valores absurdos. O backend é a única autoridade — o frontend nunca decide.
const WEIGHT_MIN = 1;
const WEIGHT_MAX = 1000;
const MAX_PARTICIPANTS = 2000;

/**
 * Normaliza e valida o mapa { userId: peso }. Rejeita qualquer valor que não
 * seja um inteiro dentro de [WEIGHT_MIN, WEIGHT_MAX].
 */
function sanitizeWeights(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(422, 'Formato de pesos inválido.');
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_PARTICIPANTS) {
    throw new ApiError(422, 'Quantidade de participantes acima do limite permitido.');
  }
  const out = {};
  for (const [userId, value] of entries) {
    const key = String(userId).trim();
    if (!key) throw new ApiError(422, 'Peso associado a participante inválido.');
    // Number('') === 0, Number('abc') === NaN, Infinity -> rejeitados abaixo.
    if (value === null || value === '' || typeof value === 'boolean') {
      throw new ApiError(422, `Peso inválido para o participante ${key}.`);
    }
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) {
      throw new ApiError(422, `Peso inválido para o participante ${key}. Use um inteiro entre ${WEIGHT_MIN} e ${WEIGHT_MAX}.`);
    }
    out[key] = n;
  }
  return out;
}

/** Peso efetivo de um participante (padrão 1 quando não configurado). */
function weightOf(raffle, userId) {
  const raw = raffle?.weights && typeof raffle.weights === 'object' && !Array.isArray(raffle.weights)
    ? raffle.weights[userId]
    : undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= WEIGHT_MIN && n <= WEIGHT_MAX ? n : 1;
}

/**
 * Sorteio ponderado criptograficamente seguro. A probabilidade de cada
 * participante é proporcional ao seu peso (padrão 1). A decisão acontece
 * exclusivamente no servidor.
 */
function pickWeighted(eligible, raffle) {
  const weights = eligible.map((r) => weightOf(raffle, r.userId));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return eligible[crypto.randomInt(0, eligible.length)];
  }
  let roll = crypto.randomInt(0, total); // [0, total)
  for (let i = 0; i < eligible.length; i += 1) {
    if (roll < weights[i]) return eligible[i];
    roll -= weights[i];
  }
  return eligible[eligible.length - 1];
}

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
    where: { deletedAt: null, ...(eventId ? { eventId } : {}) },
    include: {
      event: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { winners: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_RAFFLES,
  });
}

/**
 * Resultados públicos dos sorteios (sem controles administrativos e SEM pesos).
 * Qualquer usuário autenticado pode consultar.
 */
export async function listPublicResults({ eventId } = {}) {
  const key = eventId ? `${RESULTS_KEY}:${eventId}` : RESULTS_KEY;
  return cacheWrap(key, env.publicCacheTtlMs, () =>
    prisma.raffle.findMany({
      where: { deletedAt: null, ...(eventId ? { eventId } : {}) },
      select: {
        id: true,
        prize: true,
        status: true,
        createdAt: true,
        event: { select: { id: true, name: true } },
        winners: {
          select: { id: true, prizeSnapshot: true, drawnAt: true, user: { select: { name: true } } },
          orderBy: { drawnAt: 'desc' },
          take: 50,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_RAFFLES,
    })
  );
}

export async function getRaffle(id) {
  const raffle = await prisma.raffle.findFirst({
    where: { id, deletedAt: null },
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
  const weights = raffle.weights && typeof raffle.weights === 'object' && !Array.isArray(raffle.weights) ? raffle.weights : {};
  return {
    raffleId: raffle.id,
    prize: raffle.prize,
    allowRepeat: raffle.allowRepeat,
    eligibleCount: eligible.length,
    eligible: eligible.map((r) => ({
      registrationId: r.id,
      userId: r.userId,
      name: r.user?.name || 'Participante',
      // Uso exclusivo do editor administrativo (rota protegida por perfil).
      weight: weightOf(raffle, r.userId),
    })),
    weights,
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
  invalidate(RESULTS_KEY);
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_CREATED', resource: 'Raffle', resourceId: raffle.id, details: { eventId, prize } });
  return { raffle: updated, eligibleCount: eligible.length };
}

/**
 * Edição administrativa do sorteio (prêmio e regra de repetição).
 * Mantém o histórico de vencedores intacto.
 */
export async function updateRaffle(id, { prize, allowRepeat }, operatorId) {
  const raffle = await prisma.raffle.findFirst({ where: { id, deletedAt: null } });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');

  const data = {};
  if (prize !== undefined) {
    const value = String(prize).trim();
    if (value.length < 2) throw new ApiError(422, 'Informe um prêmio com pelo menos 2 caracteres.');
    data.prize = value;
  }
  if (allowRepeat !== undefined) data.allowRepeat = !!allowRepeat;

  const updated = await prisma.raffle.update({ where: { id }, data });

  // allowRepeat altera quem é elegível (exclui quem já venceu) — recalcula.
  if (data.allowRepeat !== undefined) {
    const eligible = await eligibleRegistrations(prisma, raffle.eventId, raffle.id, updated.allowRepeat);
    await prisma.raffle.update({ where: { id }, data: { eligibleCount: eligible.length } });
  }

  invalidate(RESULTS_KEY);
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_UPDATED', resource: 'Raffle', resourceId: id, details: data });
  return getRaffle(id);
}

/**
 * Remoção administrativa com soft delete. Preserva o histórico de vencedores e
 * a trilha de auditoria (nunca há exclusão destrutiva).
 */
export async function removeRaffle(id, operatorId) {
  const raffle = await prisma.raffle.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { winners: true } } } });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');

  const removed = await prisma.raffle.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  });
  invalidate(RESULTS_KEY);
  await createAuditLog({
    userId: operatorId,
    action: 'RAFFLE_REMOVED',
    resource: 'Raffle',
    resourceId: id,
    details: { prize: raffle.prize, eventId: raffle.eventId, winnersKept: raffle._count.winners },
  });
  return { id: removed.id };
}

/**
 * Configuração administrativa de pesos/probabilidades.
 * Valida que cada participante pertence a uma inscrição confirmada do evento.
 * Nunca é exposto a participantes/visitantes.
 */
export async function setRaffleWeights(id, rawWeights, operatorId) {
  const raffle = await prisma.raffle.findFirst({ where: { id, deletedAt: null } });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');

  const weights = sanitizeWeights(rawWeights);

  const userIds = Object.keys(weights);
  if (userIds.length) {
    const registrations = await prisma.registration.findMany({
      where: { eventId: raffle.eventId, status: 'CONFIRMED', userId: { in: userIds } },
      select: { userId: true },
    });
    const valid = new Set(registrations.map((r) => r.userId));
    for (const uid of userIds) {
      if (!valid.has(uid)) throw new ApiError(422, 'Um dos participantes informados não pertence a este evento.');
    }
  }

  await prisma.raffle.update({ where: { id }, data: { weights } });
  invalidate(RESULTS_KEY);
  await createAuditLog({
    userId: operatorId,
    action: 'RAFFLE_WEIGHTS_UPDATED',
    resource: 'Raffle',
    resourceId: id,
    // Apenas a contagem entra na auditoria — nunca os pesos em claro.
    details: { participants: userIds.length },
  });
  return { raffleId: id, weights };
}

/**
 * Executa o sorteio. O vencedor é decidido AQUI (crypto.randomInt ponderado),
 * nunca no navegador. Tudo em transação; o índice único (raffleId,userId)
 * impede duplicidade mesmo sob concorrência.
 */
export async function drawRaffle(id, operatorId) {
  const result = await prisma.$transaction(async (tx) => {
    const raffle = await tx.raffle.findFirst({ where: { id, deletedAt: null } });
    if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');
    if (raffle.status === 'CANCELLED') throw new ApiError(409, 'Este sorteio foi cancelado.');
    if (raffle.status === 'CLOSED') throw new ApiError(409, 'Este sorteio já foi encerrado.');

    const eligible = await eligibleRegistrations(tx, raffle.eventId, raffle.id, raffle.allowRepeat);
    if (eligible.length === 0) throw new ApiError(409, 'Não há participantes elegíveis (presentes) para este sorteio.');

    const winner = pickWeighted(eligible, raffle);
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

  invalidate(RESULTS_KEY);
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
  const raffle = await prisma.raffle.findFirst({ where: { id, deletedAt: null } });
  if (!raffle) throw new ApiError(404, 'Sorteio não encontrado.');
  if (!['OPEN', 'CLOSED', 'CANCELLED'].includes(status)) throw new ApiError(422, 'Status de sorteio inválido.');
  const updated = await prisma.raffle.update({ where: { id }, data: { status } });
  invalidate(RESULTS_KEY);
  await createAuditLog({ userId: operatorId, action: 'RAFFLE_STATUS_CHANGED', resource: 'Raffle', resourceId: id, details: { status } });
  return updated;
}
