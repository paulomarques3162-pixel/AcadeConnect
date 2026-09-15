import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/pixService.js';

export const list = asyncHandler(async (_req, res) => {
  const configs = await svc.listPixConfigs();
  const active = configs.find((c) => c.active) || null;
  return apiResponse(res, { message: 'Configurações PIX.', data: { configs, active } });
});

export const create = asyncHandler(async (req, res) => {
  const config = await svc.createPixConfig(req.body, req.user.id);
  return apiResponse(res, { status: 201, message: 'Chave PIX cadastrada.', data: { config } });
});

export const update = asyncHandler(async (req, res) => {
  const config = await svc.updatePixConfig(req.params.id, req.body, req.user.id);
  return apiResponse(res, { message: 'Chave PIX atualizada.', data: { config } });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await svc.deletePixConfig(req.params.id, req.user.id);
  return apiResponse(res, { message: result.deactivated ? 'Chave desativada (histórico preservado).' : 'Chave removida.', data: result });
});
