import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { Prisma } from '@prisma/client';

/**
 * Central error handler. Never leaks stack traces or internal details to clients.
 */
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erro interno do servidor.';
  let details = err.details || null;

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'Conflito: este registro já existe.';
      details = err.meta?.target || null;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Registro não encontrado.';
    } else if (err.code === 'P2024') {
      // Connection-pool timeout: the database is saturated. Answer 503 + Retry
      // instead of 500, so clients/load-balancers back off correctly.
      statusCode = 503;
      message = 'Serviço temporariamente sobrecarregado. Tente novamente em instantes.';
    } else {
      statusCode = 400;
      message = 'Erro no banco de dados.';
    }
  } else if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err?.code === 'P1001' ||
    err?.code === 'P1002' ||
    err?.code === 'P1017'
  ) {
    // Cannot reach / lost the database: transient, retryable.
    statusCode = 503;
    message = 'Serviço temporariamente indisponível. Tente novamente em instantes.';
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 422;
    message = 'Dados inválidos enviados ao banco.';
  }

  if (err instanceof ApiError === false && statusCode === 500) {
    // Log unexpected errors server-side (with the correlation id), respond generically.
    // eslint-disable-next-line no-console
    console.error(`[Unhandled error] req=${_req.id || '-'}`, err);
    message = 'Erro interno do servidor.';
  }

  if (env.nodeEnv === 'development' && statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  if (statusCode === 503) res.setHeader('Retry-After', '2');

  return res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(_req.id ? { requestId: _req.id } : {}),
  });
}
