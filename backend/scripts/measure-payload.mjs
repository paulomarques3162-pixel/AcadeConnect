/**
 * V9.4 — Payload measurement (read-only, against production).
 *
 * Fetches the SAME real events the report references, applies the new public
 * projection locally, and prints BEFORE/AFTER bytes (raw and gzip) and the
 * reduction. This is the honest way to measure the "after" before deploy: the
 * data is real, only the projection is applied in-process.
 *
 * Run: node scripts/measure-payload.mjs [base]
 */
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';

const BASE = process.argv[2] || 'https://acadeconnect-backend.onrender.com/api';

function request(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const body = (res.headers['content-encoding'] || '').includes('gzip') ? zlib.gunzipSync(raw) : raw;
        resolve({ status: res.statusCode, body });
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

const queries = ['/events?limit=12', '/events?limit=9', '/events?limit=3', '/events?limit=9&sort=closest', '/events?limit=12&search=a'];
const rows = [];
for (const q of queries) {
  const r = await request(`${BASE}${q}`);
  const before = r.body;
  let after = before;
  let events = 0;
  try {
    const parsed = JSON.parse(before.toString('utf8'));
    events = parsed?.data?.events?.length ?? 0;
    after = Buffer.from(JSON.stringify({ ...parsed, data: { events: (parsed.data.events || []).map(pick) } }));
  } catch {
    /* non-JSON */
  }
  const beforeGzip = zlib.gzipSync(before).length;
  const afterGzip = zlib.gzipSync(after).length;
  rows.push({
    q,
    status: r.status,
    events,
    before: before.length,
    after: after.length,
    beforeGzip,
    afterGzip,
    reduction: before.length ? (1 - after.length / before.length) * 100 : 0,
    gzipReduction: beforeGzip ? (1 - afterGzip / beforeGzip) * 100 : 0,
  });
}

console.log(`\n=== Payload BEFORE / AFTER — ${BASE} ===\n`);
console.log('query'.padEnd(34), 'ev', 'BEFORE'.padStart(8), 'AFTER'.padStart(8), 'raw%'.padStart(7), 'gzip B→A'.padStart(16), 'gzip%'.padStart(7));
for (const r of rows) {
  console.log(
    r.q.padEnd(34),
    String(r.events).padStart(2),
    String(r.before).padStart(8),
    String(r.after).padStart(8),
    r.reduction.toFixed(1).padStart(6) + '%',
    `${r.beforeGzip}→${r.afterGzip}`.padStart(16),
    r.gzipReduction.toFixed(1).padStart(6) + '%'
  );
}
console.log('');
