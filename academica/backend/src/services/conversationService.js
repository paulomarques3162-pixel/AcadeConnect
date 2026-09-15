import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { createNotification } from './notificationService.js';

const conversationInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
  assignedTo: { select: { id: true, name: true, role: true } },
  messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, role: true } } } },
};

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

export async function listMyConversations(userId) {
  return prisma.conversation.findMany({
    where: { userId },
    include: { assignedTo: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: 'desc' },
  });
}

export async function listAllConversations({ status, search } = {}) {
  return prisma.conversation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ subject: { contains: search, mode: 'insensitive' } }, { user: { name: { contains: search, mode: 'insensitive' } } }] } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } }, assignedTo: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: 'desc' },
  });
}

export async function getConversation(id, requester) {
  await authorizeConversation(id, requester);
  return prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
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
    const admins = await listAdmins();
    await Promise.all(
      admins.map((a) =>
        createNotification({ userId: a.id, type: 'SYSTEM', title: 'Nova mensagem de participante', message: `Nova mensagem de ${requester.name}.`, link: '/admin/comunicacao' })
      )
    );
  } else {
    await createNotification({ userId: conversation.userId, type: 'SYSTEM', title: 'Nova resposta da organização', message: 'Você recebeu uma resposta.', link: '/comunicacao' });
  }
  return message;
}

export async function setConversationStatus(id, status, operatorId) {
  if (!['OPEN', 'RESOLVED'].includes(status)) throw new ApiError(422, 'Status de conversa inválido.');
  await authorizeConversation(id, { id: operatorId, role: 'ADMIN' });
  const updated = await prisma.conversation.update({ where: { id }, data: { status } });
  await createAuditLog({ userId: operatorId, action: 'CONVERSATION_STATUS_CHANGED', resource: 'Conversation', resourceId: id, details: { status } });
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
