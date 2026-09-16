#!/usr/bin/env node
/**
 * PIX BR Code (EMV) test suite — no database required.
 *
 *   node scripts/test-pix.mjs
 *
 * Validates the exact things that break real payments:
 *   - CRC16/CCITT-FALSE is correct and self-consistent;
 *   - the key (e-mail `@`, phone `+`, EVP/UUID) is NOT sanitized;
 *   - the amount is encoded with 2 decimals, and omitted when zero;
 *   - the txid is sanitized/uppercased and falls back to `***`;
 *   - the payload is a STATIC BR Code (`01` = `11`).
 *
 * The QR image is only a rendering of this payload, so validating the payload
 * validates the QR content (the backend is the single authority).
 */
import assert from 'node:assert/strict';
import { buildPixPayload, crc16 } from '../src/utils/pix.js';

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    fail += 1;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

/**
 * Sequentially parse the TOP-LEVEL EMV fields of a payload:
 * id(2) + length(2) + value. Returns a Map of id -> value.
 * (Nested templates like 26/62 are returned as their raw inner string.)
 */
function parse(payload) {
  const out = new Map();
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0 || i + 4 + len > payload.length) break;
    out.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

function field(payload, id) {
  return parse(payload.slice(0, -4)).get(id) ?? null;
}

function nestedField(payload, templateId, childId) {
  const inner = field(payload, templateId);
  return inner ? parse(inner).get(childId) ?? null : null;
}

const base = {
  key: 'financeiro@mustangsatletica.com',
  receiverName: 'Mustangs Atlética',
  city: 'São Paulo',
  amountCents: 1234,
  txid: 'PED-ABC123',
  description: 'Inscrição evento',
};

test('payload starts with payload format indicator 01', () => {
  const p = buildPixPayload(base);
  assert.equal(p.slice(0, 6), '000201');
});

test('static BR Code (point of initiation 11)', () => {
  const p = buildPixPayload(base);
  assert.equal(field(p, '01'), '11');
});

test('uses the PIX GUI br.gov.bcb.pix', () => {
  const p = buildPixPayload(base);
  assert.ok(p.includes('br.gov.bcb.pix'), 'GUI missing');
});

test('e-mail key keeps the @ (never sanitized)', () => {
  const p = buildPixPayload(base);
  assert.ok(p.includes(base.key), 'raw e-mail key missing');
});

test('phone key keeps the + (never sanitized)', () => {
  const p = buildPixPayload({ ...base, key: '+5511999998888' });
  assert.ok(p.includes('+5511999998888'), 'raw phone key missing');
});

test('random/EVP key (UUID) is preserved', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const p = buildPixPayload({ ...base, key: uuid });
  assert.ok(p.includes(uuid), 'UUID key missing');
});

test('amount encoded as 54 with 2 decimals', () => {
  const p = buildPixPayload({ ...base, amountCents: 1234 });
  assert.equal(field(p, '54'), '12.34');
});

test('amount field is OMITTED when zero', () => {
  const p = buildPixPayload({ ...base, amountCents: 0 });
  assert.equal(field(p, '54'), null);
});

test('currency is 986 (BRL) and country is BR', () => {
  const p = buildPixPayload(base);
  assert.equal(field(p, '53'), '986');
  assert.equal(field(p, '58'), 'BR');
});

test('txid is sanitized, uppercased and kept in field 62/05', () => {
  const p = buildPixPayload({ ...base, txid: 'ped-abc 12/3!' });
  assert.equal(nestedField(p, '62', '05'), 'PEDABC123');
});

test('txid falls back to *** when empty', () => {
  const p = buildPixPayload({ ...base, txid: '' });
  assert.equal(nestedField(p, '62', '05'), '***');
});

test('CRC16 matches the trailing 4 chars (self-consistent)', () => {
  const p = buildPixPayload(base);
  const withoutCrc = p.slice(0, -4);
  const expected = crc16(withoutCrc);
  assert.equal(p.slice(-4), expected);
});

test('CRC16 known vector: "123456789" -> 29B1 (CCITT-FALSE)', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('CRC changes when the amount changes', () => {
  const a = buildPixPayload({ ...base, amountCents: 1000 });
  const b = buildPixPayload({ ...base, amountCents: 2000 });
  assert.notEqual(a.slice(-4), b.slice(-4));
});

test('payload is pure ASCII (EMV requirement)', () => {
  const p = buildPixPayload(base);
  // eslint-disable-next-line no-control-regex
  assert.ok(/^[\x20-\x7E]+$/.test(p), 'payload has non-ASCII chars');
});

test('receiver name is uppercased and limited to 25 chars', () => {
  const p = buildPixPayload({ ...base, receiverName: 'a'.repeat(40) });
  const name = field(p, '59');
  assert.equal(name, 'A'.repeat(25));
});

test('missing key throws', () => {
  assert.throws(() => buildPixPayload({ ...base, key: '' }));
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
