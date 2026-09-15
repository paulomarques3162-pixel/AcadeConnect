import { signToken } from '../utils/jwt.js';
import { subscribeUser } from '../services/realtime.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Issue a SHORT-LIVED token used only to open the SSE stream.
 *
 * EventSource cannot send an Authorization header, so the token must travel in
 * the query string. Using a dedicated purpose-scoped token (2 minutes, only
 * valid for the stream) avoids putting the 7-day session JWT in URLs/logs.
 */
export const streamToken = asyncHandler(async (req, res) => {
  const token = signToken({ sub: req.user.id, purpose: 'stream' }, { expiresIn: '2m' });
  return apiResponse(res, { message: 'Token de stream.', data: { token } });
});

/**
 * Server-Sent Events stream. One long-lived connection per open tab; the server
 * pushes only new events (notifications / messages) instead of the client
 * polling every few seconds.
 */
export const stream = asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering (nginx/Render) so events flush immediately.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const write = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      /* connection already gone */
    }
  };

  write({ type: 'connected', at: Date.now() });

  const unsubscribe = subscribeUser(req.user.id, write);

  // Heartbeat keeps intermediary proxies from closing an idle connection.
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 25_000);
  if (ping.unref) ping.unref();

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});
