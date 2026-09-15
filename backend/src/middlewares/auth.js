import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cacheWrap, invalidate } from '../utils/cache.js';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  institutionId: true,
  deletedAt: true,
};

// The authenticated user is looked up on EVERY protected request. That is one
// indexed query per request; under concurrency it doubles the DB load for no
// benefit when nothing changed. A very short TTL removes the repeats while
// keeping authorization effectively live (explicitly invalidated on writes).
const USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_MS || 5000);

async function loadUser(id) {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

/** Invalidate the cached authenticated user (call after role/profile changes). */
export function invalidateUserCache(userId) {
  invalidate(`auth:user:${userId}`);
}

async function getCachedUser(id) {
  return cacheWrap(`auth:user:${id}`, USER_CACHE_TTL_MS, () => loadUser(id));
}

/**
 * Extracts the bearer token from Authorization header or HttpOnly cookie.
 */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookie = req.cookies?.[env.cookieName];
  if (cookie) return cookie;
  return null;
}

/**
 * Authentication middleware. Attaches req.user when a valid token is present.
 * Supports both Authorization header and HttpOnly cookie.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError(401, 'Não autenticado. Faça login para continuar.');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Sessão inválida ou expirada. Faça login novamente.');
  }

  const user = await getCachedUser(payload.sub);

  if (!user || user.deletedAt) {
    throw new ApiError(401, 'Usuário não encontrado ou conta desativada.');
  }

  req.user = user;
  next();
});

/**
 * Authentication for the SSE stream. EventSource cannot send headers, so the
 * short-lived, purpose-scoped stream token is read from `?token=`.
 */
export const authenticateStreamToken = asyncHandler(async (req, _res, next) => {
  const token = String(req.query.token || '').trim();
  if (!token) throw new ApiError(401, 'Não autenticado.');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Sessão inválida ou expirada.');
  }
  if (payload.purpose !== 'stream') {
    throw new ApiError(401, 'Token inválido para este recurso.');
  }

  const user = await getCachedUser(payload.sub);
  if (!user || user.deletedAt) throw new ApiError(401, 'Usuário não encontrado ou conta desativada.');

  req.user = user;
  next();
});

/**
 * Optional authentication: sets req.user if present, never rejects.
 */
export const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = await getCachedUser(payload.sub);
      if (user && !user.deletedAt) req.user = user;
    } catch {
      // ignore invalid optional token
    }
  }
  next();
});

/**
 * RBAC authorization. Usage: authorize('ADMIN') or authorize('ADMIN', 'ORGANIZER').
 */
export const authorize = (...roles) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw new ApiError(401, 'Não autenticado.');
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'Você não tem permissão para realizar esta ação.');
    }
    next();
  });
