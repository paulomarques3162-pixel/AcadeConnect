// Teste unitário de isActivityFinished (fuso do evento, não do servidor)
import { isActivityFinished, zonedDateTimeToUtc } from '../src/utils/date.js';

const R = [];
const check = (l, c, e = '') => { R.push({ l, ok: !!c }); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  -> ' + e : ''}`); };

// Atividade: 09/11/2026 08:00-15:00 em America/Sao_Paulo (o dia é gravado como meia-noite UTC)
const DATE = '2026-11-09T00:00:00.000Z';
const TZ = 'America/Sao_Paulo';

// Horários de parede em SP convertidos para instantes de teste
const at = (h, m) => zonedDateTimeToUtc(2026, 10, 9, h, m, TZ);

check('09/11 07:59 NÃO encerrada (antes de começar)', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(7, 59) }) === false);
check('09/11 08:00 NÃO encerrada', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(8, 0) }) === false);
check('09/11 10:00 NÃO encerrada', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(10, 0) }) === false);
check('09/11 14:59 NÃO encerrada', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(14, 59) }) === false);
check('09/11 15:00 ENCERRADA', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(15, 0) }) === true);
check('09/11 15:01 ENCERRADA', isActivityFinished(DATE, '15:00', { timeZone: TZ, now: at(15, 1) }) === true);

// Fim local 15:00 em SP = 18:00Z
check('fim 15:00 SP => 18:00Z', zonedDateTimeToUtc(2026, 10, 9, 15, 0, TZ).toISOString() === '2026-11-09T18:00:00.000Z');

// Cenário REAL do bug em produção: 11/09/2026 08:00-15:00, servidor UTC às 17:32
const DATE2 = '2026-09-11T00:00:00.000Z';
const nowUTC = new Date('2026-09-11T17:32:49.000Z'); // 14:32 em SP
check('BUG produção: 11/09 14:32 SP NÃO encerrada (servidor 17:32Z)', isActivityFinished(DATE2, '15:00', { timeZone: TZ, now: nowUTC }) === false);
check('BUG produção: às 15:01 SP (18:01Z) ENCERRADA', isActivityFinished(DATE2, '15:00', { timeZone: TZ, now: new Date('2026-09-11T18:01:00.000Z') }) === true);

const fails = R.filter((x) => !x.ok);
console.log(`\n===== TIMEZONE: ${R.length - fails.length}/${R.length} PASS =====`);
if (fails.length) process.exitCode = 1;
