import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/couponService.js';

export const list = asyncHandler(async (req, res) => {
  const coupons = await svc.listCoupons({ search: req.query.search, status: req.query.status });
  return apiResponse(res, { message: 'Cupons.', data: { coupons } });
});

export const getOne = asyncHandler(async (req, res) => {
  const coupon = await svc.getCoupon(req.params.id);
  return apiResponse(res, { message: 'Cupom.', data: { coupon } });
});

export const create = asyncHandler(async (req, res) => {
  const coupon = await svc.createCoupon(req.body, req.user.id);
  return apiResponse(res, { status: 201, message: 'Cupom criado.', data: { coupon } });
});

export const update = asyncHandler(async (req, res) => {
  const coupon = await svc.updateCoupon(req.params.id, req.body, req.user.id);
  return apiResponse(res, { message: 'Cupom atualizado.', data: { coupon } });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await svc.deleteCoupon(req.params.id, req.user.id);
  return apiResponse(res, { message: 'Cupom removido.', data: result });
});

/** Pré-visualização do desconto (o cálculo oficial continua no pedido). */
export const publicList = asyncHandler(async (_req, res) => {
  const coupons = await svc.listPublicCoupons();
  return apiResponse(res, { message: 'Cupons disponíveis.', data: { coupons } });
});

export const validate = asyncHandler(async (req, res) => {
  const { code, subtotalCents } = req.body;
  const coupon = await svc.findCouponByCode(code);
  svc.validateCoupon(coupon, subtotalCents);
  const discountCents = svc.computeDiscountCents(coupon, subtotalCents);
  return apiResponse(res, {
    message: 'Cupom aplicado.',
    data: {
      coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
      discountCents,
      totalCents: Math.max(0, subtotalCents - discountCents),
    },
  });
});
