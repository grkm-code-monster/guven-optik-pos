import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { createBildirimler } from '../bildirim/bildirim.service';
import { sendReportEmail } from '../mail/mail.service';
import { runReportQuery } from './report-engine.service';
import { exportReportExcel, exportReportPdf } from './report-export.service';
import type { CreateReportScheduleInput, CreateReportTemplateInputType } from './report-template.types';

function templateError(code: string, message: string) {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

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

export async function userHasTemplateAccess(
  userId: string,
  role: Role,
  templateId: string,
): Promise<boolean> {
  const access = await prisma.reportAccess.findFirst({
    where: {
      reportTemplateId: templateId,
      OR: [{ userId }, { role }],
    },
  });
  return Boolean(access);
}

export async function assertTemplateAccess(userId: string, role: Role, templateId: string) {
  const ok = await userHasTemplateAccess(userId, role, templateId);
  if (!ok) {
    throw templateError('REPORT_ACCESS_DENIED', 'Bu rapora erişim yetkiniz yok.');
  }
}

export async function runTemplateQuery(templateId: string) {
  const template = await prisma.reportTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.aktif) {
    throw templateError('REPORT_TEMPLATE_NOT_FOUND', 'Rapor şablonu bulunamadı.');
  }

  const dimensions = parseStringArray(template.boyutlar);
  const measures = parseStringArray(template.olculer);
  const filters = parseFilters(template.filtreler);

  const rows = await runReportQuery({ dimensions, measures, filters });
  return { template, rows, dimensions, measures };
}

export async function createReportTemplate(
  olusturanId: string,
  input: CreateReportTemplateInputType,
) {
  const erisimRows: Array<{ userId?: string; role?: Role }> = [];
  for (const userId of input.erisimler?.userIds ?? []) {
    erisimRows.push({ userId });
  }
  for (const role of input.erisimler?.roles ?? []) {
    erisimRows.push({ role });
  }
  if (!erisimRows.some((e) => e.userId === olusturanId)) {
    erisimRows.push({ userId: olusturanId });
  }

  return prisma.reportTemplate.create({
    data: {
      ad: input.ad,
      aciklama: input.aciklama,
      boyutlar: input.boyutlar,
      olculer: input.olculer,
      filtreler: input.filtreler ?? {},
      olusturanId,
      erisimler: {
        create: erisimRows.map((e) => ({
          userId: e.userId ?? null,
          role: e.role ?? null,
        })),
      },
    },
    include: { erisimler: true, zamanlamalar: true },
  });
}

export async function listReportTemplates(userId: string, role: Role) {
  if (role === Role.ADMIN) {
    return prisma.reportTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { erisimler: true, zamanlamalar: true },
    });
  }

  return prisma.reportTemplate.findMany({
    where: {
      aktif: true,
      erisimler: {
        some: {
          OR: [{ userId }, { role }],
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: { erisimler: true, zamanlamalar: true },
  });
}

export async function createReportSchedule(input: {
  reportTemplateId: string;
  siklik: string;
  saat: string;
  gun?: number;
}) {
  const template = await prisma.reportTemplate.findUnique({ where: { id: input.reportTemplateId } });
  if (!template) {
    throw templateError('REPORT_TEMPLATE_NOT_FOUND', 'Rapor şablonu bulunamadı.');
  }

  return prisma.reportSchedule.create({
    data: {
      reportTemplateId: input.reportTemplateId,
      siklik: input.siklik,
      saat: input.saat,
      gun: input.gun ?? null,
    },
  });
}

export async function listPendingReportRequests() {
  return prisma.reportRequest.findMany({
    where: { durum: 'BEKLIYOR' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createReportRequest(talepEdenId: string, istekMetni: string) {
  const request = await prisma.reportRequest.create({
    data: { talepEdenId, istekMetni },
  });

  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true },
  });

  if (admins.length) {
    await createBildirimler(
      admins.map((a) => a.id),
      {
        baslik: 'Yeni rapor talebi',
        mesaj: istekMetni.slice(0, 200),
        link: '/admin/rapor-matris',
        tip: 'GENEL',
      },
    );
  }

  return request;
}

export async function sendTemplateReportEmail(
  templateId: string,
  userId: string,
  role: Role,
) {
  await assertTemplateAccess(userId, role, templateId);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email?.trim()) {
    throw templateError('REPORT_EMAIL_MISSING', 'E-posta adresiniz tanımlı değil.');
  }

  const { template, rows, dimensions, measures } = await runTemplateQuery(templateId);
  const pdf = await exportReportPdf(rows, dimensions, measures, template.ad);
  const excel = await exportReportExcel(rows, dimensions, measures);
  const stamp = new Date().toISOString().slice(0, 10);

  const result = await sendReportEmail(
    [user.email.trim()],
    `Güven Optik Rapor — ${template.ad}`,
    `${template.ad} raporu ektedir.`,
    [
      { filename: `rapor-${stamp}.pdf`, content: pdf },
      { filename: `rapor-${stamp}.xlsx`, content: excel },
    ],
  );

  if (!result.success) {
    throw templateError('REPORT_EMAIL_FAILED', result.error ?? 'E-posta gönderilemedi.');
  }

  return { success: true };
}
