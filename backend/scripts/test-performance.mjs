/**
 * Performance primitives test suite (no database required).
 *
 *   node scripts/test-performance.mjs
 *
 * Covers: TTL cache + single-flight, realtime pub/sub hub, short-lived stream
 * token signing. These are the pieces that changed to reduce load; the DB-backed
 * flows are exercised by the project's integration scripts against PostgreSQL.
 */
import assert from 'node:assert/strict';
import { cacheGet, cacheSet, cacheWrap, invalidate, cacheStats } from '../src/utils/cache.js';
import { subscribeUser, publishToUser, publishToUsers, listenerCount } from '../src/services/realtime.js';
import { signToken, verifyToken } from '../src/utils/jwt.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass += 1;
    // eslint-disable-next-line no-console
    console.log(`PASS  ${name}`);
  } catch (err) {
    fail += 1;
    // eslint-disable-next-line no-console
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    // eslint-disable-next-line no-console
    console.log(`PASS  ${name}`);
  } catch (err) {
    fail += 1;
    // eslint-disable-next-line no-console
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

// ---------------- cache ----------------
test('cache stores and reads a value', () => {
  cacheSet('t:a', { v: 1 }, 1000);
  assert.deepEqual(cacheGet('t:a'), { v: 1 });
});

test('cache misses on unknown key', () => {
  assert.equal(cacheGet('t:missing'), undefined);
});

await testAsync('cache TTL expires entries', async () => {
  cacheSet('t:ttl', 'x', 15);
  assert.equal(cacheGet('t:ttl'), 'x');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cacheGet('t:ttl'), undefined);
});

await testAsync('cacheWrap single-flight: producer runs once for concurrent callers', async () => {
  let calls = 0;
  const producer = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return 42;
  };
  const [a, b, c] = await Promise.all([
    cacheWrap('t:single', 1000, producer),
    cacheWrap('t:single', 1000, producer),
    cacheWrap('t:single', 1000, producer),
  ]);
  assert.deepEqual([a, b, c], [42, 42, 42]);
  assert.equal(calls, 1, `producer should run once, ran ${calls}`);
});

test('invalidate(prefix) drops only matching keys', () => {
  cacheSet('events:list:1', 'e1', 1000);
  cacheSet('events:one:x', 'e2', 1000);
  cacheSet('products:public', 'p', 1000);
  invalidate('events:');
  assert.equal(cacheGet('events:list:1'), undefined);
  assert.equal(cacheGet('events:one:x'), undefined);
  assert.equal(cacheGet('products:public'), 'p');
});

test('cacheStats exposes size/hits/misses', () => {
  const s = cacheStats();
  assert.equal(typeof s.size, 'number');
  assert.equal(typeof s.hits, 'number');
});

// ---------------- realtime hub ----------------
test('publishToUser reaches only that user', () => {
  const got = [];
  const off = subscribeUser('u1', (e) => got.push(e));
  publishToUser('u1', { type: 'message', conversationId: 'c1' });
  publishToUser('u2', { type: 'message', conversationId: 'c2' });
  off();
  assert.equal(got.length, 1);
  assert.equal(got[0].conversationId, 'c1');
  assert.equal(listenerCount('u1'), 0);
});

test('publishToUsers deduplicates recipients', () => {
  const seen = [];
  const offA = subscribeUser('a', (e) => seen.push(['a', e.type]));
  const offB = subscribeUser('b', (e) => seen.push(['b', e.type]));
  publishToUsers(['a', 'a', 'b'], { type: 'notification' });
  offA(); offB();
  assert.equal(seen.filter((x) => x[0] === 'a').length, 1);
  assert.equal(seen.filter((x) => x[0] === 'b').length, 1);
});

test('unsubscribe stops delivery', () => {
  let n = 0;
  const off = subscribeUser('z', () => { n += 1; });
  publishToUser('z', { type: 'x' });
  off();
  publishToUser('z', { type: 'x' });
  assert.equal(n, 1);
});

// ---------------- jwt / stream tokens ----------------
test('long-lived token uses default expiry and carries subject', () => {
  const t = signToken({ sub: 'user-1' });
  const p = verifyToken(t);
  assert.equal(p.sub, 'user-1');
});

test('short-lived stream token carries purpose=stream and expires', () => {
  const t = signToken({ sub: 'user-1', purpose: 'stream' }, { expiresIn: '2m' });
  const p = verifyToken(t);
  assert.equal(p.purpose, 'stream');
  assert.ok(p.exp, 'token must have an exp claim');
  const ttlSeconds = p.exp - Math.floor(Date.now() / 1000);
  assert.ok(ttlSeconds > 0 && ttlSeconds <= 120, `ttl=${ttlSeconds}`);
});

// eslint-disable-next-line no-console
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
