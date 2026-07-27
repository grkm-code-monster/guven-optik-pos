import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { subeToSirketAyarId } from '../efatura/uyumsoft-efatura.service';
import { sendReportEmail } from '../mail/mail.service';

const GUNLUK_RAPOR_ALICILARI_KEY = 'gunluk_rapor_alicilari';

function formatKasaFormuBaslik(branchName: string, tarihStr: string): string {
  const [y, m, d] = tarihStr.slice(0, 10).split('-');
  if (!y || !m || !d) return `${branchName} - TARİHLİ KASA FORMU`;
  return `${branchName} - ${d}/${m}/${y} TARİHLİ KASA FORMU`;
}

function gunlukNotError(code: string, message: string) {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function parseDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseEmailList(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  )];
}

export async function assertBranchAccess(branchId: string, userId: string, role: Role) {
  if (role === Role.ADMIN) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { branchId: true } });
  if (!user || user.branchId !== branchId) {
    throw gunlukNotError('FORBIDDEN', 'Bu şube için yetkiniz yok.');
  }
}

async function getSabitAlicilarForBranch(branchId: string): Promise<string[]> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } });
  if (!branch) return [];
  const sirketId = subeToSirketAyarId(branch.code);
  const ayar = await prisma.sirketAyar.findUnique({
    where: { sirketId_anahtar: { sirketId, anahtar: GUNLUK_RAPOR_ALICILARI_KEY } },
  });
  return parseEmailList(ayar?.deger ?? '');
}

export async function getGunlukDurumNotu(branchId: string, tarihStr: string) {
  const tarih = parseDateParam(tarihStr);
  if (!tarih) {
    throw gunlukNotError('VALIDATION_ERROR', 'Geçersiz tarih parametresi.');
  }

  const not = await prisma.gunlukDurumNotu.findUnique({
    where: { branchId_tarih: { branchId, tarih } },
  });

  const sabitAlicilar = await getSabitAlicilarForBranch(branchId);

  return {
    branchId,
    tarih: tarihStr,
    metin: not?.metin ?? '',
    updatedAt: not?.updatedAt?.toISOString() ?? null,
    sabitAlicilar,
  };
}

export async function upsertGunlukDurumNotu(
  branchId: string,
  tarihStr: string,
  metin: string,
  olusturanId: string,
) {
  const tarih = parseDateParam(tarihStr);
  if (!tarih) {
    throw gunlukNotError('VALIDATION_ERROR', 'Geçersiz tarih parametresi.');
  }

  const saved = await prisma.gunlukDurumNotu.upsert({
    where: { branchId_tarih: { branchId, tarih } },
    create: { branchId, tarih, metin, olusturanId },
    update: { metin, olusturanId },
  });

  return {
    branchId,
    tarih: tarihStr,
    metin: saved.metin,
    updatedAt: saved.updatedAt.toISOString(),
  };
}

export async function sendGunlukDurumNotuEmail(
  branchId: string,
  tarihStr: string,
  ekAliciEmail: string[] = [],
  pdfBuffer: Buffer,
) {
  const tarih = parseDateParam(tarihStr);
  if (!tarih) {
    throw gunlukNotError('VALIDATION_ERROR', 'Geçersiz tarih parametresi.');
  }

  if (!pdfBuffer?.length) {
    throw gunlukNotError('VALIDATION_ERROR', 'PDF dosyası gerekli.');
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
  if (!branch) {
    throw gunlukNotError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  const not = await prisma.gunlukDurumNotu.findUnique({
    where: { branchId_tarih: { branchId, tarih } },
  });
  const metin = not?.metin?.trim() ?? '';

  const sabitAlicilar = await getSabitAlicilarForBranch(branchId);
  const recipients = [...new Set([...sabitAlicilar, ...parseEmailList(ekAliciEmail.join(','))])];

  if (!recipients.length) {
    throw gunlukNotError('VALIDATION_ERROR', 'En az bir alıcı e-posta adresi gerekli.');
  }

  const subject = formatKasaFormuBaslik(branch.name, tarihStr);
  const pdfFilename = `${subject}.pdf`;
  const body = metin || 'Günlük durum notu boş.';

  const result = await sendReportEmail(recipients, subject, body, [
    { filename: pdfFilename, content: pdfBuffer },
  ]);

  if (!result.success) {
    throw gunlukNotError('EMAIL_FAILED', result.error ?? 'E-posta gönderilemedi.');
  }

  return {
    success: true,
    gonderimZamani: new Date().toISOString(),
    alicilar: recipients,
    subject,
    pdfFilename,
  };
}
