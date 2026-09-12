import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listMyNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where: { userId: req.user.id } }),
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);
  const unread = await prisma.notification.count({ where: { userId: req.user.id, read: false } });
  return apiResponse(res, {
    message: 'Notificações.',
    data: { notifications, unread },
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const unread = await prisma.notification.count({ where: { userId: req.user.id, read: false } });
  return apiResponse(res, { message: 'Não lidas.', data: { unread } });
});

export const markRead = asyncHandler(async (req, res) => {
  // Scope by userId: a notification belongs to the authenticated user only.
  // Using a plain update({ where: { id } }) allowed any logged-in user to mark
  // another user's notification as read (IDOR).
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { read: true },
  });
  if (result.count === 0) throw new ApiError(404, 'Notificação não encontrada.');
  return apiResponse(res, { message: 'Notificação marcada como lida.' });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  return apiResponse(res, { message: 'Todas as notificações marcadas como lidas.' });
});
