/**
 * V9.4 — Live (read-only) cache/ETag validation against production.
 *
 * Deliberately light: a handful of sequential GETs against public endpoints
 * only. No auth, no writes, no high-concurrency run (the task forbids loading
 * production with 250/500). It records what the origin actually returns
 * TODAY, so the "before" side of the report is measured, not assumed.
 *
 * Run: node scripts/validate-cache-live.mjs [base]
 */
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const BASE = process.argv[2] || 'https://acadeconnect-backend.onrender.com/api';

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const started = process.hrtime.bigint();
    const req = mod.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        let body = raw;
        if ((res.headers['content-encoding'] || '').includes('gzip')) body = zlib.gunzipSync(raw);
        resolve({ status: res.statusCode, headers: res.headers, body, wireBytes: raw.length, ms });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

const pick = (e) => ({
  id: e.id,
  name: e.name,
  slug: e.slug,
  shortDescription: e.shortDescription,
  bannerUrl: e.bannerUrl,
  startDate: e.startDate,
  endDate: e.endDate,
  registrationEnd: e.registrationEnd,
  status: e.status,
  location: e.location,
  category: e.category,
  _count: { activities: e._count?.activities ?? 0 },
});

console.log(`\n=== Live validation — ${BASE} ===\n`);

const list = await request(`${BASE}/events?limit=12`, { 'Accept-Encoding': 'gzip' });
console.log(`GET /events?limit=12`);
console.log(`  status            : ${list.status}`);
console.log(`  cache-control     : ${list.headers['cache-control'] ?? '(absent)'}`);
console.log(`  etag              : ${list.headers.etag ?? '(absent)'}`);
console.log(`  content-encoding  : ${list.headers['content-encoding'] ?? 'identity'}`);
console.log(`  wire bytes        : ${list.wireBytes}`);
console.log(`  decoded bytes     : ${list.body.length}`);
console.log(`  time              : ${list.ms.toFixed(0)} ms`);

const parsed = JSON.parse(list.body.toString('utf8'));
const projected = JSON.stringify({ ...parsed, data: { events: parsed.data.events.map(pick) } });
console.log(`\n  events            : ${parsed.data.events.length}`);
console.log(`  BEFORE (real)     : ${list.body.length} B`);
console.log(`  AFTER (projected) : ${Buffer.byteLength(projected)} B`);
console.log(
  `  reduction         : ${(
    (1 - Buffer.byteLength(projected) / list.body.length) *
    100
  ).toFixed(1)}%`
);

// Conditional request => expect 304 and an empty body.
const cond = await request(`${BASE}/events?limit=12`, { 'If-None-Match': list.headers.etag, 'Accept-Encoding': 'gzip' });
console.log(`\nGET /events?limit=12  (If-None-Match)`);
console.log(`  status            : ${cond.status} ${cond.status === 304 ? '(revalidated)' : ''}`);
console.log(`  cache-control     : ${cond.headers['cache-control'] ?? '(absent)'}`);
console.log(`  body bytes        : ${cond.body.length}`);

// Filtered / paginated variants must be their own cache entries.
for (const q of ['/events?limit=3', '/events?status=OPEN', '/events?limit=9&sort=closest']) {
  const r = await request(`${BASE}${q}`, { 'Accept-Encoding': 'gzip' });
  console.log(`\nGET ${q}`);
  console.log(`  status=${r.status} bytes=${r.body.length} etag=${r.headers.etag ?? '(none)'} cache-control=${r.headers['cache-control'] ?? '(absent)'}`);
}

console.log('');
