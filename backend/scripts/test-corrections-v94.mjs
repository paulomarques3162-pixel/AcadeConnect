/**
 * V9.4 — Corrections test suite.
 *
 * Runs WITHOUT a database on purpose: it exercises the primitives that the
 * correction touches (in-process cache single-flight, projection contract,
 * response headers/ETag, query validation, payload size) against the real
 * modules. Integration tests that need PostgreSQL are listed as NOT EXECUTED
 * in RELATORIO_FINAL_AUDITORIA.md.
 *
 * Run: node scripts/test-corrections-v94.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { cacheWrap, invalidate, cacheStats } from '../src/utils/cache.js';
import {
  PUBLIC_EVENT_LIST_SELECT,
  STAFF_EVENT_LIST_SELECT,
  eventListSelectFor,
} from '../src/utils/eventProjection.js';
import { apiResponse } from '../src/utils/apiResponse.js';
import { eventSchemas } from '../src/validations/schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'events_list_limit12.prod.json');

let pass = 0;
let fail = 0;
const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      results.push(`  PASS  ${name}`);
    })
    .catch((err) => {
      fail += 1;
      results.push(`  FAIL  ${name}\n        ${err.message}`);
    });
}

// ---------------------------------------------------------------------------
// 1. Single-flight: N identical concurrent cache misses => 1 producer call.
// ---------------------------------------------------------------------------
await check('single-flight: 100 concurrent identical requests => 1 DB query', async () => {
  invalidate();
  let calls = 0;
  const producer = () =>
    new Promise((resolve) => {
      calls += 1;
      setTimeout(() => resolve({ rows: [1, 2, 3] }), 25);
    });

  const outputs = await Promise.all(
    Array.from({ length: 100 }, () => cacheWrap('list:sf:test', 5000, producer))
  );

  assert.equal(calls, 1, `expected exactly 1 producer call, got ${calls}`);
  assert.equal(outputs.length, 100);
  const first = outputs[0];
  assert.ok(outputs.every((o) => o === first), 'all callers must share the same object');
});

await check('cache hit: a later identical request does not call the producer again', async () => {
  let calls = 0;
  const producer = async () => {
    calls += 1;
    return { n: calls };
  };
  const a = await cacheWrap('list:hit:test', 5000, producer);
  const b = await cacheWrap('list:hit:test', 5000, producer);
  assert.equal(calls, 1);
  assert.equal(a, b);
});

await check('cache key isolation: public vs staff and filters are distinct entries', async () => {
  invalidate();
  let calls = 0;
  const producer = async (tag) => {
    calls += 1;
    return { tag };
  };
  const pub = await cacheWrap('events:list:public:1:12:::::recent', 5000, () => producer('pub'));
  const staff = await cacheWrap('events:list:staff:1:12:::::recent', 5000, () => producer('staff'));
  const limit3 = await cacheWrap('events:list:public:1:3:::::recent', 5000, () => producer('limit3'));
  assert.equal(calls, 3, 'distinct keys must not share a cache entry');
  assert.equal(pub.tag, 'pub');
  assert.equal(staff.tag, 'staff');
  assert.equal(limit3.tag, 'limit3');
});

await check('invalidate(prefix) drops every variant of the listing', async () => {
  invalidate();
  await cacheWrap('events:list:public:1:9:::::recent', 5000, async () => 1);
  await cacheWrap('events:list:staff:1:200:::::recent', 5000, async () => 2);
  await cacheWrap('events:one:slug', 5000, async () => 3);
  invalidate('events:');
  const stats = cacheStats();
  assert.equal(stats.size, 0, `expected empty cache after invalidate, size=${stats.size}`);
});

// ---------------------------------------------------------------------------
// 2. Projection contract (no field an existing screen reads may be missing).
// ---------------------------------------------------------------------------
const PUBLIC_CONTRACT = [
  'id',
  'name',
  'slug',
  'shortDescription',
  'bannerUrl',
  'startDate',
  'endDate',
  'registrationEnd',
  'status',
  'location',
  'category',
  '_count.activities',
];

await check('public projection exposes every field the listing UI reads', () => {
  for (const field of PUBLIC_CONTRACT) {
    if (field === '_count.activities') {
      assert.equal(PUBLIC_EVENT_LIST_SELECT._count?.select?.activities, true);
    } else {
      assert.equal(PUBLIC_EVENT_LIST_SELECT[field], true, `missing ${field}`);
    }
  }
});

await check('public projection does NOT transport the unused heavy fields', () => {
  const forbidden = [
    'description',
    'address',
    'registrationStart',
    'allowCancellation',
    'allowRegistration',
    'requireAttendance',
    'requireActivityRegistration',
    'automaticCertificate',
    'minimumAttendancePercentage',
    'certificateHours',
    'isPaid',
    'priceCents',
    'minPriceCents',
    'maxPriceCents',
    'deletedAt',
    'createdAt',
    'updatedAt',
    'institution',
    'organizer',
    'institutionId',
    'organizerId',
    'capacity',
    'modality',
    'startTime',
  ];
  for (const f of forbidden) {
    assert.ok(!(f in PUBLIC_EVENT_LIST_SELECT), `field ${f} must not be selected`);
  }
  assert.equal(PUBLIC_EVENT_LIST_SELECT._count.select.registrations, undefined);
});

await check('staff projection is a strict superset (registrations + startTime)', () => {
  for (const field of PUBLIC_CONTRACT) {
    if (field === '_count.activities') continue;
    assert.equal(STAFF_EVENT_LIST_SELECT[field], true, `staff missing ${field}`);
  }
  assert.equal(STAFF_EVENT_LIST_SELECT.startTime, true);
  assert.equal(STAFF_EVENT_LIST_SELECT._count.select.activities, true);
  assert.equal(STAFF_EVENT_LIST_SELECT._count.select.registrations, true);
});

await check('eventListSelectFor picks the right projection per role', () => {
  assert.equal(eventListSelectFor({ staff: false }), PUBLIC_EVENT_LIST_SELECT);
  assert.equal(eventListSelectFor({ staff: true }), STAFF_EVENT_LIST_SELECT);
});

// ---------------------------------------------------------------------------
// 3. Payload size — real production response (7 events) projected with the
//    new public select. BEFORE is the byte count actually served in production.
// ---------------------------------------------------------------------------
function projectPublic(e) {
  return {
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
  };
}

let payload = null;
await check('payload: projected listing is materially smaller (same real events)', () => {
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  const parsed = JSON.parse(raw);
  const beforeBytes = Buffer.byteLength(raw, 'utf8');

  const afterBody = {
    ...parsed,
    data: { events: parsed.data.events.map(projectPublic) },
  };
  const after = JSON.stringify(afterBody);
  const afterBytes = Buffer.byteLength(after, 'utf8');

  const beforeGzip = zlib.gzipSync(Buffer.from(raw)).length;
  const afterGzip = zlib.gzipSync(Buffer.from(after)).length;

  const reduction = (1 - afterBytes / beforeBytes) * 100;
  const gzipReduction = (1 - afterGzip / beforeGzip) * 100;

  assert.ok(afterBytes < beforeBytes, 'projected payload must be smaller');
  assert.ok(reduction >= 55, `expected >=55% raw reduction, got ${reduction.toFixed(1)}%`);

  // The projected body must not leak the heavy fields anywhere.
  assert.ok(!after.includes('"description"'), 'description leaked into listing');
  assert.ok(!after.includes('"address"'), 'address leaked into listing');
  assert.ok(!after.includes('"deletedAt"'), 'deletedAt leaked into listing');
  assert.ok(!after.includes('"institution"'), 'institution leaked into listing');

  payload = { beforeBytes, afterBytes, beforeGzip, afterGzip, reduction, gzipReduction, events: parsed.data.events.length };
});

// ---------------------------------------------------------------------------
// 4. Query validation / pagination caps.
// ---------------------------------------------------------------------------
const listSchema = eventSchemas.listQuery.query;
const v = (q) => listSchema.validate(q, { abortEarly: false, convert: true, stripUnknown: true });

await check('pagination: limit=999999 is rejected', () => {
  const { error } = v({ limit: '999999' });
  assert.ok(error, 'expected a validation error for limit=999999');
});

await check('pagination: limit=0 and non-numeric limit are rejected', () => {
  assert.ok(v({ limit: '0' }).error, 'limit=0 must fail');
  assert.ok(v({ limit: 'abc' }).error, 'limit=abc must fail');
});

await check('pagination: valid limit/page/sort are converted to numbers', () => {
  const { error, value } = v({ limit: '9', page: '3', sort: 'closest' });
  assert.equal(error, undefined);
  assert.equal(value.limit, 9);
  assert.equal(value.page, 3);
  assert.equal(value.sort, 'closest');
});

await check('filters: invalid status/category values are rejected or stripped', () => {
  assert.ok(v({ status: 'HACKED' }).error, 'unknown status must fail');
  const { value } = v({ category: 'Palestra', junk: '<script>' });
  assert.equal(value.category, 'Palestra');
  assert.equal(value.junk, undefined, 'unknown params must be stripped');
});

// ---------------------------------------------------------------------------
// 5. apiResponse Cache-Control semantics + express ETag/304.
// ---------------------------------------------------------------------------
function fakeRes() {
  return {
    headers: {},
    setHeader(k, val) {
      this.headers[k.toLowerCase()] = val;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

await check('apiResponse: cacheSeconds=15 emits the public Cache-Control', () => {
  const res = fakeRes();
  apiResponse(res, { data: {}, cacheSeconds: 15 });
  assert.equal(res.headers['cache-control'], 'public, max-age=15, stale-while-revalidate=60');
});

await check('apiResponse: cacheSeconds=0 emits NO Cache-Control (private data safe)', () => {
  const res = fakeRes();
  apiResponse(res, { data: {}, cacheSeconds: 0 });
  assert.equal(res.headers['cache-control'], undefined);
});

await check('express: Cache-Control + weak ETag => 304 revalidation works', async () => {
  const app = express();
  app.set('etag', 'weak');
  app.get('/events', (req, res) => {
    res.vary('Authorization');
    res.vary('Cookie');
    apiResponse(res, { data: { events: [{ id: 'x', name: 'A' }] }, cacheSeconds: 15 });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  // NOTE: Node's global fetch (undici) mangles the If-None-Match ETag value in
  // this sandbox, so the raw http client is used to send it verbatim.
  const get = (headers) =>
    new Promise((resolve, reject) => {
      http
        .get({ port, path: '/events', headers }, (r) => {
          r.resume();
          resolve({ status: r.statusCode, headers: r.headers });
        })
        .on('error', reject);
    });

  try {
    const first = await get({});
    assert.equal(first.status, 200);
    const etag = first.headers.etag;
    const cc = first.headers['cache-control'];
    const vary = first.headers.vary || '';
    assert.ok(etag, 'ETag must be present');
    assert.equal(cc, 'public, max-age=15, stale-while-revalidate=60');
    assert.ok(vary.includes('Authorization'), `Vary must include Authorization, got "${vary}"`);

    const second = await get({ 'If-None-Match': etag });
    assert.equal(second.status, 304, 'a matching If-None-Match must return 304');
    assert.equal(second.headers['cache-control'], cc, '304 must keep Cache-Control');
  } finally {
    server.close();
  }
});

await check('authenticated-looking variant carries no public Cache-Control', () => {
  const res = fakeRes();
  // Staff listing path passes cacheSeconds=0 (see listEvents); detail of the
  // contract: no public header means browser/CDN never store it.
  apiResponse(res, { data: { events: [] }, cacheSeconds: 0 });
  assert.equal(res.headers['cache-control'], undefined);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=== AcadeConnect V9.4 — correction tests ===\n');
console.log(results.join('\n'));
if (payload) {
  console.log('\n--- Payload (GET /events?limit=12, 7 real production events) ---');
  console.log(`  BEFORE: ${payload.beforeBytes} B raw / ${payload.beforeGzip} B gzip`);
  console.log(`  AFTER : ${payload.afterBytes} B raw / ${payload.afterGzip} B gzip`);
  console.log(`  raw reduction  : ${payload.reduction.toFixed(1)}%`);
  console.log(`  gzip reduction : ${payload.gzipReduction.toFixed(1)}%`);
}
console.log(`\nTOTAL: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
