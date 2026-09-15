import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';
import { getActivePixConfig, buildPayloadWith } from './pixService.js';
import { generatePaymentCode } from '../utils/codes.js';

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

  // Idempotência: reaproveita um pagamento pendente do mesmo vínculo.
  if (registrationId) {
    const existing = await prisma.payment.findUnique({ where: { registrationId } });
    if (existing && existing.status === 'PENDING') return existing;
  }
  if (orderId) {
    const existing = await prisma.payment.findUnique({ where: { orderId } });
    if (existing && existing.status === 'PENDING') return existing;
  }

  const code = generatePaymentCode();
  const txid = code.replace(/[^A-Za-z0-9]/g, '');
  const pixPayload = buildPayloadWith(pix, { amountCents: amount, txid, description });

  const payment = await prisma.payment.create({
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
    },
    include: paymentInclude,
  });

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
  const payment = await prisma.payment.findUnique({ where: { id }, include: { ...paymentInclude, user: { select: { id: true, name: true, email: true } } } });
  if (!payment) throw new ApiError(404, 'Pagamento não encontrado.');
  return payment;
}

export async function listMyPayments(userId) {
  return prisma.payment.findMany({ where: { userId }, include: paymentInclude, orderBy: { createdAt: 'desc' } });
}

export async function listPayments({ status, eventId, userId, page = 1, limit = 20, search } = {}) {
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
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return { payments, meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
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
