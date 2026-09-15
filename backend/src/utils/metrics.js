import { passwordPoolInfo } from './bcryptPool.js';
import { cacheStats } from './cache.js';

/**
 * V9.2 — minimal, dependency-free observability.
 *
 * Goal: make the real bottleneck visible under load (requests/s, error rate,
 * p95/p99 latency, SSE connections, cache effectiveness, DB pool) without
 * exporting any user data. Everything here is aggregate counters only.
 */

const startedAt = Date.now();

const requests = {
  total: 0,
  byStatusClass: { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  byMethod: { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0, OTHER: 0 },
};

// Fixed-size circular reservoir of the most recent latencies (ms).
const DURATION_SAMPLES = 5000;
const durations = new Float64Array(DURATION_SAMPLES);
let durationIndex = 0;
let durationCount = 0;
let durationSum = 0;

// Route-level counters are capped so a pathological path cannot grow the heap.
const MAX_ROUTES = 200;
const byRoute = new Map();

let sseConnections = 0;

export function recordRequest({ method, route, status, durationMs }) {
  requests.total += 1;

  const statusClass = `${Math.floor(status / 100)}xx`;
  if (requests.byStatusClass[statusClass] !== undefined) requests.byStatusClass[statusClass] += 1;

  const m = requests.byMethod[method] !== undefined ? method : 'OTHER';
  requests.byMethod[m] += 1;

  durations[durationIndex] = durationMs;
  durationIndex = (durationIndex + 1) % DURATION_SAMPLES;
  if (durationCount < DURATION_SAMPLES) durationCount += 1;
  durationSum += durationMs;

  if (route) {
    const key = `${method} ${route}`;
    const entry = byRoute.get(key) || { count: 0, errors: 0, totalMs: 0 };
    entry.count += 1;
    entry.totalMs += durationMs;
    if (status >= 500) entry.errors += 1;
    byRoute.set(key, entry);
    if (byRoute.size > MAX_ROUTES) {
      // Drop the least-used route so cardinality stays bounded.
      let smallestKey = null;
      let smallest = Infinity;
      for (const [k, v] of byRoute) {
        if (v.count < smallest) { smallest = v.count; smallestKey = k; }
      }
      if (smallestKey) byRoute.delete(smallestKey);
    }
  }
}

export function sseOpened() { sseConnections += 1; }
export function sseClosed() { sseConnections = Math.max(0, sseConnections - 1); }
export function sseConnectionCount() { return sseConnections; }

function percentile(p) {
  if (durationCount === 0) return 0;
  const values = Array.from(durations.slice(0, durationCount)).sort((a, b) => a - b);
  const idx = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
  return Number(values[idx].toFixed(2));
}

export function metricsSnapshot() {
  const topRoutes = [...byRoute.entries()]
    .map(([route, v]) => ({
      route,
      count: v.count,
      errors: v.errors,
      avgMs: v.count ? Number((v.totalMs / v.count).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: {
      total: requests.total,
      perSecond: Number((requests.total / Math.max(1, (Date.now() - startedAt) / 1000)).toFixed(3)),
      byStatusClass: { ...requests.byStatusClass },
      byMethod: { ...requests.byMethod },
    },
    latencyMs: {
      samples: durationCount,
      avg: durationCount ? Number((durationSum / durationCount).toFixed(2)) : 0,
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
    },
    topRoutes,
    realtime: { sseConnections },
    cache: (() => {
      try { return cacheStats(); } catch { return null; }
    })(),
    passwordHashing: (() => {
      try { return passwordPoolInfo(); } catch { return null; }
    })(),
    process: {
      rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
      node: process.version,
    },
  };
}
