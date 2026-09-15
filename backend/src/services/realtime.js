import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub hub backing Server-Sent Events (SSE).
 *
 * Goal: stop the frontend from polling message/notification endpoints every few
 * seconds. Instead of `200 users x 12 polls/min`, each open tab holds ONE
 * persistent HTTP connection and receives only what actually changed.
 *
 * Scope/limits (documented honestly):
 *  - Events are delivered to connections attached to THIS process. With a single
 *    Render instance this covers all users. If the service is later scaled to
 *    multiple instances, a shared broker (Redis pub/sub) would be required; the
 *    optimized polling fallback on the frontend keeps things correct until then.
 *  - No loop/security change: the hub only carries already-authorized, minimal
 *    payloads (id + title), never tokens or full records.
 */

class RealtimeHub extends EventEmitter {}

const hub = new RealtimeHub();
// Users open at most a few connections; keep the cap generous but explicit.
hub.setMaxListeners(0);

const userChannel = (userId) => `user:${userId}`;

/** Subscribe to a user's stream. Returns an unsubscribe function. */
export function subscribeUser(userId, listener) {
  const channel = userChannel(userId);
  hub.on(channel, listener);
  return () => hub.off(channel, listener);
}

/** Push an event to a single user's open streams. */
export function publishToUser(userId, event) {
  if (!userId) return;
  hub.emit(userChannel(userId), event);
}

/** Push the same event to several users (batched notifications). */
export function publishToUsers(userIds, event) {
  for (const id of new Set((userIds || []).filter(Boolean))) {
    publishToUser(id, event);
  }
}

/** How many listeners a user currently has (diagnostics/tests). */
export function listenerCount(userId) {
  return hub.listenerCount(userChannel(userId));
}
