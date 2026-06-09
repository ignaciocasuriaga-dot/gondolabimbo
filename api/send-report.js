// POST /api/send-report
// Body: { emails: string[], subject: string, pdfBase64: string, filename: string, summary: string }
//
// Variables de entorno requeridas (Vercel → Settings → Environment Variables):
//   SMTP_USER  → tu correo de Outlook, ej: nombre@empresa.com
//   SMTP_PASS  → contraseña del correo (o contraseña de aplicación si tenés 2FA)
//   SMTP_HOST  → opcional, por defecto smtp.office365.com (Outlook/Microsoft 365)
//   SMTP_PORT  → opcional, por defecto 587
//
// Si no están configuradas, devuelve fallback: "mailto" y el cliente abre Outlook.

import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { emails, subject, pdfBase64, filename, summary } = req.body || {};

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ ok: false, error: 'Se requiere al menos un destinatario' });
  }

  if (!pdfBase64) {
    return res.status(400).json({ ok: false, error: 'PDF no proporcionado' });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    return res.status(200).json({
      ok: false,
      fallback: 'mailto',
      error: 'SMTP no configurado. Agregá SMTP_USER y SMTP_PASS en Vercel.',
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { ciphers: 'SSLv3' },
    });

    await transporter.sendMail({
      from: `"Bimbo Precios" <${smtpUser}>`,
      to: emails.join(', '),
      subject: subject || 'Informe de Precios Bimbo',
      text: summary || 'Ver informe adjunto.',
      attachments: [
        {
          filename: filename || 'informe-bimbo.pdf',
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('send-report SMTP error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
