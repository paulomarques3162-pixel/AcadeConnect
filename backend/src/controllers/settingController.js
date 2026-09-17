import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/settingService.js';

/** Público: qualquer visitante pode ler as informações de contato. */
export const getContact = asyncHandler(async (_req, res) => {
  const contact = await svc.getContactSettings();
  return apiResponse(res, { message: 'Informações de contato.', data: { contact } });
});

/** Administrativo: somente ADMIN (rota protegida). */
export const updateContact = asyncHandler(async (req, res) => {
  const contact = await svc.updateContactSettings(req.body, req.user.id);
  return apiResponse(res, { message: 'Informações de contato atualizadas.', data: { contact } });
});
