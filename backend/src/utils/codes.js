import crypto from 'node:crypto';

/**
 * Secure unique token used inside QR codes.
 * Contains no sensitive data — just a high-entropy random identifier.
 */
export function generateQrToken() {
  return `AC${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Random 10-digit unique-ish number for human friendly codes.
 */
function randomDigits(len) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

/**
 * Registration number: EVT-2026-000123
 */
export function generateRegistrationCode(year = new Date().getFullYear()) {
  return `EVT-${year}-${randomDigits(6)}`;
}

/**
 * Certificate code: CERT-2026-0000123
 */
export function generateCertificateCode(year = new Date().getFullYear()) {
  return `CERT-${year}-${randomDigits(7)}`;
}

/**
 * Slugify a string: "Semana Acadêmica 2026" -> "semana-academica-2026"
 */
export function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
