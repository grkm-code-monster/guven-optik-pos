import cron from 'node-cron';
import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { sendReportEmail } from '../mail/mail.service';
import { runReportQuery } from './report-engine.service';
import { exportReportExcel, exportReportPdf } from './report-export.service';

type TemplateJson = {
  boyutlar: unknown;
  olculer: unknown;
  filtreler: unknown;
  ad: string;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseFilters(value: unknown) {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  return {
    tarihBaslangic: raw.tarihBaslangic ? new Date(String(raw.tarihBaslangic)) : undefined,
    tarihBitis: raw.tarihBitis ? new Date(String(raw.tarihBitis)) : undefined,
    subeId: typeof raw.subeId === 'string' ? raw.subeId : undefined,
  };
}

function currentHourMinute(now: Date) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function shouldRunSchedule(
  siklik: string,
  gun: number | null | undefined,
  now: Date,
): boolean {
  if (siklik === 'GUNLUK') return true;
  if (siklik === 'HAFTALIK') return gun === now.getDay();
  if (siklik === 'AYLIK') return gun === now.getDate();
  return false;
}

function alreadyRanThisMinute(sonCalisma: Date | null | undefined, now: Date) {
  if (!sonCalisma) return false;
  return (
    sonCalisma.getFullYear() === now.getFullYear() &&
    sonCalisma.getMonth() === now.getMonth() &&
    sonCalisma.getDate() === now.getDate() &&
    sonCalisma.getHours() === now.getHours() &&
    sonCalisma.getMinutes() === now.getMinutes()
  );
}

async function collectRecipientEmails(
  erisimler: Array<{ userId: string | null; role: Role | null }>,
) {
  const emails = new Set<string>();

  for (const erisim of erisimler) {
    if (erisim.userId) {
      const user = await prisma.user.findUnique({
        where: { id: erisim.userId },
        select: { email: true, isActive: true },
      });
      if (user?.isActive && user.email?.trim()) {
        emails.add(user.email.trim());
      }
    }

    if (erisim.role) {
      const users = await prisma.user.findMany({
        where: {
          role: erisim.role,
          isActive: true,
          email: { not: null },
        },
        select: { email: true },
      });
      for (const user of users) {
        if (user.email?.trim()) emails.add(user.email.trim());
      }
    }
  }

  return [...emails];
}

async function executeSchedule(scheduleId: string, now: Date) {
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      template: {
        include: { erisimler: true },
      },
    },
  });

  if (!schedule || !schedule.aktif || !schedule.template.aktif) return;

  if (alreadyRanThisMinute(schedule.sonCalisma, now)) {
    console.log(`[ReportCron] Atlandı (aynı dakika): ${schedule.id}`);
    return;
  }

  const template = schedule.template as TemplateJson & typeof schedule.template;
  const dimensions = parseStringArray(template.boyutlar);
  const measures = parseStringArray(template.olculer);
  if (!dimensions.length || !measures.length) {
    console.error(`[ReportCron] Şablon geçersiz: ${schedule.reportTemplateId}`);
    return;
  }

  const filters = parseFilters(template.filtreler);
  const rows = await runReportQuery({ dimensions, measures, filters });
  const pdf = await exportReportPdf(rows, dimensions, measures, template.ad);
  const excel = await exportReportExcel(rows, dimensions, measures);
  const recipients = await collectRecipientEmails(schedule.template.erisimler);

  if (!recipients.length) {
    console.error(`[ReportCron] Alıcı yok: ${schedule.id}`);
    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { sonCalisma: now },
    });
    return;
  }

  const stamp = now.toISOString().slice(0, 10);
  const result = await sendReportEmail(
    recipients,
    `Güven Optik Rapor — ${template.ad}`,
    `${template.ad} raporu ektedir.\n\nOluşturulma: ${now.toLocaleString('tr-TR')}`,
    [
      { filename: `rapor-${stamp}.pdf`, content: pdf },
      { filename: `rapor-${stamp}.xlsx`, content: excel },
    ],
  );

  await prisma.reportSchedule.update({
    where: { id: schedule.id },
    data: { sonCalisma: now },
  });

  if (result.success) {
    console.log(`[ReportCron] Gönderildi: ${schedule.id} → ${recipients.length} alıcı`);
  } else {
    console.error(`[ReportCron] Gönderim başarısız: ${schedule.id}`, result.error);
  }
}

export async function processReportSchedules(now = new Date()) {
  const suanSaat = currentHourMinute(now);
  const schedules = await prisma.reportSchedule.findMany({
    where: { aktif: true, saat: suanSaat },
    include: { template: { include: { erisimler: true } } },
  });

  for (const schedule of schedules) {
    try {
      if (!shouldRunSchedule(schedule.siklik, schedule.gun, now)) continue;
      if (alreadyRanThisMinute(schedule.sonCalisma, now)) continue;
      await executeSchedule(schedule.id, now);
    } catch (err) {
      console.error(`[ReportCron] Zamanlama hatası (${schedule.id}):`, err);
    }
  }
}

let cronStarted = false;

export function startReportCron() {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule('* * * * *', () => {
    processReportSchedules().catch((err) => {
      console.error('[ReportCron] Tick hatası:', err);
    });
  });

  console.log('Rapor zamanlayıcı başlatıldı (her dakika kontrol)');
}
