import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/orderService.js';
import { buildOrderReceiptPdf } from '../utils/pdf.js';

export const create = asyncHandler(async (req, res) => {
  const order = await svc.createOrder({ userId: req.user.id, items: req.body.items, couponCode: req.body.couponCode || null });
  return apiResponse(res, { status: 201, message: 'Pedido criado.', data: { order } });
});

export const mine = asyncHandler(async (req, res) => {
  const orders = await svc.listMyOrders(req.user.id);
  return apiResponse(res, { message: 'Meus pedidos.', data: { orders } });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await svc.getOrder(req.params.id, req.user);
  return apiResponse(res, { message: 'Pedido.', data: { order } });
});

export const pay = asyncHandler(async (req, res) => {
  const payment = await svc.payOrder(req.params.id, req.user.id);
  return apiResponse(res, { status: 201, message: 'PIX gerado.', data: { payment } });
});

export const adminList = asyncHandler(async (req, res) => {
  const { orders, meta } = await svc.listOrders(req.query);
  return apiResponse(res, { message: 'Pedidos.', data: { orders }, meta });
});

export const receipt = asyncHandler(async (req, res) => {
  const order = await svc.getOrder(req.params.id, req.user);
  const pdf = await buildOrderReceiptPdf({ order, user: order.user, payment: order.payment });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="comprovante-${order.code}.pdf"`);
  return res.send(pdf);
});

export const setStatus = asyncHandler(async (req, res) => {
  const order = await svc.setOrderStatus(req.params.id, req.body.status, req.user.id);
  return apiResponse(res, { message: 'Status do pedido atualizado.', data: { order } });
});
