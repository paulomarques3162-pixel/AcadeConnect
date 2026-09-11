/**
 * Normaliza uma data vinda do frontend.
 *
 * Campos "somente data" (Activity.date, Event.startDate/endDate) chegam como
 * "YYYY-MM-DD" e são sempre gravados como meia-noite UTC, para que o dia
 * gravado seja exatamente o dia escolhido no <input type="date">, sem
 * deslocamento de fuso. Valores com hora ("...T10:00" ou ISO completo) são
 * preservados como estão.
 */
export function parseDate(value, { endOfDay = false } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    // Joi (validate) already converted date-only strings to a Date at
    // 00:00:00.000Z before the controller runs. Preserve the endOfDay intent
    // here too, otherwise create stored registrationEnd at the START of the
    // deadline day while update stored it at the END (inconsistent window).
    if (!endOfDay) return value;
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23, 59, 59, 999
    ));
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Offset (ms) do fuso `timeZone` em relação ao UTC para um dado instante.
 * Usa a API `Intl` (base de fusos do sistema), então funciona corretamente
 * mesmo com regras de horário de verão — sem "-03:00" chumbado.
 */
export function getTimeZoneOffsetMs(date, timeZone = 'America/Sao_Paulo') {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

/**
 * Converte um horário de PAREDE (ano/mês/dia/hora/minuto no fuso do evento)
 * em um instante UTC correto.
 * Ex.: 09/11/2026 15:00 em America/Sao_Paulo -> 18:00Z.
 */
export function zonedDateTimeToUtc(year, month, day, hour, minute, timeZone = 'America/Sao_Paulo') {
  const guess = Date.UTC(year, month, day, hour, minute, 0, 0);
  const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
  let ts = guess - offset;
  // Reajuste único para eventuais transições de horário de verão.
  const offset2 = getTimeZoneOffsetMs(new Date(ts), timeZone);
  if (offset2 !== offset) ts = guess - offset2;
  return new Date(ts);
}

/**
 * Uma atividade terminou? A data é um DIA DE CALENDÁRIO (meia-noite UTC) e o
 * horário final é um horário de PAREDE no fuso do evento. O fim é calculado
 * NESSE fuso — nunca no fuso do servidor. Assim, uma atividade 08:00–15:00 no
 * Brasil não é encerrada às 12:00 só porque o servidor está em UTC.
 */
export function isActivityFinished(dateValue, endTime, { timeZone = 'America/Sao_Paulo', now = new Date() } = {}) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  const [rawH, rawM] = String(endTime || '23:59').split(':').map(Number);
  const h = Number.isFinite(rawH) ? rawH : 23;
  const m = Number.isFinite(rawM) ? rawM : 59;
  const end = zonedDateTimeToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, timeZone);
  // >= : no exato horário final a atividade já está encerrada.
  return now >= end;
}
