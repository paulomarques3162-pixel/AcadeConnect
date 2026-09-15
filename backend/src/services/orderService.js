import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';
import { validateCoupon, computeDiscountCents } from './couponService.js';
import { createPayment } from './paymentService.js';
import { generateOrderCode } from '../utils/codes.js';
import { invalidate } from '../utils/cache.js';

const orderInclude = {
  items: true,
  payment: { select: { id: true, code: true, status: true, amountCents: true, pixPayload: true, txid: true, paidAt: true, expiresAt: true } },
  coupon: { select: { id: true, code: true, type: true, value: true } },
};

/**
 * Cria o pedido com preço/desconto/total calculados SEMPRE no servidor.
 * Preço e estoque são validados dentro de uma transação para evitar venda dupla.
 * O preço unitário é gravado como histórico (não muda se o produto mudar depois).
 */
export async function createOrder({ userId, items, couponCode = null }) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, 'Adicione ao menos um produto ao pedido.');

  const order = await prisma.$transaction(async (tx) => {
    const ids = [...new Set(items.map((i) => String(i.productId)))];
    const products = await tx.product.findMany({ where: { id: { in: ids }, deletedAt: null } });
    const map = Object.fromEntries(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const itemsData = [];
    for (const item of items) {
      const product = map[String(item.productId)];
      const qty = Number(item.quantity);
      if (!product) throw new ApiError(404, 'Produto não encontrado.');
      if (product.status !== 'ACTIVE') throw new ApiError(409, `Produto indisponível: ${product.name}.`);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new ApiError(422, 'Quantidade inválida.');

      if (product.stock !== null && product.stock !== undefined) {
        const dec = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        });
        if (dec.count === 0) throw new ApiError(409, `Estoque insuficiente para ${product.name}.`);
      }

      const lineTotal = product.priceCents * qty;
      subtotal += lineTotal;
      itemsData.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: qty,
        subtotalCents: lineTotal,
      });
    }

    let coupon = null;
    let discount = 0;
    if (couponCode) {
      coupon = await tx.coupon.findUnique({ where: { code: String(couponCode).trim().toUpperCase() } });
      validateCoupon(coupon, subtotal);
      discount = computeDiscountCents(coupon, subtotal);
      const used = await tx.coupon.updateMany({
        where: { id: coupon.id, ...(coupon.maxUses !== null && coupon.maxUses !== undefined ? { usedCount: { lt: coupon.maxUses } } : {}) },
        data: { usedCount: { increment: 1 } },
      });
      if (used.count === 0) throw new ApiError(409, 'Cupom esgotado.');
    }

    const total = Math.max(0, subtotal - discount);
    const code = generateOrderCode();
    return tx.order.create({
      data: {
        code,
        userId,
        subtotalCents: subtotal,
        discountCents: discount,
        totalCents: total,
        couponId: coupon?.id || null,
        couponCode: coupon?.code || null,
        status: 'PENDING',
        items: { create: itemsData },
      },
      include: orderInclude,
    });
  });

  await createAuditLog({ userId, action: 'ORDER_CREATED', resource: 'Order', resourceId: order.id, details: { totalCents: order.totalCents } });
  return order;
}

export async function listMyOrders(userId, { limit = 100 } = {}) {
  return prisma.order.findMany({
    where: { userId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 100, 1), 200),
  });
}

export async function listOrders({ status, page = 1, limit = 20, search } = {}) {
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  return { orders, meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
}

/** Detalhe com validação de dono (ou staff). */
export async function getOrder(id, requester) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw new ApiError(404, 'Pedido não encontrado.');
  const isStaff = requester && ['ADMIN', 'ORGANIZER'].includes(requester.role);
  if (!isStaff && order.userId !== requester?.id) throw new ApiError(403, 'Sem permissão para ver este pedido.');
  return order;
}

/** Gera (ou reaproveita) o PIX do pedido. */
export async function payOrder(orderId, userId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw new ApiError(404, 'Pedido não encontrado.');
  if (order.status !== 'PENDING') throw new ApiError(409, 'Este pedido não está pendente de pagamento.');
  return createPayment({ userId, orderId: order.id, amountCents: order.totalCents, description: `Pedido ${order.code}` });
}

/**
 * Usuário cancela o PRÓPRIO pedido quando permitido (não pago).
 * Devolve estoque e cancela o PIX pendente.
 */
export async function cancelOrder(id, userId) {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payment: true } });
  if (!order || order.userId !== userId) throw new ApiError(404, 'Pedido não encontrado.');
  if (order.status === 'CANCELLED') throw new ApiError(409, 'Este pedido já está cancelado.');
  if (order.status === 'PAID') throw new ApiError(409, 'Pedido já pago não pode ser cancelado. Contate a organização.');

  const updated = await prisma.$transaction(async (tx) => {
    for (const it of order.items) {
      if (it.productId) {
        await tx.product.updateMany({
          where: { id: it.productId, stock: { not: null } },
          data: { stock: { increment: it.quantity } },
        });
      }
    }
    if (order.payment && order.payment.status === 'PENDING') {
      await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'CANCELLED' } });
    }
    return tx.order.update({ where: { id }, data: { status: 'CANCELLED' }, include: orderInclude });
  });

  await createNotification({ userId, type: 'SYSTEM', title: 'Pedido cancelado', message: `Seu pedido ${order.code} foi cancelado.`, link: '/meus-pedidos' });
  invalidate('products:public');
  await createAuditLog({ userId, action: 'ORDER_CANCELLED', resource: 'Order', resourceId: id });
  return updated;
}

export async function setOrderStatus(id, status, operatorId) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new ApiError(404, 'Pedido não encontrado.');
  const allowed = ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'];
  if (!allowed.includes(status)) throw new ApiError(422, 'Status de pedido inválido.');
  const updated = await prisma.order.update({ where: { id }, data: { status }, include: orderInclude });
  await createAuditLog({ userId: operatorId, action: 'ORDER_STATUS_CHANGED', resource: 'Order', resourceId: id, details: { status } });
  return updated;
}
