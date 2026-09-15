import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const tooMany = (message) => ({ success: false, message });

const sha16 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

/**
 * V9.2 — NAT-safe rate limiting.
 *
 * The previous limits were keyed by IP. That is dangerous for this deployment:
 * a whole campus/atletica network usually shares ONE public IP, so a global
 * "600 requests / 15min per IP" blocked hundreds of legitimate participants at
 * the same time (and "20 logins / 15min per IP" blocked a class logging in
 * together).
 *
 * New strategy:
 *  - Any request that carries a session token gets its OWN bucket (hash of the
 *    token; we never store the token itself). Many users behind one NAT no
 *    longer consume a shared budget.
 *  - Anonymous requests fall back to the IP bucket, still bounded against floods.
 *  - Login/registration brute-force is limited per (IP + email), and only FAILED
 *    attempts count, so legitimate simultaneous logins never consume the quota.
 *  - A generous per-IP "peak" limiter absorbs spikes while still stopping abuse.
 */

/** Authenticated/token-bearing requests get a per-session bucket. */
function sessionKey(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return `s:${sha16(header.slice(7).trim())}`;
  const cookie = req.cookies?.[env.cookieName];
  if (cookie) return `s:${sha16(cookie)}`;
  return `ip:${req.ip}`;
}

/** Per-user bucket when the route already authenticated the request. */
function userKey(req) {
  return req.user?.id ? `u:${req.user.id}` : sessionKey(req);
}

/** Login/registration brute-force bucket: IP + email (never blocks other users). */
function emailIpKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${req.ip}|${email ? sha16(email) : 'anon'}`;
}

const skipNonBusiness = (req) => req.method === 'OPTIONS' || req.path === '/health' || req.path === '/health/';

const hasSession = (req) =>
  Boolean(req.headers.authorization?.startsWith('Bearer ') || req.cookies?.[env.cookieName]);

/**
 * General API limit.
 *
 * Two budgets to stay fair under a shared campus NAT:
 *  - authenticated/token requests: per-session bucket, 600/min (≈10 req/s);
 *  - anonymous requests: per-IP bucket, but a much higher ceiling (default
 *    3000/min) because an entire lab/campus can share one public IP, and a
 *    500-user public browsing wave must not be throttled.
 */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: (req) => (hasSession(req) ? env.rateLimitMax : env.rateLimitAnonMax),
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: sessionKey,
  skip: skipNonBusiness,
  message: tooMany('Muitas requisições. Tente novamente mais tarde.'),
});

/**
 * Brute-force protection for auth endpoints.
 * Counts only FAILED attempts, per (IP + email). A successful login costs
 * nothing, so N legitimate users can log in at once behind the same NAT.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: emailIpKey,
  skipSuccessfulRequests: true,
  message: tooMany('Muitas tentativas de login. Aguarde alguns minutos.'),
});

/**
 * Coarse per-IP peak limiter for the auth endpoints. Absorbs (and allows) a
 * legitimate simultaneous login wave, but a single source cannot flood.
 */
export const authPeakLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.authPeakLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => `ip:${req.ip}`,
  message: tooMany('Muitas tentativas simultâneas. Tente novamente em instantes.'),
});

/**
 * Limit for CPU/IO-expensive endpoints: exports, certificate issuance (single +
 * mass), order creation, payment/PIX generation and registration. Keyed per
 * authenticated user (set by the route's `authenticate`), so concurrent
 * participants do not share a quota.
 */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.heavyRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: userKey,
  message: tooMany('Muitas operações em pouco tempo. Aguarde um instante e tente novamente.'),
});

/**
 * Limit for opening SSE streams — prevents a single client from opening
 * thousands of long-lived connections. One bucket per user/session.
 */
export const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.streamRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: userKey,
  message: tooMany('Muitas conexões em tempo real. Aguarde um instante.'),
});
