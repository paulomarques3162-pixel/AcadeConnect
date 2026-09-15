import { Worker } from 'node:worker_threads';
import os from 'node:os';
import bcrypt from 'bcryptjs';

/**
 * Worker-thread pool for bcrypt (V9.2).
 *
 * WHY: `bcryptjs` runs in pure JavaScript. Even its async API occupies the
 * single Node thread while hashing (~200-400 ms at cost 12). Under a login peak
 * of hundreds of simultaneous users, that serializes and blocks the event loop,
 * so unrelated requests (event listing, QR scan, SSE) stall behind logins.
 *
 * WHAT: the same bcryptjs library and the same cost run inside a small pool of
 * worker threads. The HTTP thread only awaits a promise. Security parameters are
 * unchanged (never lower the cost just to win a benchmark).
 *
 * RESILIENCE: if workers cannot be created (restricted runtime, bundler...), the
 * module transparently falls back to in-process bcrypt. Authentication never
 * fails because of the pool.
 *
 * CONFIG:
 *   BCRYPT_ROUNDS          cost factor (default 12)
 *   PASSWORD_HASH_WORKERS  worker count; 0 disables the pool (default: CPUs-1, max 4)
 */

function clampRounds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.min(Math.max(Math.trunc(n), 10), 15);
}

const ROUNDS = clampRounds(process.env.BCRYPT_ROUNDS || 12);

function resolveWorkerCount() {
  const raw = process.env.PASSWORD_HASH_WORKERS;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 8) : 0;
  }
  const cpus = os.availableParallelism?.() || os.cpus()?.length || 2;
  return Math.max(1, Math.min(4, cpus - 1));
}

const WORKER_COUNT = resolveWorkerCount();

let workers = null;
let poolDisabled = WORKER_COUNT === 0;
let sequence = 0;
let messageId = 0;
const pending = new Map();

function spawnPool() {
  const url = new URL('./bcryptWorker.js', import.meta.url);
  const list = [];
  for (let i = 0; i < WORKER_COUNT; i += 1) {
    const worker = new Worker(url, { type: 'module' });
    worker.on('message', (msg) => {
      const entry = pending.get(msg?.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error || 'bcrypt worker error'));
    });
    worker.on('error', (err) => {
      // A broken worker must not silently drop queued calls.
      for (const [id, entry] of pending) {
        entry.reject(err instanceof Error ? err : new Error('bcrypt worker crashed'));
        pending.delete(id);
      }
    });
    list.push(worker);
  }
  return list;
}

function ensurePool() {
  if (poolDisabled) return null;
  if (workers) return workers;
  try {
    workers = spawnPool();
    return workers;
  } catch {
    poolDisabled = true;
    workers = null;
    return null;
  }
}

function inProcess(op, args) {
  if (op === 'hash') return bcrypt.hash(String(args.password), Number(args.rounds) || ROUNDS);
  return bcrypt.compare(String(args.password), String(args.hash));
}

function dispatch(op, args) {
  const pool = ensurePool();
  if (!pool || pool.length === 0) return inProcess(op, args);

  const worker = pool[sequence % pool.length];
  sequence += 1;
  const id = (messageId += 1);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('bcrypt worker timeout'));
    }, 30_000);
    if (timer.unref) timer.unref();

    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    try {
      worker.postMessage({ id, op, args });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

/** Hash a password with the configured cost, off the main thread when possible. */
export async function hashPassword(password) {
  try {
    return await dispatch('hash', { password: String(password), rounds: ROUNDS });
  } catch {
    return inProcess('hash', { password: String(password), rounds: ROUNDS });
  }
}

/** Verify a password against its hash. Never throws for a bad password. */
export async function verifyPassword(password, hash) {
  try {
    return await dispatch('compare', { password: String(password), hash: String(hash) });
  } catch {
    return inProcess('compare', { password: String(password), hash: String(hash) });
  }
}

/** Pool metadata for metrics/reporting. */
export function passwordPoolInfo() {
  return {
    rounds: ROUNDS,
    workers: WORKER_COUNT,
    active: Boolean(workers) && !poolDisabled,
    pending: pending.size,
  };
}

/** Terminate workers on graceful shutdown. */
export async function shutdownPasswordPool() {
  if (!workers) return;
  const list = workers;
  workers = null;
  await Promise.allSettled(list.map((w) => w.terminate()));
}
