import { prisma } from '../config/prisma.js';
import { publishToUser, publishToUsers } from './realtime.js';

/**
 * Create an in-app notification for a user.
 * Also pushes it over SSE so the bell/badge updates without polling.
 */
export async function createNotification({ userId, type = 'SYSTEM', title, message, link = null }) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, type, title, message, link },
    });
    publishToUser(userId, { type: 'notification', notification });
    return notification;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification create failed', err.message);
    return null;
  }
}

/**
 * Bulk notification creation.
 *
 * Replaces the previous N+1 pattern (one INSERT + one round-trip per user,
 * e.g. notifying every registered participant of an event change, or every
 * admin of a new participant message). One INSERT for all rows and one SSE
 * event per recipient.
 *
 * Returns the number of rows created (0 when the list is empty).
 */
export async function createNotifications(recipients, payload) {
  const rows = [...new Set((recipients || []).filter(Boolean))].map((userId) => ({
    userId,
    type: payload.type || 'SYSTEM',
    title: payload.title,
    message: payload.message,
    link: payload.link || null,
  }));
  if (rows.length === 0) return 0;
  try {
    const result = await prisma.notification.createMany({ data: rows });
    // Minimal SSE payload (no ids) — the client just refreshes its counters.
    publishToUsers(rows.map((r) => r.userId), {
      type: 'notification',
      notification: { type: payload.type || 'SYSTEM', title: payload.title, message: payload.message },
    });
    return result.count;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification bulk create failed', err.message);
    return 0;
  }
}
