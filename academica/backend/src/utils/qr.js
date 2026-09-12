import QRCode from 'qrcode';

/**
 * Generate a QR code data URL (PNG) for a given payload.
 * Payload is a safe opaque token (no sensitive data).
 */
export async function generateQrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#1f2937', light: '#ffffff' },
  });
}

/**
 * Generate an SVG string for embedding in PDF certificates.
 */
export async function generateQrSvg(payload) {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M' });
}
