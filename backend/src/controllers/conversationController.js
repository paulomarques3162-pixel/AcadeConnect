import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import * as svc from '../services/conversationService.js';

export const admins = asyncHandler(async (_req, res) => {
  const admins = await svc.listAdmins();
  return apiResponse(res, { message: 'Administradores disponíveis.', data: { admins } });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const unread = await svc.unreadCount(req.user);
  return apiResponse(res, { message: 'Mensagens não lidas.', data: { unread } });
});

export const mine = asyncHandler(async (req, res) => {
  const conversations = await svc.listMyConversations(req.user.id, req.query);
  return apiResponse(res, { message: 'Minhas conversas.', data: { conversations } });
});

export const adminList = asyncHandler(async (req, res) => {
  const conversations = await svc.listAllConversations({ status: req.query.status, search: req.query.search, page: req.query.page, limit: req.query.limit });
  return apiResponse(res, { message: 'Conversas.', data: { conversations } });
});

export const getOne = asyncHandler(async (req, res) => {
  const conversation = await svc.getConversation(req.params.id, req.user);
  return apiResponse(res, { message: 'Conversa.', data: { conversation } });
});

/**
 * Incremental messages endpoint. The live-conversation hook calls this with
 * `?since=<lastMessageCreatedAt>` so only new messages are transferred.
 */
export const messagesSince = asyncHandler(async (req, res) => {
  const result = await svc.getMessagesSince(req.params.id, req.user, req.query.since);
  return apiResponse(res, { message: 'Mensagens.', data: result });
});

export const start = asyncHandler(async (req, res) => {
  const conversation = await svc.startConversation(req.user.id, req.body);
  return apiResponse(res, { status: 201, message: 'Conversa iniciada.', data: { conversation } });
});

export const adminStart = asyncHandler(async (req, res) => {
  const conversation = await svc.startConversationAsAdmin({
    targetUserId: req.body.userId,
    subject: req.body.subject,
    message: req.body.message,
    assignedToId: req.body.assignedToId || null,
    operator: req.user,
  });
  return apiResponse(res, { status: 201, message: 'Mensagem enviada.', data: { conversation } });
});

export const send = asyncHandler(async (req, res) => {
  const message = await svc.sendMessage(req.params.id, req.user, req.body.body);
  return apiResponse(res, { status: 201, message: 'Mensagem enviada.', data: { message } });
});

export const setStatus = asyncHandler(async (req, res) => {
  const conversation = await svc.setConversationStatus(req.params.id, req.body.status, req.user.id);
  return apiResponse(res, { message: 'Status atualizado.', data: { conversation } });
});

export const markRead = asyncHandler(async (req, res) => {
  const result = await svc.markConversationRead(req.params.id, req.user);
  return apiResponse(res, { message: 'Mensagens marcadas como lidas.', data: result });
});
