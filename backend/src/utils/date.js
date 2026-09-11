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
