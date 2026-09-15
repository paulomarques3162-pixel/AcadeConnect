import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

/**
 * Build a certificate PDF as a Buffer.
 *
 * @param {object} opts
 * @param {string} opts.code certificate code (CERT-2026-0000123)
 * @param {string} opts.participantName
 * @param {string} opts.eventName
 * @param {number} opts.hours
 * @param {Date|string} opts.date (event date)
 * @param {string} [opts.activityName]
 * @param {string} [opts.responsible]
 * @param {string} opts.qrValidationUrl - public validation URL encoded in QR
 * @returns {Promise<Buffer>}
 */
export async function buildCertificatePdf(opts) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    info: { Title: `Certificado ${opts.code}`, Author: 'Mustangs Atlética Anhanguera' },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));

  const dateStr = formatDate(opts.date);
  const year = new Date(opts.date).getUTCFullYear();

  // Border frame
  doc.save().lineWidth(4).strokeColor('#14532d').rect(35, 30, doc.page.width - 70, doc.page.height - 60).stroke();
  doc.save().lineWidth(1).strokeColor('#d4af37').rect(45, 40, doc.page.width - 90, doc.page.height - 80).stroke();

  // Header
  doc
    .font('Helvetica-Bold')
    .fontSize(34)
    .fillColor('#14532d')
    .text('CERTIFICADO', { align: 'center' });

  doc.moveDown(1.2);
  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#374151')
    .text('Certificamos que', { align: 'center' });

  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(26)
    .fillColor('#111827')
    .text(opts.participantName, { align: 'center' });

  doc.moveDown(0.8);
  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#374151')
    .text('participou do evento', { align: 'center' });

  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#14532d')
    .text(opts.eventName, { align: 'center' });

  if (opts.activityName) {
    doc.moveDown(0.6);
    doc
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#374151')
      .text(`Atividade: ${opts.activityName}`, { align: 'center' });
  }

  doc.moveDown(0.9);
  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#374151')
    .text(`com carga horária de ${formatNumber(opts.hours)} horas`, { align: 'center' });

  doc.moveDown(0.4);
  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#374151')
    .text(`realizado em ${dateStr}.`, { align: 'center' });

  if (opts.responsible) {
    doc.moveDown(1.8);
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#6b7280')
      .text(opts.responsible, { align: 'center' });
    doc.moveDown(0.2);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#9ca3af')
      .text('Responsável pelo evento', { align: 'center' });
  }

  // Certificate code + QR (validation)
  doc.moveDown(1.2);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6b7280')
    .text(`Código de validação: ${opts.code}`, { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#9ca3af')
    .text(`Emitido em ${year} • Mustangs Atlética Anhanguera`, { align: 'center' });

  if (opts.qrValidationUrl) {
    const { generateQrDataUrl } = await import('./qr.js');
    const qrDataUrl = await generateQrDataUrl(opts.qrValidationUrl);
    const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgWidth = 110;
    const x = (doc.page.width - imgWidth) / 2;
    const y = doc.page.height - 60 - imgWidth - 10;
    doc.image(Buffer.from(qrBase64, 'base64'), x, y, { width: imgWidth });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

function brl(cents) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Comprovante do pedido (NÃO é boleto): resumo com itens, desconto, total, PIX
 * e QR de PIX quando houver. Reutiliza o PDFKit já usado nos certificados.
 */
export async function buildOrderReceiptPdf({ order, user, payment = null }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: { Title: `Comprovante ${order.code}`, Author: 'Mustangs Atlética Anhanguera' },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));

  doc.save().lineWidth(3).strokeColor('#14532d').rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#14532d').text('COMPROVANTE DE PEDIDO', { align: 'center' });
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(12).fillColor('#374151');
  doc.text(`Pedido: ${order.code}`);
  doc.text(`Cliente: ${user?.name || '-'}  (${user?.email || '-'})`);
  doc.text(`Data: ${new Date(order.createdAt).toLocaleString('pt-BR')}`);
  doc.text(`Status: ${order.status}`);
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(13).text('Itens');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(11);
  for (const it of order.items || []) {
    doc.text(`${it.quantity}x ${it.productName} — ${brl(it.unitPriceCents)} un. — subtotal ${brl(it.subtotalCents)}`);
  }

  doc.moveDown(0.8);
  doc.text(`Subtotal: ${brl(order.subtotalCents)}`);
  doc.text(`Desconto: ${order.discountCents ? `- ${brl(order.discountCents)}` : brl(0)}${order.couponCode ? ` (cupom ${order.couponCode})` : ''}`);
  doc.font('Helvetica-Bold').fillColor('#14532d').text(`Total: ${brl(order.totalCents)}`);
  doc.font('Helvetica').fillColor('#374151');

  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('Pagamento');
  doc.font('Helvetica').fontSize(11);
  doc.text(`Método: PIX`);
  doc.text(`Status: ${payment?.status || 'PENDENTE'}`);
  if (payment?.pixPayload) {
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#6b7280').text('PIX Copia e Cola:', { continued: false });
    doc.fontSize(8).fillColor('#111827').text(payment.pixPayload, { width: doc.page.width - 160 });
    try {
      const { generateQrDataUrl } = await import('./qr.js');
      const qrDataUrl = await generateQrDataUrl(payment.pixPayload);
      const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      const imgWidth = 120;
      doc.image(Buffer.from(qrBase64, 'base64'), (doc.page.width - imgWidth) / 2, doc.y + 10, { width: imgWidth });
    } catch {
      /* QR opcional */
    }
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

function formatDate(value) {
  // Event/activity dates are stored as UTC-midnight of the chosen calendar day.
  // Using local getters (UTC-3) rendered the previous day on the certificate.
  const d = new Date(value);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatNumber(n) {
  return String(n).replace('.', ',');
}

function pad(n) {
  return String(n).padStart(2, '0');
}
