/**
 * Kasa Bakiye Düzeltme (23.09.2026) — sisteme geçmeden önceki / hiç girilmemiş
 * günlerin nakit, slip (kart), KDV, komisyon, ciro ve vakıf/reçete birikimini
 * telafi etmek için müdürün elle girdiği, herhangi bir Sale/Shift kaydına
 * bağlı OLMAYAN bağımsız düzeltme kaydı. bkz. prisma/schema.prisma KasaDuzeltme.
 */
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { z } from 'zod';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const CreateKasaDuzeltmeInput = z.object({
  tarih: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  nakit: decimalString.optional().default('0'),
  kartBrut: decimalString.optional().default('0'),
  kdv: decimalString.optional().default('0'),
  komisyon: decimalString.optional().default('0'),
  ciro: decimalString.optional().default('0'),
  vakif: decimalString.optional().default('0'),
  acikHesap: decimalString.optional().default('0'),
  sgk: decimalString.optional().default('0'),
  aciklama: z.string().max(300).optional(),
  branchId: z.string().optional(), // sadece REGIONAL_MANAGER/ADMIN başka şube seçebilir
});
export type CreateKasaDuzeltmeInputType = z.infer<typeof CreateKasaDuzeltmeInput>;

const YETKILI_ROLLER: Role[] = [Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN];

export async function createKasaDuzeltme(
  actingUser: { userId: string; role: Role; branchId: string | null },
  input: CreateKasaDuzeltmeInputType,
) {
  if (!YETKILI_ROLLER.includes(actingUser.role)) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Bu işlem için yetkiniz yok.');
  }

  const canPickOtherBranch = actingUser.role === Role.REGIONAL_MANAGER || actingUser.role === Role.ADMIN;
  const branchId = canPickOtherBranch && input.branchId ? input.branchId : actingUser.branchId;
  if (!branchId) {
    throw codeError('BRANCH_REQUIRED', 'Şube belirlenemedi.');
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  const tarih = new Date(input.tarih.length === 10 ? `${input.tarih}T00:00:00` : input.tarih);
  if (Number.isNaN(tarih.getTime())) {
    throw codeError('INVALID_DATE', 'Geçersiz tarih.');
  }

  const kayit = await prisma.kasaDuzeltme.create({
    data: {
      branchId,
      userId: actingUser.userId,
      tarih,
      nakit: new Prisma.Decimal(input.nakit ?? '0'),
      kartBrut: new Prisma.Decimal(input.kartBrut ?? '0'),
      kdv: new Prisma.Decimal(input.kdv ?? '0'),
      komisyon: new Prisma.Decimal(input.komisyon ?? '0'),
      ciro: new Prisma.Decimal(input.ciro ?? '0'),
      vakif: new Prisma.Decimal(input.vakif ?? '0'),
      acikHesap: new Prisma.Decimal(input.acikHesap ?? '0'),
      sgk: new Prisma.Decimal(input.sgk ?? '0'),
      aciklama: input.aciklama?.trim() || 'Sehven düzeltme',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actingUser.userId,
      action: 'KASA_DUZELTME_OLUSTUR',
      entity: 'KasaDuzeltme',
      entityId: kayit.id,
      payload: {
        branchId,
        tarih: tarih.toISOString(),
        nakit: input.nakit,
        kartBrut: input.kartBrut,
        kdv: input.kdv,
        komisyon: input.komisyon,
        ciro: input.ciro,
        vakif: input.vakif,
        acikHesap: input.acikHesap,
        sgk: input.sgk,
        aciklama: kayit.aciklama,
      },
    },
  });

  return kayit;
}

export async function listKasaDuzeltme(branchId: string, limit = 50) {
  return prisma.kasaDuzeltme.findMany({
    where: { branchId },
    orderBy: [{ tarih: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
}

export async function deleteKasaDuzeltme(
  actingUser: { userId: string; role: Role; branchId: string | null },
  id: string,
) {
  if (!YETKILI_ROLLER.includes(actingUser.role)) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Bu işlem için yetkiniz yok.');
  }
  const kayit = await prisma.kasaDuzeltme.findUnique({ where: { id } });
  if (!kayit) {
    throw codeError('NOT_FOUND', 'Düzeltme kaydı bulunamadı.');
  }
  if (actingUser.role === Role.STORE_MANAGER && kayit.branchId !== actingUser.branchId) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Sadece kendi şubenizin kaydını silebilirsiniz.');
  }
  await prisma.kasaDuzeltme.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: actingUser.userId,
      action: 'KASA_DUZELTME_SIL',
      entity: 'KasaDuzeltme',
      entityId: id,
      payload: { branchId: kayit.branchId, tarih: kayit.tarih.toISOString() },
    },
  });
  return { success: true };
}

/** Belirtilen güne (tarih) ait tüm düzeltme kayıtlarının toplamı — getDailyReport'ta kullanılır. */
export async function getKasaDuzeltmeToplamForGun(branchId: string, start: Date, end: Date) {
  const agg = await prisma.kasaDuzeltme.aggregate({
    where: { branchId, tarih: { gte: start, lte: end } },
    _sum: { nakit: true, kartBrut: true, kdv: true, komisyon: true, ciro: true, vakif: true, acikHesap: true },
  });
  return {
    nakit: agg._sum.nakit ?? new Prisma.Decimal(0),
    kartBrut: agg._sum.kartBrut ?? new Prisma.Decimal(0),
    kdv: agg._sum.kdv ?? new Prisma.Decimal(0),
    komisyon: agg._sum.komisyon ?? new Prisma.Decimal(0),
    ciro: agg._sum.ciro ?? new Prisma.Decimal(0),
    vakif: agg._sum.vakif ?? new Prisma.Decimal(0),
    acikHesap: agg._sum.acikHesap ?? new Prisma.Decimal(0),
  };
}

/** TÜM ZAMANLAR nakit düzeltme toplamı — kasaNakit'in kümülatif bakiyesine eklenir. */
export async function getKasaDuzeltmeNakitTumZamanlar(branchId: string) {
  const agg = await prisma.kasaDuzeltme.aggregate({
    where: { branchId },
    _sum: { nakit: true },
  });
  return agg._sum.nakit ?? new Prisma.Decimal(0);
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 23.10.2026 — Aylık kutular (Aylık Ciro, Toplam Kart, Banka Kom., KDV, SGK,
 * Vakıf) için: istenen günün AYINA ait (ayın 1'i -> istenen gün, iki uç dahil)
 * tüm düzeltme kayıtlarının toplamı. Böylece "Ay Açılış Devri" gibi bir kayıt
 * sadece kendi ayını etkiler; bir sonraki ayın 1'inde aylık kutular sıfırlanınca
 * otomatik olarak devre dışı kalır. (Kasa Nakit bundan BAĞIMSIZ — o hâlâ tüm
 * zamanlar, bkz. getKasaDuzeltmeNakitTumZamanlar.)
 *
 * `tarih` bir @db.Date alanı; saat dilimi kaymalarına karşı karşılaştırma DB'deki
 * tarih (ISO'nun gün kısmı) ile YYYY-MM-DD metni üzerinden yapılıyor.
 */
export async function getKasaDuzeltmeToplamForAy(branchId: string, date: Date) {
  const ayIlkGun = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const gun = ymdLocal(date);
  const pencereBas = new Date(date.getFullYear(), date.getMonth(), 1);
  pencereBas.setDate(pencereBas.getDate() - 2);
  const pencereSon = new Date(date);
  pencereSon.setDate(pencereSon.getDate() + 2);

  const kayitlar = await prisma.kasaDuzeltme.findMany({
    where: { branchId, tarih: { gte: pencereBas, lte: pencereSon } },
  });
  const sifir = () => new Prisma.Decimal(0);
  const t = { kartBrut: sifir(), kdv: sifir(), komisyon: sifir(), ciro: sifir(), vakif: sifir(), sgk: sifir() };
  for (const k of kayitlar) {
    const ymd = k.tarih.toISOString().slice(0, 10);
    if (ymd < ayIlkGun || ymd > gun) continue;
    t.kartBrut = t.kartBrut.plus(k.kartBrut);
    t.kdv = t.kdv.plus(k.kdv);
    t.komisyon = t.komisyon.plus(k.komisyon);
    t.ciro = t.ciro.plus(k.ciro);
    t.vakif = t.vakif.plus(k.vakif);
    t.sgk = t.sgk.plus(k.sgk);
  }
  return t;
}
