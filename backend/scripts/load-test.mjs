#!/usr/bin/env node
/**
 * AcadeConnect V9.2 - load test.
 *
 * Dependency-free (uses the built-in fetch). Runs progressively so a spike can
 * be observed before going to production:
 *
 *   node scripts/load-test.mjs --scenario login    --levels 25,50,100
 *   node scripts/load-test.mjs --scenario navigate --levels 25,50,100,250
 *   node scripts/load-test.mjs --scenario events   --levels 100,250,500
 *   node scripts/load-test.mjs --scenario realtime --levels 50,100
 *   node scripts/load-test.mjs --scenario messages --levels 50,100
 *
 * Always start small (25/50) and increase. NEVER jump straight to 500 in
 * production. Read RELATORIO_ESCALABILIDADE_V9_2.md before running.
 *
 * Credentials: the script needs real accounts.
 *   - LOAD_TEST_EMAIL / LOAD_TEST_PASSWORD                         (single account)
 *   - LOAD_TEST_EMAIL_TEMPLATE="load{i}@example.com" + password    (one per VU)
 * Creating the accounts is the operator's responsibility; nothing here writes
 * user data (except scenario `register`, which is opt-in and requires --allow-write).
 *
 * Exit code is 0 even with errors; inspect the report. It is a diagnostic tool,
 * not a pass/fail gate.
 */

import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- config -----

function arg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value === undefined || value.startsWith('--') ? true : value;
}

const cfg = {
  base: String(arg('base', process.env.LOAD_TEST_BASE_URL || 'http://localhost:5000/api')).replace(/\/$/, ''),
  scenario: String(arg('scenario', process.env.LOAD_TEST_SCENARIO || 'login')),
  levels: String(arg('levels', process.env.LOAD_TEST_LEVELS || '25'))
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
  email: arg('email', process.env.LOAD_TEST_EMAIL || ''),
  template: arg('template', process.env.LOAD_TEST_EMAIL_TEMPLATE || ''),
  password: arg('password', process.env.LOAD_TEST_PASSWORD || ''),
  timeoutMs: Number(arg('timeout', process.env.LOAD_TEST_TIMEOUT_MS || 30000)),
  holdMs: Number(arg('hold', process.env.LOAD_TEST_HOLD_MS || 10000)),
  allowWrite: Boolean(arg('allow-write', false)),
  registerEventId: arg('event', process.env.LOAD_TEST_EVENT_ID || ''),
  out: arg('out', ''),
};

const emailFor = (i) => (cfg.template ? cfg.template.replace('{i}', String(i)) : cfg.email);

// ---------------------------------------------------------------- helpers -----

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(1));
}

function summarize(samples) {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 300).length;
  const clientErr = samples.filter((s) => s.status >= 400 && s.status < 500).length;
  const serverErr = samples.filter((s) => s.status >= 500).length;
  const networkErr = samples.filter((s) => s.status === 0).length;
  const durations = samples.map((s) => s.ms).sort((a, b) => a - b);
  const total = durations.reduce((a, b) => a + b, 0);
  const wall = samples.length ? Math.max(...samples.map((s) => s.end)) - Math.min(...samples.map((s) => s.start)) : 0;
  return {
    requests: samples.length,
    ok,
    clientErr,
    serverErr,
    networkErr,
    errorRate: samples.length ? Number((((samples.length - ok) / samples.length) * 100).toFixed(1)) : 0,
    rps: wall > 0 ? Number((samples.length / (wall / 1000)).toFixed(1)) : 0,
    avgMs: samples.length ? Number((total / samples.length).toFixed(1)) : 0,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    maxMs: durations.length ? Number(durations[durations.length - 1].toFixed(1)) : 0,
  };
}

async function timed(label, fn) {
  const start = performance.now();
  let status = 0;
  try {
    const res = await fn();
    status = res?.status ?? 200;
    return { label, status, ms: performance.now() - start, start, end: performance.now(), body: res?.body };
  } catch {
    return { label, status: 0, ms: performance.now() - start, start, end: performance.now(), body: null };
  }
}

async function request(pathname, { method = 'GET', token = null, body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.base}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

/** Run `total` tasks with at most `concurrency` in flight. */
async function runPool(total, concurrency, worker) {
  let next = 0;
  const tasks = new Array(Math.min(concurrency, total)).fill(0).map(async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      // eslint-disable-next-line no-await-in-loop
      await worker(i);
    }
  });
  await Promise.all(tasks);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------- scenarios -----

async function scenarioLogin(level) {
  const samples = [];
  await runPool(level, level, async (i) => {
    const s = await timed('login', () =>
      request('/auth/login', { method: 'POST', body: { email: emailFor(i), password: cfg.password } })
    );
    samples.push(s);
  });
  return { samples };
}

async function scenarioEvents(level) {
  const samples = [];
  await runPool(level, level, async (i) => {
    samples.push(await timed('list-events', () => request('/events?limit=12')));
    const detailId = samples[samples.length - 1]?.body?.data?.events?.[0]?.slug;
    if (detailId) samples.push(await timed('event-detail', () => request(`/events/${detailId}`)));
    if (i % 3 === 0) samples.push(await timed('home-events', () => request('/events?limit=3&status=OPEN')));
  });
  return { samples };
}

async function scenarioNavigate(level) {
  const samples = [];
  await runPool(level, level, async (i) => {
    const login = await timed('login', () =>
      request('/auth/login', { method: 'POST', body: { email: emailFor(i), password: cfg.password } })
    );
    samples.push(login);
    const token = login.body?.data?.token;
    if (!token) return;
    samples.push(await timed('bootstrap', () => request('/bootstrap', { token })));
    samples.push(await timed('list-events', () => request('/events?limit=12', { token })));
    samples.push(await timed('my-area', () => request('/registrations/me', { token })));
    samples.push(await timed('auth-me', () => request('/auth/me', { token })));
  });
  return { samples };
}

async function scenarioRealtime(level) {
  const samples = [];
  const sockets = [];
  await runPool(level, Math.min(level, 100), async (i) => {
    const login = await timed('login', () =>
      request('/auth/login', { method: 'POST', body: { email: emailFor(i), password: cfg.password } })
    );
    samples.push(login);
    const token = login.body?.data?.token;
    if (!token) return;
    const tok = await timed('realtime-token', () => request('/realtime/token', { method: 'POST', token }));
    samples.push(tok);
    const streamToken = tok.body?.data?.token;
    if (!streamToken) return;
    const open = await timed('sse-open', async () => {
      const controller = new AbortController();
      const res = await fetch(`${cfg.base}/realtime/stream?token=${encodeURIComponent(streamToken)}`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      sockets.push(controller);
      return { status: res.status };
    });
    samples.push(open);
  });
  // Hold the connections open so the server-side SSE count is realistic.
  await sleep(cfg.holdMs);
  const openErrors = sockets.filter((s) => s.signal.aborted).length;
  for (const s of sockets) s.abort();
  return { samples, notes: [`SSE connections held: ${sockets.length}`, `aborted early: ${openErrors}`] };
}

async function scenarioMessages(level) {
  const samples = [];
  await runPool(level, level, async (i) => {
    const login = await timed('login', () =>
      request('/auth/login', { method: 'POST', body: { email: emailFor(i), password: cfg.password } })
    );
    samples.push(login);
    const token = login.body?.data?.token;
    if (!token) return;
    for (let round = 0; round < 3; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      samples.push(await timed('unread-count', () => request('/conversations/unread-count', { token })));
      // eslint-disable-next-line no-await-in-loop
      samples.push(await timed('notifications', () => request('/notifications?limit=8', { token })));
    }
  });
  return { samples };
}

async function scenarioRegister(level) {
  if (!cfg.allowWrite) {
    console.log('⚠️  Scenario "register" writes data and is disabled by default.');
    console.log('    Re-run with --allow-write --event <eventId> against a TEST event.');
    return { samples: [], notes: ['skipped (no --allow-write)'] };
  }
  if (!cfg.registerEventId) {
    console.log('⚠️  Scenario "register" requires --event <eventId>.');
    return { samples: [], notes: ['skipped (no --event)'] };
  }
  const samples = [];
  await runPool(level, level, async (i) => {
    const login = await timed('login', () =>
      request('/auth/login', { method: 'POST', body: { email: emailFor(i), password: cfg.password } })
    );
    samples.push(login);
    const token = login.body?.data?.token;
    if (!token) return;
    samples.push(
      await timed('register', () =>
        request(`/registrations/${cfg.registerEventId}`, { method: 'POST', token, body: { activityIds: [] } })
      )
    );
  });
  return { samples, notes: ['TEST DATA WRITTEN - clean up the test event manually'] };
}

const SCENARIOS = {
  login: scenarioLogin,
  navigate: scenarioNavigate,
  events: scenarioEvents,
  realtime: scenarioRealtime,
  messages: scenarioMessages,
  register: scenarioRegister,
};

// ------------------------------------------------------------------- main -----

async function main() {
  if (!SCENARIOS[cfg.scenario]) {
    console.error(`Unknown scenario "${cfg.scenario}". Use one of: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
  }
  if (cfg.scenario !== 'events' && (!emailFor(0) || !cfg.password)) {
    console.error('Missing credentials: set LOAD_TEST_EMAIL/LOAD_TEST_PASSWORD (or LOAD_TEST_EMAIL_TEMPLATE).');
    process.exit(2);
  }

  console.log('AcadeConnect V9.2 load test');
  console.log(`  base      : ${cfg.base}`);
  console.log(`  scenario  : ${cfg.scenario}`);
  console.log(`  levels    : ${cfg.levels.join(', ')}`);
  console.log(`  credentials: ${cfg.template ? `template ${cfg.template}` : cfg.email || '(anonymous)'}`);
  console.log('');

  const results = [];
  for (const level of cfg.levels) {
    process.stdout.write(`▶ ${cfg.scenario} @ ${level} concurrent... `);
    // eslint-disable-next-line no-await-in-loop
    const { samples, notes = [] } = await SCENARIOS[cfg.scenario](level);
    const summary = summarize(samples);
    results.push({ scenario: cfg.scenario, concurrency: level, summary, notes });
    console.log('done');
    console.log(
      `   requests=${summary.requests} ok=${summary.ok} 4xx=${summary.clientErr} 5xx=${summary.serverErr} ` +
        `net=${summary.networkErr} rps=${summary.rps} p50=${summary.p50}ms p95=${summary.p95}ms p99=${summary.p99}ms max=${summary.maxMs}ms`
    );
    for (const note of notes) console.log(`   note: ${note}`);
    console.log('');
    if (level !== cfg.levels[cfg.levels.length - 1]) await sleep(3000); // let the server/db settle
  }

  const payload = { generatedAt: new Date().toISOString(), config: { ...cfg, password: undefined }, results };
  const outPath = cfg.out || path.join(process.cwd(), `load-test-${cfg.scenario}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Report written to ${outPath}`);
  console.log('Interpretation: keep an eye on p95/p99 and 5xx. Rising latency with growing concurrency = a bottleneck.');
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
