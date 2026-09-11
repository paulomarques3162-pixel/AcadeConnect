// Teste definitivo QR (token) x código manual, validações e conteúdo do QR
const BASE = 'http://localhost:5000/api';
const R = [];
const check = (l, c, e = '') => { R.push({ l, ok: !!c }); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  -> ' + e : ''}`); };
async function req(m, p, { token, body } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method: m, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
}
const st = Date.now();
let r = await req('POST', '/auth/login', { body: { email: 'admin@mustangsatletica.com', password: 'Admin@12345' } });
const adm = r.json.data.token;

async function makeEvent(tag) {
  r = await req('POST', '/events', { token: adm, body: { name: `${tag} ${st}`, startDate: '2026-09-20', endDate: '2026-09-21', startTime: '08:00', status: 'PUBLISHED', allowRegistration: true, requireActivityRegistration: false } });
  const ev = r.json.data.event;
  r = await req('POST', '/activities', { token: adm, body: { eventId: ev.id, name: `Atv ${tag} ${st}`, date: '2026-09-20', startTime: '08:00', endTime: '23:00' } });
  return { ev, act: r.json.data.activity };
}
const A = await makeEvent('EvA'); const B = await makeEvent('EvB');

async function participant(ev, label) {
  r = await req('POST', '/auth/register', { body: { name: `P ${label}`, email: `p${label}${st}@t.com`, password: 'Senha@123' } });
  const tok = r.json.data.token;
  r = await req('POST', `/registrations/${ev.id}`, { token: tok, body: { activityIds: [] } });
  return { token: tok, reg: r.json.data.registration };
}

const p1 = await participant(A.ev, 'qr1');
const p2 = await participant(A.ev, 'man2');
const p3 = await participant(A.ev, 'race3');
const p4 = await participant(A.ev, 'cross4');

// 0) A API de consulta devolve o qrToken (fonte do QR exibido)
r = await req('GET', `/registrations/${p1.reg.id}`, { token: adm });
check('GET registration devolve qrToken (fonte do QR)', !!r.json?.data?.registration?.qrToken, r.json?.data?.registration?.qrToken?.slice(0, 12) + '...');

// TESTE 1 — QR TOKEN -> 201, QR_CODE
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: p1.reg.qrToken, activityId: A.act.id } });
check('TESTE 1: qrToken -> 201', r.status === 201, r.json?.message);
check('TESTE 1: method = QR_CODE', r.json?.data?.attendance?.method === 'QR_CODE', r.json?.data?.attendance?.method);

// TESTE 2 — CÓDIGO MANUAL -> 201, MANUAL
r = await req('POST', '/attendance/scan', { token: adm, body: { code: p2.reg.code, activityId: A.act.id } });
check('TESTE 2: code -> 201', r.status === 201, r.json?.message);
check('TESTE 2: method = MANUAL', r.json?.data?.attendance?.method === 'MANUAL', r.json?.data?.attendance?.method);

// TESTE 2b — normalização (espaços + minúsculas)
const p5 = await participant(A.ev, 'norm5');
r = await req('POST', '/attendance/scan', { token: adm, body: { code: `  ${p5.reg.code.toLowerCase()}  `, activityId: A.act.id } });
check('TESTE 2b: code normalizado (trim+UPPER) -> 201', r.status === 201, r.json?.message);

// TESTE 3 — token do evento A em atividade do evento B -> 409
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: p4.reg.qrToken, activityId: B.act.id } });
check('TESTE 3: evento errado -> 409', r.status === 409, r.json?.message);

// TESTE 4 — token inexistente -> 404
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: 'AC000000000000000000000000000000000000000000000000', activityId: A.act.id } });
check('TESTE 4: qrToken inexistente -> 404', r.status === 404, r.json?.message);

// TESTE 5 — código inexistente -> 404
r = await req('POST', '/attendance/scan', { token: adm, body: { code: 'EVT-0000-000000', activityId: A.act.id } });
check('TESTE 5: code inexistente -> 404', r.status === 404, r.json?.message);

// TESTE 6 — duplicidade -> 409 com recordedAt
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: p1.reg.qrToken, activityId: A.act.id } });
check('TESTE 6: duplicidade -> 409', r.status === 409, r.json?.message);
check('TESTE 6: devolve recordedAt/method', !!r.json?.details?.recordedAt && !!r.json?.details?.method, JSON.stringify(r.json?.details || {}));

// TESTE 7 — sem autenticação -> 401
r = await req('POST', '/attendance/scan', { body: { qrToken: p4.reg.qrToken, activityId: A.act.id } });
check('TESTE 7: sem auth -> 401', r.status === 401, `status=${r.status}`);

// TESTE 8 — participante -> 403
r = await req('POST', '/attendance/scan', { token: p4.token, body: { qrToken: p4.reg.qrToken, activityId: A.act.id } });
check('TESTE 8: participante -> 403', r.status === 403, `status=${r.status}`);

// Negativos extra
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: '', activityId: A.act.id } });
check('vazio -> 400/422', r.status === 400 || r.status === 422, `status=${r.status}`);
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: 'data:image/png;base64,iVBORw0KGgo=', activityId: A.act.id } });
check('QR legado (data URL) -> 422 com mensagem clara', r.status === 422 && /antigo/i.test(r.json?.message || ''), r.json?.message);
r = await req('POST', '/attendance/scan', { token: adm, body: { qrToken: '<script>alert(1)</script>', activityId: A.act.id } });
check('conteúdo arbitrário -> 404 (sem crash)', r.status === 404, r.json?.message);

// TESTE 9 — validate sem gravar por qrToken
r = await req('POST', '/attendance/validate', { token: adm, body: { qrToken: p4.reg.qrToken } });
check('TESTE 9: validate por qrToken -> 200', r.status === 200 && r.json?.data?.registration?.id === p4.reg.id, r.json?.message);

// Concorrência — 2 chamadas simultâneas do mesmo token
const [c1, c2] = await Promise.all([
  req('POST', '/attendance/scan', { token: adm, body: { qrToken: p3.reg.qrToken, activityId: A.act.id } }),
  req('POST', '/attendance/scan', { token: adm, body: { qrToken: p3.reg.qrToken, activityId: A.act.id } }),
]);
const statuses = [c1.status, c2.status].sort();
check('concorrência: sem duplicar (201/201 ou 201/409)', statuses[0] === 201 && (statuses[1] === 201 || statuses[1] === 409), statuses.join(','));
r = await req('GET', `/attendance/activity/${A.act.id}`, { token: adm });
check('concorrência: exatamente 1 registro', (r.json.data?.rows || []).filter((x) => x.code === p3.reg.code).length === 1);

// PROVA DE CONTEÚDO DO QR: gera a imagem do token (lib do backend) e decodifica
try {
  const QRCode = (await import('qrcode')).default;
  const jsQR = (await import('jsqr')).default;
  const { PNG } = await import('pngjs');
  const token = p1.reg.qrToken;
  const dataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', width: 320, margin: 1 });
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  check('QR (imagem real) decodifica para o qrToken', decoded?.data === token, `decoded=${String(decoded?.data).slice(0, 16)}... token=${token.slice(0, 16)}...`);
} catch (e) {
  console.log('SKIP  prova de decodificação do QR (dependência jsqr/pngjs indisponível):', e.message);
}

const fails = R.filter((x) => !x.ok);
console.log(`\n===== RESUMO QR DEFINITIVO: ${R.length - fails.length}/${R.length} PASS =====`);
if (fails.length) { console.log('FALHAS:'); fails.forEach((f) => console.log(' -', f.l)); process.exitCode = 1; }
