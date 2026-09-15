import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/raffleService.js';

export const list = asyncHandler(async (req, res) => {
  const raffles = await svc.listRaffles({ eventId: req.query.eventId });
  return apiResponse(res, { message: 'Sorteios.', data: { raffles } });
});

export const results = asyncHandler(async (req, res) => {
  const raffles = await svc.listPublicResults({ eventId: req.query.eventId });
  return apiResponse(res, { message: 'Resultados dos sorteios.', data: { raffles } });
});

export const getOne = asyncHandler(async (req, res) => {
  const raffle = await svc.getRaffle(req.params.id);
  return apiResponse(res, { message: 'Sorteio.', data: { raffle } });
});

export const eligible = asyncHandler(async (req, res) => {
  const data = await svc.getEligible(req.params.id);
  return apiResponse(res, { message: 'Participantes elegíveis.', data });
});

export const create = asyncHandler(async (req, res) => {
  const result = await svc.createRaffle(req.body, req.user.id);
  return apiResponse(res, { status: 201, message: 'Sorteio criado.', data: result });
});

export const draw = asyncHandler(async (req, res) => {
  const result = await svc.drawRaffle(req.params.id, req.user.id);
  return apiResponse(res, { status: 201, message: 'Vencedor sorteado!', data: result });
});

export const setStatus = asyncHandler(async (req, res) => {
  const raffle = await svc.setRaffleStatus(req.params.id, req.body.status, req.user.id);
  return apiResponse(res, { message: 'Status do sorteio atualizado.', data: { raffle } });
});
