import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/** Valida o cupom e retorna o desconto em centavos (regra única no backend). */
export function validateCoupon(coupon, subtotalCents) {
  const now = new Date();
  if (!coupon || coupon.deletedAt) throw new ApiError(404, 'Cupom inválido.');
  if (!coupon.active) throw new ApiError(409, 'Cupom inativo.');
  if (coupon.validFrom && now < coupon.validFrom) throw new ApiError(409, 'Cupom ainda não está válido.');
  if (coupon.validUntil && now > coupon.validUntil) throw new ApiError(409, 'Cupom expirado.');
  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
    throw new ApiError(409, 'Cupom esgotado.');
  }
  if (coupon.minOrderValueCents && subtotalCents < coupon.minOrderValueCents) {
    throw new ApiError(409, 'O valor do pedido não atinge o mínimo para este cupom.');
  }
}

export function computeDiscountCents(coupon, subtotalCents) {
  if (coupon.type === 'PERCENT') {
    const pct = Math.max(0, Math.min(100, Number(coupon.value)));
    return Math.min(subtotalCents, Math.floor((subtotalCents * pct) / 100));
  }
  // FIXED: value está em centavos
  return Math.min(subtotalCents, Math.max(0, Number(coupon.value)));
}

/** Cupons ativos e válidos que o participante pode usar no checkout. */
export async function listPublicCoupons() {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
    },
    select: { id: true, code: true, type: true, value: true, minOrderValueCents: true, validUntil: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listCoupons({ search, status } = {}) {
  return prisma.coupon.findMany({
    where: {
      deletedAt: null,
      ...(status === 'ACTIVE' ? { active: true } : {}),
      ...(status === 'INACTIVE' ? { active: false } : {}),
      ...(search ? { code: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findCouponByCode(code) {
  return prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
}

export async function getCoupon(id) {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon || coupon.deletedAt) throw new ApiError(404, 'Cupom não encontrado.');
  return coupon;
}

export async function createCoupon(data, operatorId) {
  const code = normalizeCode(data.code);
  const exists = await prisma.coupon.findUnique({ where: { code } });
  if (exists) throw new ApiError(409, 'Já existe um cupom com este código.');
  const coupon = await prisma.coupon.create({
    data: {
      code,
      type: data.type,
      value: Number(data.value),
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      maxUses: data.maxUses === undefined || data.maxUses === null || data.maxUses === '' ? null : Number(data.maxUses),
      minOrderValueCents: data.minOrderValueCents === undefined || data.minOrderValueCents === null || data.minOrderValueCents === '' ? null : Number(data.minOrderValueCents),
      active: data.active !== false,
    },
  });
  await createAuditLog({ userId: operatorId, action: 'COUPON_CREATED', resource: 'Coupon', resourceId: coupon.id, details: { code, type: coupon.type } });
  return coupon;
}

export async function updateCoupon(id, data, operatorId) {
  await getCoupon(id);
  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: normalizeCode(data.code) } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: Number(data.value) } : {}),
      ...(data.validFrom !== undefined ? { validFrom: data.validFrom ? new Date(data.validFrom) : null } : {}),
      ...(data.validUntil !== undefined ? { validUntil: data.validUntil ? new Date(data.validUntil) : null } : {}),
      ...(data.maxUses !== undefined ? { maxUses: data.maxUses === null || data.maxUses === '' ? null : Number(data.maxUses) } : {}),
      ...(data.minOrderValueCents !== undefined ? { minOrderValueCents: data.minOrderValueCents === null || data.minOrderValueCents === '' ? null : Number(data.minOrderValueCents) } : {}),
      ...(data.active !== undefined ? { active: !!data.active } : {}),
    },
  });
  await createAuditLog({ userId: operatorId, action: 'COUPON_UPDATED', resource: 'Coupon', resourceId: id });
  return coupon;
}

/** Remoção lógica (não destrói histórico de pedidos). */
export async function deleteCoupon(id, operatorId) {
  await getCoupon(id);
  const used = await prisma.order.count({ where: { couponId: id } });
  if (used > 0) {
    const coupon = await prisma.coupon.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    await createAuditLog({ userId: operatorId, action: 'COUPON_REMOVED', resource: 'Coupon', resourceId: id });
    return { removed: true, deactivated: true, coupon };
  }
  await prisma.coupon.delete({ where: { id } });
  await createAuditLog({ userId: operatorId, action: 'COUPON_DELETED', resource: 'Coupon', resourceId: id });
  return { removed: true };
}
