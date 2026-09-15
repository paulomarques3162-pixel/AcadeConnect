/**
 * Gerador de PIX "Copia e Cola" (EMV BR Code / padrão Banco Central).
 *
 * Implementação pura, sem dependência de gateway bancário. O payload é o
 * mesmo conteúdo codificado no QR Code PIX e no campo "copia e cola".
 *
 * Formato EMV: campo = ID(2) + LEN(2) + VALOR. O CRC16 é CCITT-FALSE
 * (poly 0x1021, init 0xFFFF), calculado sobre o payload + "6304".
 */

/** Monta um campo EMV (ID + tamanho + valor). */
function emv(id, value) {
  const v = String(value ?? '');
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

/** CRC16/CCITT-FALSE. */
export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos/caracteres inválidos e limita o tamanho (EMV exige ASCII). */
function sanitize(text, max) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,\-]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Gera o payload PIX.
 * @param {object} opts
 * @param {string} opts.key chave PIX
 * @param {string} opts.receiverName nome do recebedor (<=25)
 * @param {string} opts.city cidade do recebedor (<=15)
 * @param {number} opts.amountCents valor em centavos (0/undefined = sem valor)
 * @param {string} [opts.txid] identificador (alfanumérico, <=25)
 * @param {string} [opts.description] descrição (campo 02 do template 26)
 */
export function buildPixPayload({ key, receiverName, city, amountCents = 0, txid, description }) {
  if (!key) throw new Error('Chave PIX não configurada.');
  const gui = emv('00', 'br.gov.bcb.pix');
  const keyField = emv('01', sanitize(key, 77));
  const descField = description ? emv('02', sanitize(description, 40)) : '';
  const merchant = emv('26', `${gui}${keyField}${descField}`);

  const cleanTxid = sanitize(txid || '', 25).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ref = cleanTxid || '***';

  let payload = '';
  payload += emv('00', '01'); // Payload Format Indicator
  payload += emv('01', cleanTxid ? '12' : '11'); // 12=dinâmico, 11=estático
  payload += merchant;
  payload += emv('52', '0000'); // Merchant Category Code
  payload += emv('53', '986'); // BRL
  if (amountCents > 0) payload += emv('54', (amountCents / 100).toFixed(2));
  payload += emv('58', 'BR');
  payload += emv('59', sanitize(receiverName, 25).toUpperCase() || 'RECEBEDOR');
  payload += emv('60', sanitize(city, 15).toUpperCase() || 'CIDADE');
  payload += emv('62', emv('05', ref)); // Additional Data (Reference Label)
  payload += '6304';
  payload += crc16(payload);
  return payload;
}
