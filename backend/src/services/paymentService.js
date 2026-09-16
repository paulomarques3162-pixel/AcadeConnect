import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';
import { getActivePixConfig, buildPayloadWith } from './pixService.js';
import { generatePaymentCode } from '../utils/codes.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';

const paymentInclude = {
  event: { select: { id: true, name: true, isPaid: true, priceCents: true } },
  order: { select: { id: true, code: true, totalCents: true, status: true } },
  registration: { select: { id: true, code: true, eventId: true, status: true } },
  pixConfig: { select: { id: true, keyType: true, receiverName: true } },
};

/**
 * Cria um pagamento PIX (evento ou pedido). SEMPRE usa a chave PIX ativa e
 * calcula o valor no servidor — o frontend nunca define o valor.
 */
export async function createPayment({ userId, eventId = null, registrationId = null, orderId = null, amountCents, description = null }) {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw new ApiError(422, 'Valor de pagamento inválido.');

  const pix = await getActivePixConfig();
  if (!pix) throw new ApiError(409, 'Nenhuma chave PIX ativa configurada. Contate a organização.');

  // Validade do PIX: definida pelo admin (PixConfig.expiresMinutes), máx. 2h.
  const rawMinutes = Number(pix.expiresMinutes ?? 30);
  const minutes = Math.min(Math.max(Number.isFinite(rawMinutes) ? rawMinutes : 30, 1), 120);
  const expiresAt = new Date(Date.now() + minutes * 60000);

  const makeCode = () => {
    const c = generatePaymentCode();
    return { code: c, txid: c.replace(/[^A-Za-z0-9]/g, '') };
  };

  // Um pagamento por vínculo (unique em registrationId/orderId): reaproveita se
  // PENDENTE e válido; se expirou, REGENERA in-place (novo código/validade) em
  // vez de criar outra linha (o que violaria o unique).
  const reuseOrRegenerate = async (where) => {
    const existing = await prisma.payment.findUnique({ where });
    if (!existing) return null;
    if (['PAID', 'CANCELLED', 'REFUNDED'].includes(existing.status)) return null;
    if (existing.status === 'PENDING' && (!existing.expiresAt || existing.expiresAt.getTime() > Date.now())) {
      return existing;
    }
    const { code: newCode, txid: newTxid } = makeCode();
    const newPayload = buildPayloadWith(pix, { amountCents: amount, txid: newTxid, description });
    return prisma.payment.update({
      where: { id: existing.id },
      data: {
        code: newCode,
        txid: newTxid,
        pixPayload: newPayload,
        expiresAt,
        status: 'PENDING',
        pixConfigId: pix.id,
        paidAt: null,
        confirmedById: null,
      },
      include: paymentInclude,
    });
  };
  if (registrationId) {
    const reuse = await reuseOrRegenerate({ registrationId });
    if (reuse) return reuse;
  }
  if (orderId) {
    const reuse = await reuseOrRegenerate({ orderId });
    if (reuse) return reuse;
  }

  const code = generatePaymentCode();
  const txid = code.replace(/[^A-Za-z0-9]/g, '');
  const pixPayload = buildPayloadWith(pix, { amountCents: amount, txid, description });

  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        code,
        userId,
        eventId,
        registrationId,
        orderId,
        amountCents: amount,
        status: 'PENDING',
        pixConfigId: pix.id,
        pixPayload,
        txid,
        expiresAt,
      },
      include: paymentInclude,
    });
  } catch (err) {
    // Idempotency under concurrency: two simultaneous requests for the same
    // registration/order both pass the reuse check, but the @@unique constraint
    // (registrationId / orderId) lets only one create win. The loser must NOT
    // fail with a 500 — it returns the payment that was actually created.
    if (err?.code === 'P2002') {
      const existing = registrationId
        ? await prisma.payment.findUnique({ where: { registrationId }, include: paymentInclude })
        : orderId
          ? await prisma.payment.findUnique({ where: { orderId }, include: paymentInclude })
          : null;
      if (existing) return existing;
    }
    throw err;
  }

  await createNotification({
    userId,
    type: 'SYSTEM',
    title: 'Pagamento pendente',
    message: `Foi gerado um PIX de ${formatBRL(amount)}. Após o pagamento, aguarde a confirmação da organização.`,
    link: eventId ? '/meus-pagamentos' : '/meus-pedidos',
  });
  return payment;
}

function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function getPaymentById(id) {
  let payment = await prisma.payment.findUnique({ where: { id }, include: { ...paymentInclude, user: { select: { id: true, name: true, email: true } } } });
  if (!payment) throw new ApiError(404, 'Pagamento não encontrado.');
  // O backend é a autoridade da expiração (não o frontend).
  if (payment.status === 'PENDING' && payment.expiresAt && payment.expiresAt.getTime() <= Date.now()) {
    await prisma.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    payment = { ...payment, status: 'EXPIRED' };
  }
  return payment;
}

export async function listMyPayments(userId, { limit = 100 } = {}) {
  // Expira de forma ociosa os PIX vencidos que ainda constam como PENDING.
  await prisma.payment.updateMany({
    where: { userId, status: 'PENDING', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return prisma.payment.findMany({
    where: { userId },
    include: paymentInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 100, 1), 200),
  });
}

export async function listPayments({ status, eventId, userId, page = 1, limit = 20, search } = {}) {
  ({ page, limit } = parsePagination({ page, limit }, { defaultLimit: 20, maxLimit: 200 }));
  const skip = (page - 1) * limit;
  const take = limit;
  const where = {};
  if (status) where.status = status;
  if (eventId) where.eventId = eventId;
  if (userId) where.userId = userId;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { txid: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: { ...paymentInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { payments, meta: paginationMeta({ page, limit, total }) };
}

/**
 * Confirma o pagamento (ação administrativa). Idempotente e transacional.
 * Libera o QR de entrada e marca o pedido como PAID quando aplicável.
 */
export async function confirmPayment(id, { operatorId = null, notes = null } = {}) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new ApiError(404, 'Pagamento não encontrado.');
  if (payment.status === 'PAID') return getPaymentById(id);
  if (['CANCELLED', 'REFUNDED'].includes(payment.status)) {
    throw new ApiError(409, 'Pagamento cancelado/estornado não pode ser confirmado.');
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: new Date(), confirmedById: operatorId, ...(notes ? { notes } : {}) },
    });
    if (res.count === 0) throw new ApiError(409, 'Pagamento não pode ser confirmado no status atual.');
    if (payment.registrationId) {
      await tx.registration.update({ where: { id: payment.registrationId }, data: { qrActive: true } });
    }
    if (payment.orderId) {
      await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
    }
  });

  await createNotification({
    userId: payment.userId,
    type: 'SYSTEM',
    title: 'Pagamento confirmado',
    message: 'Seu pagamento foi confirmado. O QR Code de entrada está liberado.',
    link: payment.eventId ? '/meus-pagamentos' : '/meus-pedidos',
  });
  await createAuditLog({ userId: operatorId, action: 'PAYMENT_CONFIRMED', resource: 'Payment', resourceId: id, details: { amountCents: payment.amountCents } });
  return getPaymentById(id);
}

/** Cancela / expira / estorna um pagamento (ação administrativa). */
export async function setPaymentStatus(id, status, operatorId = null) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new ApiError(404, 'Pagamento não encontrado.');
  const allowed = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED'];
  if (!allowed.includes(status)) throw new ApiError(422, 'Status de pagamento inválido.');
  if (status === 'PAID') return confirmPayment(id, { operatorId });
  if (payment.status === 'PAID' && status !== 'REFUNDED') {
    throw new ApiError(409, 'Pagamento já confirmado só pode ser estornado.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { status } });
    if (payment.registrationId && ['CANCELLED', 'REFUNDED', 'EXPIRED'].includes(status)) {
      await tx.registration.update({ where: { id: payment.registrationId }, data: { qrActive: false } });
    }
    if (payment.orderId && ['CANCELLED', 'REFUNDED', 'EXPIRED'].includes(status)) {
      await tx.order.update({ where: { id: payment.orderId }, data: { status: status === 'REFUNDED' ? 'CANCELLED' : status } });
    }
  });

  await createNotification({
    userId: payment.userId,
    type: 'SYSTEM',
    title: 'Atualização de pagamento',
    message: `Seu pagamento foi atualizado para ${status}.`,
    link: payment.eventId ? '/meus-pagamentos' : '/meus-pedidos',
  });
  await createAuditLog({ userId: operatorId, action: 'PAYMENT_STATUS_CHANGED', resource: 'Payment', resourceId: id, details: { status } });
  return getPaymentById(id);
}
