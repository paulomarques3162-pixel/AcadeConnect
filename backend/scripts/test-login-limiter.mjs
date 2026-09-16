/**
 * V9.5 — Login / rate-limiter test suite (no database required).
 *
 * Proves, over real HTTP:
 *   1. a VALID login always succeeds (200);
 *   2. an INVALID login returns 4xx and consumes the failure budget;
 *   3. after the budget is exhausted, further FAILED attempts get 429;
 *   4. a VALID login is NOT blocked by previous failures (the production bug);
 *   5. the OLD `authLimiter` behaviour (block on entry) for contrast;
 *   6. login waves at 10/25/50/100/250/500 (auth layer, no bcrypt/DB).
 *
 * Run: node scripts/test-login-limiter.mjs
 */
import express from 'express';
import http from 'node:http';
import rateLimit from 'express-rate-limit';
import { authPeakLimiter } from '../src/middlewares/rateLimiter.js';
import {
  loginIdentityKey,
  noteLoginFailure,
  clearLoginFailures,
  loginLockRemaining,
  loginAttemptStats,
} from '../src/utils/loginAttempts.js';

const VALID = 'Senha@123';
const MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

// --- Real controller wiring, fake credential check (no DB, no bcrypt) --------
const app = express();
app.set('trust proxy', true);
app.use(express.json());

app.post('/api/login', authPeakLimiter, (req, res) => {
  const key = loginIdentityKey(req);
  const valid = req.body.password === VALID; // stands in for bcrypt compare
  if (!valid) {
    const state = noteLoginFailure(key);
    if (state.blocked) {
      res.setHeader('Retry-After', String(state.retryAfter));
      return res.status(429).json({ success: false, message: 'Muitas tentativas de login.' });
    }
    return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
  }
  clearLoginFailures(key);
  return res.status(200).json({ success: true });
});

// OLD behaviour, for contrast: express-rate-limit with skipSuccessfulRequests.
const appOld = express();
appOld.set('trust proxy', true);
appOld.use(express.json());
appOld.post(
  '/api/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: false,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
    skipSuccessfulRequests: true,
    message: { success: false, message: 'Muitas tentativas de login.' },
  }),
  (req, res) => {
    if (req.body.password === VALID) return res.status(200).json({ success: true });
    return res.status(401).json({ success: false });
  }
);

const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const oldServer = await new Promise((r) => { const s = appOld.listen(0, () => r(s)); });
const port = server.address().port;
const oldPort = oldServer.address().port;

function post(p, body, ip, destPort = port) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const started = process.hrtime.bigint();
    const req = http.request(
      { port: destPort, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-forwarded-for': ip } },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, retryAfter: res.headers['retry-after'], ms: Number(process.hrtime.bigint() - started) / 1e6 }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });
}

// 1. Valid login
check('Teste 1: 1 login válido -> 200', (await post('/api/login', { email: 'u1@t.com', password: VALID }, '10.0.0.1')).status === 200);

// 2. Invalid login consumes budget
const bad1 = await post('/api/login', { email: 'u2@t.com', password: 'x' }, '10.0.0.2');
check('Teste 2: senha incorreta -> 401 e consome o limite', bad1.status === 401, `got ${bad1.status}`);

// 3. Exhaust budget -> 429
let last;
for (let i = 0; i < MAX; i += 1) last = await post('/api/login', { email: 'u3@t.com', password: 'x' }, '10.0.0.3');
const blocked = await post('/api/login', { email: 'u3@t.com', password: 'x' }, '10.0.0.3');
check(`Teste 3: ${MAX} falhas -> tentativa seguinte 429 + Retry-After`, blocked.status === 429 && Number(blocked.retryAfter) > 0, `status=${blocked.status} retry=${blocked.retryAfter}`);

// 4. THE FIX: valid login after failures is NOT blocked
const ip4 = '10.0.0.4';
const email4 = 'u4@t.com';
for (let i = 0; i < MAX + 3; i += 1) await post('/api/login', { email: email4, password: 'x' }, ip4);
const validAfter = await post('/api/login', { email: email4, password: VALID }, ip4);
check('Teste 4: login VÁLIDO após estourar falhas -> 200 (correção)', validAfter.status === 200, `got ${validAfter.status}`);
check('Teste 4b: login válido limpa o contador de falhas', loginLockRemaining(loginIdentityKey({ ip: ip4, body: { email: email4 } })) === 0);

// 5. Old middleware contrast
const ip5 = '10.0.0.5';
for (let i = 0; i < 3; i += 1) await post('/api/login', { email: 'u5@t.com', password: 'x' }, ip5, oldPort);
const oldValid = await post('/api/login', { email: 'u5@t.com', password: VALID }, ip5, oldPort);
check('Contraste: authLimiter antigo bloqueia login válido (causa do bug)', oldValid.status === 429, `got ${oldValid.status}`);

// 6. Login waves (distinct accounts/IPs). Auth layer only (no bcrypt/DB).
async function wave(n) {
  const ip = `10.9.${Math.floor(n / 250)}.${n % 250}`;
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => post('/api/login', { email: `wave${n}-${i}@t.com`, password: VALID }, ip))
  );
  const ok = results.filter((r) => r.status === 200).length;
  const err4 = results.filter((r) => r.status >= 400 && r.status < 500).length;
  const err5 = results.filter((r) => r.status >= 500).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
  return { n, ok, err4, err5, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: times[times.length - 1] };
}

const waves = [];
for (const n of [10, 25, 50, 100, 250, 500]) waves.push(await wave(n));
const allWavesOk = waves.every((w) => w.ok === w.n);
check('Teste 5: ondas 10/25/50/100/250/500 — 100% OK', allWavesOk, JSON.stringify(waves.map((w) => `${w.n}:${w.ok}`)));

server.close();
oldServer.close();

console.log('\n=== ONDAS DE LOGIN (camada de autenticação; sem bcrypt/DB) ===');
console.log('  N     OK   4xx   5xx    p50      p95      p99      max');
for (const w of waves) {
  console.log(
    `  ${String(w.n).padEnd(4)} ${String(w.ok).padEnd(4)} ${String(w.err4).padEnd(5)} ${String(w.err5).padEnd(5)}  ${w.p50.toFixed(1).padStart(6)}ms ${w.p95.toFixed(1).padStart(7)}ms ${w.p99.toFixed(1).padStart(7)}ms ${w.max.toFixed(1).padStart(7)}ms`
  );
}
console.log('\nstats', JSON.stringify(loginAttemptStats()));
console.log(`\nTOTAL: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
