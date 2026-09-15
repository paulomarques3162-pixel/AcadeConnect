import crypto from 'node:crypto';
import { recordRequest } from '../utils/metrics.js';

/**
 * V9.2 — request id + latency/error observability.
 *
 * Adds a correlation id to every request (honouring an upstream X-Request-Id),
 * echoes it back, records aggregate metrics and logs only slow or failing
 * requests. It never logs bodies, tokens or personal data.
 */

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_LOG_MS || 1000);

function normalizeRoute(req) {
  if (req.route?.path) return `${req.baseUrl || ''}${req.route.path}`;
  if (req.baseUrl) return `${req.baseUrl}/*`;
  // Unmatched path: collapse ids so metrics cannot explode in cardinality.
  return (req.path || '/').replace(/\/[A-Za-z0-9_-]{8,}/g, '/:id');
}

export function observability(req, res, next) {
  const headerId = req.headers['x-request-id'];
  const id = typeof headerId === 'string' && headerId.length <= 100 ? headerId : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = normalizeRoute(req);
    recordRequest({ method: req.method, route, status: res.statusCode, durationMs });

    if (res.statusCode >= 500 || durationMs >= SLOW_REQUEST_MS) {
      // eslint-disable-next-line no-console
      console.log(
        `[http] ${req.method} ${route} -> ${res.statusCode} in ${durationMs.toFixed(0)}ms req=${id}`
      );
    }
  });

  next();
}
