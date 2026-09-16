/**
 * V9.4 — Local micro-benchmark of the per-request JSON work.
 *
 * Measures the serialization + compression cost the origin pays per listing
 * request, BEFORE (full event row) vs AFTER (public projection). It is a local
 * Node benchmark on real production data — NOT a Render CPU measurement (the
 * report marks that as NÃO MEDIDO).
 *
 * Run: node scripts/bench-json.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'events_list_limit12.prod.json'), 'utf8');
const parsed = JSON.parse(raw);

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
const afterObj = { ...parsed, data: { events: parsed.data.events.map(pick) } };

const ITER = 3000;
function bench(label, obj) {
  // warmup
  for (let i = 0; i < 200; i += 1) zlib.gzipSync(JSON.stringify(obj));
  const t0 = process.hrtime.bigint();
  let bytes = 0;
  for (let i = 0; i < ITER; i += 1) {
    const s = JSON.stringify(obj);
    bytes += zlib.gzipSync(Buffer.from(s)).length;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { label, totalMs: ms, perReqMs: ms / ITER, avgGzip: bytes / ITER };
}

const before = bench('BEFORE full row', parsed);
const after = bench('AFTER projection', afterObj);

console.log(`\n=== JSON.stringify + gzip micro-benchmark (${ITER} iters) ===\n`);
for (const r of [before, after]) {
  console.log(`${r.label.padEnd(20)} total ${r.totalMs.toFixed(1)} ms | ${r.perReqMs.toFixed(4)} ms/req | gzip ${r.avgGzip.toFixed(0)} B`);
}
console.log(
  `\nCPU per request reduction: ${(100 * (1 - after.perReqMs / before.perReqMs)).toFixed(1)}%` +
    ` (serialize+gzip only, not a production CPU measurement)\n`
);
