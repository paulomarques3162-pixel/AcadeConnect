import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!transporter && env.emailEnabled) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: env.email.user && env.email.pass ? { user: env.email.user, pass: env.email.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Send an email. When SMTP is not configured, falls back to logging.
 * @param {object} opts { to, subject, html, text }
 */
export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[email disabled] to=${to} subject="${subject}"`);
    return { disabled: true, to, subject };
  }
  try {
    await t.sendMail({
      from: env.email.from,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, ' ') || '',
    });
    return { sent: true, to, subject };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Email send failed', err.message);
    return { sent: false, to, subject, error: err.message };
  }
}

/** Shared HTML email layout with a professional look. */
export function emailLayout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#14532d;padding:22px 32px;color:#ffffff;font-size:20px;font-weight:bold;">Mustangs Atlética Anhanguera</td></tr>
        <tr><td style="padding:32px;">
          <h2 style="color:#111827;margin:0 0 16px;">${title}</h2>
          <div style="color:#374151;font-size:15px;line-height:1.6;">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">Viva a energia da atlética.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export const emailTemplates = {
  welcome(name, loginUrl) {
    return {
      subject: 'Bem-vindo à Mustangs Atlética',
      html: emailLayout('Conta criada com sucesso', `
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua conta na Mustangs Atlética Anhanguera foi criada com sucesso. Agora você pode explorar eventos, fazer inscrições e acompanhar sua jornada.</p>
        <p style="margin-top:24px;"><a href="${loginUrl}" style="background:#14532d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;">Acessar minha conta</a></p>
      `),
    };
  },
  registration(name, eventName, code, qrUrl) {
    return {
      subject: `Inscrição confirmada - ${eventName}`,
      html: emailLayout('Inscrição realizada com sucesso!', `
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua inscrição no evento <strong>${eventName}</strong> foi confirmada.</p>
        <p><strong>Número da inscrição:</strong> ${code}</p>
        ${qrUrl ? `<p style="margin-top:24px;"><a href="${qrUrl}" style="background:#14532d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;">Ver meu QR Code</a></p>` : ''}
      `),
    };
  },
  certificate(name, eventName, code, validateUrl) {
    return {
      subject: `Certificado disponível - ${eventName}`,
      html: emailLayout('Seu certificado está disponível!', `
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Parabéns! Você cumpriu os requisitos e o seu certificado do evento <strong>${eventName}</strong> está disponível.</p>
        <p><strong>Código de validação:</strong> ${code}</p>
        <p style="margin-top:24px;"><a href="${validateUrl}" style="background:#14532d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;">Baixar / Validar certificado</a></p>
      `),
    };
  },
  reminder(name, activityName, dateStr, link) {
    return {
      subject: `Lembrete: ${activityName}`,
      html: emailLayout('Você possui uma atividade em breve', `
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Lembre-se: a atividade <strong>${activityName}</strong> acontecerá em <strong>${dateStr}</strong>.</p>
        <p style="margin-top:24px;"><a href="${link}" style="background:#14532d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;">Ver detalhes</a></p>
      `),
    };
  },
  resetPassword(name, resetUrl) {
    return {
      subject: 'Recuperação de senha',
      html: emailLayout('Recuperação de senha', `
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo (o link expira em 30 minutos):</p>
        <p style="margin-top:24px;"><a href="${resetUrl}" style="background:#14532d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;">Redefinir senha</a></p>
        <p>Se você não solicitou, ignore este e-mail.</p>
      `),
    };
  },
};
