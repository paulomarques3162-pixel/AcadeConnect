import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/productService.js';

// Loja (público/autenticado)
export const listPublic = asyncHandler(async (req, res) => {
  const products = await svc.listPublicProducts({ search: req.query.search });
  return apiResponse(res, { message: 'Produtos.', data: { products } });
});

export const getOne = asyncHandler(async (req, res) => {
  const product = await svc.getProduct(req.params.id);
  return apiResponse(res, { message: 'Produto.', data: { product } });
});

// Admin
export const listAdmin = asyncHandler(async (req, res) => {
  const products = await svc.listAdminProducts({ search: req.query.search, status: req.query.status });
  return apiResponse(res, { message: 'Produtos (admin).', data: { products } });
});

export const create = asyncHandler(async (req, res) => {
  const product = await svc.createProduct({ ...req.body, imageUrl: req.file?.filename || null }, req.user.id);
  return apiResponse(res, { status: 201, message: 'Produto criado.', data: { product } });
});

export const update = asyncHandler(async (req, res) => {
  const product = await svc.updateProduct(req.params.id, req.body, req.user.id, req.file || null);
  return apiResponse(res, { message: 'Produto atualizado.', data: { product } });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await svc.deleteProduct(req.params.id, req.user.id);
  return apiResponse(res, { message: 'Produto removido.', data: result });
});
