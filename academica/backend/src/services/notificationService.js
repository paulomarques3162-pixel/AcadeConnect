import { prisma } from '../config/prisma.js';

/**
 * Create an in-app notification for a user.
 */
export async function createNotification({ userId, type = 'SYSTEM', title, message, link = null }) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, message, link },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification create failed', err.message);
    return null;
  }
}
