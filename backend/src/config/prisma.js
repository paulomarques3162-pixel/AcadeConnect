import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma instance reused across the whole process.
 *
 * Why this matters for concurrency:
 *  - Creating `new PrismaClient()` per request opens a new connection pool each
 *    time and exhausts PostgreSQL connections under load. We keep ONE client.
 *  - On nodemon/dev hot-reload the module can be evaluated more than once; the
 *    client is cached on `globalThis` so reloads do not leak pools.
 *  - The connection pool size is explicit and env-tunable. Raising it blindly is
 *    NOT the fix for slowness (it can make it worse); see PRISMA_CONNECTION_LIMIT.
 */

const LOG_QUERIES = process.env.PRISMA_LOG_QUERIES === 'true';
const SLOW_QUERY_MS = Number(process.env.PRISMA_SLOW_QUERY_MS || 100);

/**
 * Append safe, explicit pool parameters to DATABASE_URL when the operator has
 * not already chosen them. Never overwrites a value the operator set.
 *
 *   connection_limit -> max connections this process opens
 *   pool_timeout     -> seconds to wait for a free connection before failing
 *   connect_timeout  -> seconds to wait for a TCP/DB handshake
 */
function withPoolParams(rawUrl) {
  if (!rawUrl) return rawUrl;
  const defaults = {
    connection_limit: process.env.PRISMA_CONNECTION_LIMIT || '10',
    // Seconds a request waits for a free connection before failing. 20s is too
    // long under load (requests pile up). Fail fast so the client can retry.
    pool_timeout: process.env.PRISMA_POOL_TIMEOUT || '10',
    connect_timeout: process.env.PRISMA_CONNECT_TIMEOUT || '10',
    // Abort a socket that stops responding so a stuck connection is recycled.
    socket_timeout: process.env.PRISMA_SOCKET_TIMEOUT || '30',
  };
  try {
    const href = /^postgres(ql)?:\/\//.test(rawUrl) ? rawUrl : rawUrl;
    const u = new URL(href);
    for (const [key, value] of Object.entries(defaults)) {
      if (value && !u.searchParams.has(key)) u.searchParams.set(key, value);
    }
    return u.toString();
  } catch {
    // If the URL cannot be parsed, keep it untouched rather than break startup.
    return rawUrl;
  }
}

function createClient() {
  const log = LOG_QUERIES ? ['query', 'warn', 'error'] : ['warn', 'error'];
  const client = new PrismaClient({
    ...(process.env.DATABASE_URL ? { datasourceUrl: withPoolParams(process.env.DATABASE_URL) } : {}),
    log,
  });

  if (LOG_QUERIES) {
    client.$on('query', (e) => {
      if (e.duration >= SLOW_QUERY_MS) {
        // eslint-disable-next-line no-console
        console.warn(`[prisma:slow] ${e.duration}ms ${e.query}`);
      }
    });
  }

  return client;
}

export const prisma = globalThis.__acadePrisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__acadePrisma = prisma;
}

/**
 * Warm the pool once at boot so the first real request does not pay the
 * connection handshake (cold start on Render).
 */
export async function warmupPrisma() {
  await prisma.$queryRaw`SELECT 1`;
}

/**
 * Close the pool cleanly on shutdown.
 */
export async function disconnectPrisma() {
  await prisma.$disconnect().catch(() => {});
}
