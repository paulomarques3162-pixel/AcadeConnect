import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const tooMany = (message) => ({ success: false, message });

/**
 * General API rate limit.
 *
 * Raised default (600 / 15min) so that many legitimate participants behind the
 * same NAT/campus network are not blocked, while still absorbing abusive floods.
 * Health checks and preflight requests are never counted.
 */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/health' || req.path === '/health/',
  message: tooMany('Muitas requisições. Tente novamente mais tarde.'),
});

/** Stricter limit for auth endpoints (brute-force protection). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Muitas tentativas de login. Aguarde alguns minutos.'),
});

/**
 * Limit for CPU/IO-expensive endpoints: exports, certificate issuance
 * (single + mass), order creation, payment/PIX generation and registration.
 * These are the endpoints that, if hammered, block the event loop or hold
 * transactions open.
 */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.HEAVY_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Muitas operações em pouco tempo. Aguarde um instante e tente novamente.'),
});

/**
 * Limit for opening SSE streams — prevents a single client from opening
 * thousands of long-lived connections.
 */
export const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.STREAM_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Muitas conexões em tempo real. Aguarde um instante.'),
});
