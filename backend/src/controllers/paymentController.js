import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/paymentService.js';

export const mine = asyncHandler(async (req, res) => {
  const payments = await svc.listMyPayments(req.user.id);
  return apiResponse(res, { message: 'Meus pagamentos.', data: { payments } });
});

export const getOne = asyncHandler(async (req, res) => {
  const payment = await svc.getPaymentById(req.params.id);
  const isStaff = ['ADMIN', 'ORGANIZER'].includes(req.user.role);
  if (!isStaff && payment.userId !== req.user.id) {
    return apiResponse(res, { status: 403, message: 'Sem permissão.' });
  }
  return apiResponse(res, { message: 'Pagamento.', data: { payment } });
});

export const adminList = asyncHandler(async (req, res) => {
  const { payments, meta } = await svc.listPayments(req.query);
  return apiResponse(res, { message: 'Pagamentos.', data: { payments }, meta });
});

export const confirm = asyncHandler(async (req, res) => {
  const payment = await svc.confirmPayment(req.params.id, { operatorId: req.user.id, notes: req.body.notes || null });
  return apiResponse(res, { message: 'Pagamento confirmado.', data: { payment } });
});

export const setStatus = asyncHandler(async (req, res) => {
  const payment = await svc.setPaymentStatus(req.params.id, req.body.status, req.user.id);
  return apiResponse(res, { message: 'Status do pagamento atualizado.', data: { payment } });
});
