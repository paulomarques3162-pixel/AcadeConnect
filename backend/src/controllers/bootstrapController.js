import { prisma } from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { unreadCount as unreadConversationCount } from '../services/conversationService.js';

const NOTIFICATION_PREVIEW = 8;

/**
 * V9.2 — one request to initialize an authenticated session.
 *
 * Before this endpoint, a freshly logged-in tab fired GET /notifications AND
 * GET /conversations/unread-count right away. During a login peak that doubles
 * the post-login query wave. Aggregating the three cheap reads into a single
 * response removes one full round-trip per user with no change to the API
 * contract used by the rest of the app (the individual endpoints remain).
 */
export const bootstrap = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [notifications, unreadNotifications, unreadConversations] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_PREVIEW,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
    unreadConversationCount(req.user),
  ]);

  return apiResponse(res, {
    message: 'Sessão inicializada.',
    data: {
      user: { ...req.user, avatarUrl: publicUrl(req.user.avatarUrl) },
      notifications,
      unreadNotifications,
      unreadConversations,
    },
  });
});
