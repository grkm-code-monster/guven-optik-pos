import nodemailer from 'nodemailer';

function getMailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return null;
  return { user, pass };
}

function getTransporter() {
  const config = getMailConfig();
  if (!config) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
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

  const from = process.env.GMAIL_USER?.trim();
  if (!from) {
    return { success: false, error: 'GMAIL_USER tanımlı değil.' };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'Gmail SMTP yapılandırması eksik.' };
  }

  try {
    await transporter.sendMail({
      from,
      to: recipients.join(','),
      subject,
      text: body,
      attachments,
    });
    return { success: true as const };
  } catch (e) {
    console.error('[Mail] Gönderim hatası:', e instanceof Error ? e.message : e);
    return { success: false as const, error: String(e) };
  }
}
