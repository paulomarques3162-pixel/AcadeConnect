import { createApp } from './app.js';
import { prisma, warmupPrisma, disconnectPrisma } from './config/prisma.js';
import { env } from './config/env.js';
import { shutdownPasswordPool } from './utils/bcryptPool.js';

const app = createApp();

let server = null;

async function start() {
  try {
    // Warm the pool before accepting traffic so the first request does not pay
    // the connection handshake (cold start).
    await warmupPrisma();
    // eslint-disable-next-line no-console
    console.log('✅ Banco de dados conectado (PostgreSQL).');

    server = app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`🚀 AcadeConnect API rodando em http://localhost:${env.port}`);
      // eslint-disable-next-line no-console
      console.log(`   Health check: http://localhost:${env.port}/api/health`);
    });

    // Behind a load balancer / reverse proxy (Render), keep connections alive
    // long enough to avoid a new TLS handshake per request, but let the proxy
    // close first. Node defaults can drop idle connections too eagerly.
    server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000);
    server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 66000);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Falha ao conectar ao banco de dados:', err.message);
    process.exit(1);
  }
}

start();

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} recebido. Encerrando com segurança...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await shutdownPasswordPool();
    await disconnectPrisma();
  } finally {
    process.exit(0);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Never let an unexpected rejection kill the process silently.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err);
});

export { app, prisma };
