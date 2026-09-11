import { createApp } from './app.js';
import { prisma } from './config/prisma.js';
import { env } from './config/env.js';

const app = createApp();

async function start() {
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('✅ Banco de dados conectado (PostgreSQL).');

    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`🚀 AcadeConnect API rodando em http://localhost:${env.port}`);
      // eslint-disable-next-line no-console
      console.log(`   Health check: http://localhost:${env.port}/api/health`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Falha ao conectar ao banco de dados:', err.message);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
