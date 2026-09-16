import crypto from 'node:crypto';
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

/**
 * Administrative "general communication" (e.g. "O AcadeConnect foi atualizado").
 *
 *  - Recipients are all non-deleted users, selected with ONE query.
 *  - Rows are inserted in bounded `createMany` batches (never N inserts in a
 *    loop, never one giant statement that could exceed parameter limits).
 *  - A short-lived in-process fingerprint (explicit `requestId`, or the hash of
 *    title+message) makes an accidental double-click/retry idempotent, so each
 *    user receives the SAME publication only once.
 *  - SSE pushes the badge update without any client polling.
 */
const BROADCAST_DEDUPE_MS = 60_000;
const recentBroadcasts = new Map();
const BROADCAST_BATCH = 500;

export async function broadcastToAllUsers({ title, message, link = null, type = 'SYSTEM', requestId = null } = {}) {
  const fingerprint = requestId
    ? `id:${requestId}`
    : `txt:${crypto.createHash('sha1').update(`${title}\n${message}`).digest('hex')}`;
  const now = Date.now();
  for (const [key, at] of recentBroadcasts) {
    if (now - at > BROADCAST_DEDUPE_MS) recentBroadcasts.delete(key);
  }
  if (recentBroadcasts.has(fingerprint)) {
    return { duplicate: true, recipients: 0, created: 0 };
  }
  recentBroadcasts.set(fingerprint, now);

  const users = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
  const recipients = users.map((u) => u.id);
  if (recipients.length === 0) return { duplicate: false, recipients: 0, created: 0 };

  let created = 0;
  for (let i = 0; i < recipients.length; i += BROADCAST_BATCH) {
    const slice = recipients.slice(i, i + BROADCAST_BATCH);
    // eslint-disable-next-line no-await-in-loop
    const result = await prisma.notification.createMany({
      data: slice.map((userId) => ({ userId, type, title, message, link })),
    });
    created += result.count;
  }

  publishToUsers(recipients, { type: 'notification', notification: { type, title, message } });
  return { duplicate: false, recipients: recipients.length, created };
}
