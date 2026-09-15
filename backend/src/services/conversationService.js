import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification, createNotifications } from './notificationService.js';
import { publishToUser } from './realtime.js';

const conversationInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
  assignedTo: { select: { id: true, name: true, role: true } },
  messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, role: true } } } },
};

// Hard caps so a single request can never return an unbounded result set.
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 200;
const DEFAULT_MESSAGE_WINDOW = 100;

/** Garante que o solicitante pode acessar a conversa (dono ou staff). */
async function authorizeConversation(conversationId, requester) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new ApiError(404, 'Conversa não encontrada.');
  const isStaff = requester && ['ADMIN', 'ORGANIZER'].includes(requester.role);
  if (!isStaff && conversation.userId !== requester?.id) throw new ApiError(403, 'Sem permissão para acessar esta conversa.');
  return conversation;
}

/** Admin/organizador disponíveis para iniciar conversa. */
export async function listAdmins() {
  return prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'ORGANIZER'] }, deletedAt: null },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
}

/** Conta mensagens não lidas para o usuário autenticado. */
export async function unreadCount(requester) {
  const isStaff = ['ADMIN', 'ORGANIZER'].includes(requester.role);
  return prisma.message.count({
    where: {
      senderId: { not: requester.id },
      readAt: null,
      ...(isStaff ? {} : { conversation: { userId: requester.id } }),
    },
  });
}

export async function listMyConversations(userId, { page = 1, limit = MAX_CONVERSATIONS } = {}) {
  const take = Math.min(Number(limit) || MAX_CONVERSATIONS, MAX_CONVERSATIONS);
  return prisma.conversation.findMany({
    where: { userId },
    include: { assignedTo: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: 'desc' },
    skip: (Math.max(Number(page) || 1, 1) - 1) * take,
    take,
  });
}

export async function listAllConversations({ status, search, page = 1, limit = MAX_CONVERSATIONS } = {}) {
  const take = Math.min(Number(limit) || MAX_CONVERSATIONS, MAX_CONVERSATIONS);
  return prisma.conversation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ subject: { contains: search, mode: 'insensitive' } }, { user: { name: { contains: search, mode: 'insensitive' } } }] } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } }, assignedTo: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: 'desc' },
    skip: (Math.max(Number(page) || 1, 1) - 1) * take,
    take,
  });
}

export async function getConversation(id, requester) {
  await authorizeConversation(id, requester);
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  });
  if (!conversation) throw new ApiError(404, 'Conversa não encontrada.');
  // Return the most RECENT messages (bounded), oldest-first, instead of the
  // entire history — a long thread must not become an unbounded response.
  const recentDesc = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    include: { sender: { select: { id: true, name: true, role: true } } },
    take: MAX_MESSAGES,
  });
  return { ...conversation, messages: recentDesc.reverse() };
}

/**
 * Incremental fetch used by the live conversation hook: returns ONLY messages
 * newer than `since` (ISO). The periodic refresh therefore transfers a few
 * bytes instead of re-downloading the whole thread every 5 seconds.
 *
 * Uses `gte` + client-side de-duplication by id so two messages written in the
 * same millisecond are never skipped.
 */
export async function getMessagesSince(id, requester, since = null) {
  const conversation = await authorizeConversation(id, requester);
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  const messages = await prisma.message.findMany({
    where: { conversationId: id, ...(validSince ? { createdAt: { gte: validSince } } : {}) },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { id: true, name: true, role: true } } },
    take: MAX_MESSAGES,
  });

  return {
    conversation: { id: conversation.id, status: conversation.status, lastMessageAt: conversation.lastMessageAt },
    messages,
  };
}

/** Cria a conversa com a primeira mensagem. */
export async function startConversation(userId, { subject = null, message, assignedToId = null }) {
  if (!message || !String(message).trim()) throw new ApiError(422, 'Escreva uma mensagem.');
  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        userId,
        subject: subject ? String(subject).trim() : null,
        assignedToId: assignedToId || null,
        lastMessageAt: new Date(),
      },
    });
    await tx.message.create({ data: { conversationId: conv.id, senderId: userId, senderRole: 'PARTICIPANT', body: String(message).trim() } });
    return conv;
  });
  return prisma.conversation.findUnique({ where: { id: conversation.id }, include: conversationInclude });
}

/**
 * ADM/ORGANIZER inicia uma conversa DIRECIONADA para um usuário específico.
 * A conversa pertence exclusivamente ao usuário selecionado; só ele a vê.
 */
export async function startConversationAsAdmin({ targetUserId, subject = null, message, assignedToId = null, operator }) {
  if (!message || !String(message).trim()) throw new ApiError(422, 'Escreva uma mensagem.');
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, deletedAt: true },
  });
  if (!target || target.deletedAt) throw new ApiError(404, 'Usuário não encontrado.');

  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        userId: target.id,
        subject: subject ? String(subject).trim() : null,
        assignedToId: assignedToId || operator.id,
        lastMessageAt: new Date(),
      },
    });
    await tx.message.create({
      data: {
        conversationId: conv.id,
        senderId: operator.id,
        senderRole: operator.role,
        body: String(message).trim(),
      },
    });
    return conv;
  });

  await createNotification({
    userId: target.id,
    type: 'SYSTEM',
    title: 'Nova mensagem da organização',
    message: 'Você recebeu uma nova mensagem da administração.',
    link: '/comunicacao',
  });
  publishToUser(target.id, { type: 'conversation', conversationId: conversation.id });

  return prisma.conversation.findUnique({ where: { id: conversation.id }, include: conversationInclude });
}

export async function sendMessage(id, requester, body) {
  const conversation = await authorizeConversation(id, requester);
  if (!body || !String(body).trim()) throw new ApiError(422, 'Escreva uma mensagem.');
  if (conversation.status === 'RESOLVED') throw new ApiError(409, 'Esta conversa está resolvida. Reabra para responder.');

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: { conversationId: id, senderId: requester.id, senderRole: requester.role, body: String(body).trim() },
    });
    await tx.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        ...(requester.role !== 'PARTICIPANT' && !conversation.assignedToId ? { assignedToId: requester.id } : {}),
      },
    });
    return msg;
  });

  // Notifica o outro lado (participante <-> admin).
  if (requester.role === 'PARTICIPANT') {
    // Single bulk INSERT instead of one query per admin (N+1 fix).
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'ORGANIZER'] }, deletedAt: null },
      select: { id: true },
    });
    await createNotifications(
      admins.map((a) => a.id),
      { type: 'SYSTEM', title: 'Nova mensagem de participante', message: `Nova mensagem de ${requester.name}.`, link: '/admin/comunicacao' }
    );
  } else {
    await createNotification({ userId: conversation.userId, type: 'SYSTEM', title: 'Nova resposta da organização', message: 'Você recebeu uma resposta.', link: '/comunicacao' });
    publishToUser(conversation.userId, { type: 'message', conversationId: id });
  }
  return message;
}

export async function setConversationStatus(id, status, operatorId) {
  if (!['OPEN', 'RESOLVED'].includes(status)) throw new ApiError(422, 'Status de conversa inválido.');
  await authorizeConversation(id, { id: operatorId, role: 'ADMIN' });
  const updated = await prisma.conversation.update({ where: { id }, data: { status } });
  await createAuditLog({ userId: operatorId, action: 'CONVERSATION_STATUS_CHANGED', resource: 'Conversation', resourceId: id, details: { status } });
  publishToUser(updated.userId, { type: 'conversation', conversationId: id });
  return updated;
}

/** Marca as mensagens recebidas como lidas. */
export async function markConversationRead(id, requester) {
  const conversation = await authorizeConversation(id, requester);
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: requester.id }, readAt: null },
    data: { readAt: new Date() },
  });
  return { read: true, conversationId: conversation.id };
}
