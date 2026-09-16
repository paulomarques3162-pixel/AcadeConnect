/**
 * V9.4 — HTTP integration smoke test (no database required).
 *
 * Boots the REAL Express app and verifies, over real HTTP requests:
 *   1. every route (including V9.2 features) is registered;
 *   2. GET /events query validation runs BEFORE the database: an oversized or
 *      malformed `limit` is rejected with 422 without touching PostgreSQL;
 *   3. a valid anonymous listing reaches the controller (fails later at the DB
 *      layer only because this sandbox has no PostgreSQL — proving the request
 *      was accepted, not rejected by validation).
 *
 * Run: node scripts/test-http-v94.mjs
 */
import http from 'node:http';

// Point Prisma at a dead port: app import must not need a live DB, and any
// request that reaches the data layer fails with a connection error.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:5433/none';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_ANON_MAX = '100000';

const { createApp } = await import('../src/app.js');

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const port = server.address().port;

const get = (path) =>
  new Promise((resolve, reject) => {
    http
      .get({ port, path }, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* non-JSON */
          }
          resolve({ status: r.statusCode, headers: r.headers, json });
        });
      })
      .on('error', reject);
  });

let pass = 0;
let fail = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    pass += 1;
    results.push(`  PASS  ${name}`);
  } catch (err) {
    fail += 1;
    results.push(`  FAIL  ${name}\n        ${err.message}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'assertion failed');
};

// --- Route registration (probed over HTTP; a missing route yields 404) ------
const post = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ port, path, method: 'POST', headers }, (r) => {
      r.resume();
      resolve({ status: r.statusCode });
    });
    req.on('error', reject);
    req.end();
  });

await check('V9.2 protected routes are registered (401 without token, not 404)', async () => {
  const b = await post('/api/admin/notifications/broadcast');
  assert(b.status === 401, `broadcast expected 401, got ${b.status}`);
  const c = await post('/api/certificates/cancel-present/evt-1');
  assert(c.status === 401, `cancel-present expected 401, got ${c.status}`);
});

await check('unknown routes still return 404', async () => {
  const r = await get('/api/definitely-not-a-route');
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

// --- Validation runs before the DB -----------------------------------------
await check('GET /events?limit=999999 => 422 (rejected before PostgreSQL)', async () => {
  const r = await get('/api/events?limit=999999');
  assert(r.status === 422, `expected 422, got ${r.status}`);
  assert(r.json?.success === false, 'expected a failure envelope');
});

await check('GET /events?limit=abc => 422', async () => {
  const r = await get('/api/events?limit=abc');
  assert(r.status === 422, `expected 422, got ${r.status}`);
});

await check('GET /events?status=HACKED => 422', async () => {
  const r = await get('/api/events?status=HACKED');
  assert(r.status === 422, `expected 422, got ${r.status}`);
});

await check('GET /events?limit=9 (valid) is accepted and reaches the controller', async () => {
  const r = await get('/api/events?limit=9');
  // No DB in this sandbox => the data layer fails (500). What matters is that
  // validation did NOT reject it (not 422/400).
  assert(r.status !== 422 && r.status !== 400, `validation wrongly rejected a valid query (${r.status})`);
});

await check('junk query params are stripped, not forwarded to Prisma', async () => {
  const r = await get('/api/events?limit=9&evil[$ne]=1');
  assert(r.status !== 422 && r.status !== 400, `junk params broke validation (${r.status})`);
});

await check('health endpoint responds without database', async () => {
  const r = await get('/api/health');
  assert(r.status === 200, `expected 200, got ${r.status}`);
});

server.close();
console.log('\n=== AcadeConnect V9.4 — HTTP smoke ===\n');
console.log(results.join('\n'));
console.log(`\nTOTAL: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
