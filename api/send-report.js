// POST /api/send-report
// Body: { emails: string[], subject: string, pdfBase64: string, filename: string, summary: string }
// Requires env var: RESEND_API_KEY
// Falls back gracefully if not configured.

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

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // No email service configured — tell client to use mailto fallback
    return res.status(200).json({ ok: false, fallback: 'mailto', error: 'Servicio de email no configurado. Configure RESEND_API_KEY.' });
  }

  try {
    const body = {
      from: process.env.EMAIL_FROM || 'Bimbo Precios <noreply@resend.dev>',
      to: emails,
      subject: subject || 'Informe de Precios Bimbo',
      text: summary || 'Ver adjunto.',
      attachments: [
        {
          filename: filename || 'informe-bimbo.pdf',
          content: pdfBase64,
        },
      ],
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Resend API error ${response.status}`);
    }

    return res.status(200).json({ ok: true, id: data.id });

  } catch (e) {
    console.error('send-report error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
