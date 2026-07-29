import axios from 'axios';

/**
 * Mail gönderimi Resend HTTP API'si üzerinden yapılır (https://api.resend.com/emails).
 * Bu servis 443 (HTTPS) portunu kullanır — sunucu hosting sağlayıcısının (ilkbyte)
 * giden 465/587 (SMTP) portlarını engellemesi sorun olmaz.
 *
 * Gerekli env değişkenleri:
 *  - RESEND_API_KEY: Resend hesabından alınan API anahtarı
 *  - RESEND_FROM: doğrulanmış alan adına ait gönderici adresi (ör: pos@guvenoptik.net.tr)
 */

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendReportEmail(
  to: string[],
  subject: string,
  body: string,
  attachments: { filename: string; content: Buffer }[],
) {
  const recipients = [...new Set(to.map((e) => e.trim()).filter(Boolean))];
  if (!recipients.length) {
    return { success: false, error: 'Alıcı e-posta adresi yok.' };
  }

  const config = getResendConfig();
  if (!config) {
    return { success: false, error: 'RESEND_API_KEY / RESEND_FROM tanımlı değil.' };
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: config.from,
        to: recipients,
        subject,
        text: body,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );
    return { success: true as const };
  } catch (e: any) {
    const msg = e?.response?.data?.message ?? (e instanceof Error ? e.message : String(e));
    console.error('[Mail] Gönderim hatası:', msg);
    return { success: false as const, error: String(msg) };
  }
}
