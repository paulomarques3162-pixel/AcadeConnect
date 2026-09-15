/**
 * Tiny in-process TTL cache for read-heavy, low-write data (public event list,
 * product store, raffle results, dashboard aggregates...).
 *
 * Deliberately dependency-free and in-memory:
 *  - No Redis is introduced just for the sake of it. The prompt explicitly says
 *    the solution must be proportional to the problem.
 *  - Single backend instance (Render) => a process-local cache removes the
 *    repeated identical queries that dominate concurrent traffic.
 *
 * Correctness rules:
 *  - ONLY use for data that may be a few seconds stale.
 *  - NEVER cache per-user private data (ownership/authorization must stay exact).
 *  - Invalidate the relevant prefix after any write that changes the data.
 */

const store = new Map();
let hits = 0;
let misses = 0;

// Periodic sweep so expired entries do not grow the heap forever.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60_000);
if (sweep.unref) sweep.unref();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses += 1;
    return undefined;
  }
  hits += 1;
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 10_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/**
 * Return the cached value, or compute + store it.
 * Concurrent callers share the same in-flight promise (single-flight), so a
 * burst of identical requests triggers ONE database query instead of N.
 */
const inflight = new Map();

export async function cacheWrap(key, ttlMs, producer) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  if (inflight.has(key)) return inflight.get(key);

  const promise = Promise.resolve()
    .then(producer)
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Drop every key that starts with `prefix` (call after a mutation). */
export function invalidate(prefix = '') {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheStats() {
  return { size: store.size, hits, misses, inflight: inflight.size };
}
