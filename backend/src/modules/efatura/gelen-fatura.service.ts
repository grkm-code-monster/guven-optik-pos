import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { mapWithConcurrency } from '../../utils/map-with-concurrency';
import {
  DEFAULT_SIRKET_ID,
  getInboxInvoice,
  getInboxInvoiceList,
  resolveTaxExclusiveAmount,
  tipFromVkn,
  type InboxInvoiceDetail,
  type UyumsoftSupplierParty,
} from '../uyumsoft/uyumsoft.service';

const GIRIS_TIPI = 'UYUMSOFT_GELEN';
const DETAY_CONCURRENCY = 6;

const GECERLI_UYUMSOFT_SIRKETLER = new Set(['ng', 'adese', 'potential']);

function resolveUyumsoftSirketId(raw?: string): string {
  const id = (raw ?? DEFAULT_SIRKET_ID).trim().toLowerCase();
  return GECERLI_UYUMSOFT_SIRKETLER.has(id) ? id : DEFAULT_SIRKET_ID;
}

export const UYUMSOFT_KOLON_ANAHTARLARI = [
  'stokKodu',
  'malzemeHizmet',
  'urunAdi',
  'barkod',
  'miktar',
  'birimFiyat',
  'iskontoOrani',
  'iskontoTutar',
  'kdvOrani',
  'siparisNo',
] as const;

export type UyumsoftKolonAnahtari = (typeof UYUMSOFT_KOLON_ANAHTARLARI)[number];

export type UyumsoftKolonRol =
  | 'urunAdi'
  | 'malzemeHizmet'
  | 'stokKodu'
  | 'barkod'
  | 'miktar'
  | 'birimFiyat'
  | 'iskontoOrani'
  | 'iskontoTutar'
  | 'kdvOrani'
  | 'siparisNo'
  | 'yoksay';

export type UyumsoftKolonMap = Record<UyumsoftKolonAnahtari, UyumsoftKolonRol>;

export const VARSAYILAN_KOLON_MAP: UyumsoftKolonMap = {
  stokKodu: 'stokKodu',
  malzemeHizmet: 'urunAdi',
  urunAdi: 'yoksay',
  barkod: 'barkod',
  miktar: 'miktar',
  birimFiyat: 'birimFiyat',
  iskontoOrani: 'iskontoOrani',
  iskontoTutar: 'iskontoTutar',
  kdvOrani: 'kdvOrani',
  siparisNo: 'siparisNo',
};

export interface UyumsoftHamSatir {
  sira: number;
  stokKodu: string;
  urunAdi: string;
  malzemeHizmet: string;
  barkod: string;
  miktar: number;
  birimFiyat: number;
  kdvOrani: number;
  iskontoOrani: string;
  iskontoTutar: number;
  iskonto: number;
  siparisNo: string;
}

export interface GelenFaturaOzet {
  id: string;
  uyumsoftNo: string | null;
  uyumsoftEttn: string | null;
  tedarikciAdi: string | null;
  tedarikciVkn?: string;
  faturaTarihi?: string;
  tutarKdvHaric?: number;
  tutarToplam?: number;
  paraBirimi?: string;
  durum: string;
  uyumsoftDurum: string | null;
  hedefDepo: string | null;
  kalemSayisi: number;
  createdAt: Date;
}

function normalizeFaturaTarihi(raw?: string | null, fallback?: Date): string {
  const trimmed = String(raw ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return (fallback ?? new Date()).toISOString().slice(0, 10);
}

/** Gerçek fatura tarihi (IssueDate) seçilen aralıkta mı — YYYY-MM-DD karşılaştırması. */
export function faturaTarihiAralikta(
  tarih: string | undefined | null,
  baslangic: string,
  bitis: string,
): boolean {
  const t = String(tarih ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const bas = baslangic.slice(0, 10);
  const bit = bitis.slice(0, 10);
  return t >= bas && t <= bit;
}

function dateAtStartOfDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function dateAtEndOfDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T23:59:59.999Z`);
}

function detaydanOzet(detay: InboxInvoiceDetail, listExecutionDate?: string) {
  const taxExclusiveAmount = resolveTaxExclusiveAmount(detay.taxExclusiveAmount, detay.lines);
  return {
    documentId: detay.documentId,
    invoiceNo: detay.invoiceNo,
    supplierTitle: detay.supplierTitle,
    supplierVkn: detay.supplierVkn,
    supplier: detay.supplier,
    siparisNo: detay.siparisNo,
    issueDate: normalizeFaturaTarihi(detay.issueDate || listExecutionDate),
    taxExclusiveAmount,
    payableAmount: detay.payableAmount,
    currency: detay.currency,
    lines: detay.lines,
  };
}

function kayittanOzet(kayit: {
  id: string;
  uyumsoftNo: string | null;
  uyumsoftEttn: string | null;
  tedarikciAdi: string | null;
  uyumsoftVeri: string | null;
  uyumsoftDurum: string | null;
  hedefDepo: string | null;
  durum: string;
  createdAt: Date;
}): GelenFaturaOzet {
  let veri: ReturnType<typeof detaydanOzet> | null = null;
  if (kayit.uyumsoftVeri) {
    try {
      veri = JSON.parse(kayit.uyumsoftVeri);
    } catch {
      veri = null;
    }
  }
  const kalemler = veri?.lines ?? [];
  return {
    id: kayit.id,
    uyumsoftNo: kayit.uyumsoftNo,
    uyumsoftEttn: kayit.uyumsoftEttn,
    tedarikciAdi: kayit.tedarikciAdi ?? veri?.supplierTitle ?? null,
    tedarikciVkn: veri?.supplierVkn,
    faturaTarihi: normalizeFaturaTarihi(veri?.issueDate, kayit.createdAt),
    tutarKdvHaric: veri?.taxExclusiveAmount,
    tutarToplam: veri?.payableAmount,
    paraBirimi: veri?.currency,
    durum: kayit.durum,
    uyumsoftDurum: kayit.uyumsoftDurum,
    hedefDepo: kayit.hedefDepo,
    kalemSayisi: kalemler.length,
    createdAt: kayit.createdAt,
  };
}

export async function listeleGelenFaturalar(opts?: {
  durum?: string;
  onlyUnread?: boolean;
  sirketId?: string;
  faturaTarihi?: string;
  faturaBaslangic?: string;
  faturaBitis?: string;
}): Promise<GelenFaturaOzet[]> {
  const uyumsoftSirketId = resolveUyumsoftSirketId(opts?.sirketId);
  const where: Prisma.BekleyenFaturaWhereInput = {
    girisTipi: GIRIS_TIPI,
    uyumsoftSirketId,
  };
  if (opts?.durum) {
    where.durum = opts.durum;
  } else {
    where.durum = { in: ['BEKLIYOR', 'KISMI', 'AKTARILDI'] };
  }
  if (opts?.onlyUnread) {
    where.durum = 'BEKLIYOR';
  }

  const kayitlar = await prisma.bekleyenFatura.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  let ozetler = kayitlar.map(kayittanOzet);

  if (opts?.faturaTarihi) {
    const hedef = opts.faturaTarihi.slice(0, 10);
    ozetler = ozetler.filter((o) => o.faturaTarihi?.slice(0, 10) === hedef);
  }

  if (opts?.faturaBaslangic && opts?.faturaBitis) {
    ozetler = ozetler.filter((o) =>
      faturaTarihiAralikta(o.faturaTarihi, opts.faturaBaslangic!, opts.faturaBitis!),
    );
  }

  ozetler.sort((a, b) => {
    const ta = a.faturaTarihi ?? '';
    const tb = b.faturaTarihi ?? '';
    if (ta !== tb) return tb.localeCompare(ta);
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return ozetler.slice(0, 100);
}

export async function cekGelenFaturalar(opts?: {
  baslangic?: string;
  bitis?: string;
  onlyUnread?: boolean;
  pageSize?: number;
  pageIndex?: number;
  sirketId?: string;
}): Promise<{
  eklenen: number;
  guncellenen: number;
  toplam: number;
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  sureMs: number;
  aralikDisiSayisi: number;
}> {
  const startedAt = Date.now();
  const uyumsoftSirketId = resolveUyumsoftSirketId(opts?.sirketId);
  const faturaBasStr = (opts?.baslangic ?? new Date(Date.now() - 30 * 86400000).toISOString()).slice(0, 10);
  const faturaBitStr = (opts?.bitis ?? new Date().toISOString()).slice(0, 10);
  const faturaBas = dateAtStartOfDay(faturaBasStr);
  const faturaBit = dateAtEndOfDay(faturaBitStr);
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 50, 1), 100);
  const pageIndex = Math.max(opts?.pageIndex ?? 0, 0);

  // Uyumsoft: ExecutionDate ≈ fatura tarihi; CreateDate = kayıt tarihi (geniş pencere)
  const createBas = new Date(faturaBas.getTime() - 120 * 86400000);
  const createBit = new Date(Math.max(faturaBit.getTime(), Date.now()) + 7 * 86400000);

  const liste = await getInboxInvoiceList(uyumsoftSirketId, {
    executionStartDate: faturaBas,
    executionEndDate: faturaBit,
    createStartDate: createBas,
    createEndDate: createBit,
    pageSize,
    pageIndex,
    onlyUnread: opts?.onlyUnread ?? true,
  });

  let eklenen = 0;
  let guncellenen = 0;
  let aralikDisiSayisi = 0;

  const validItems = liste.items.filter((item) => item.documentId);
  const documentIds = validItems.map((item) => item.documentId);

  const mevcutKayitlar = documentIds.length
    ? await prisma.bekleyenFatura.findMany({
        where: { uyumsoftEttn: { in: documentIds } },
      })
    : [];
  const mevcutByEttn = new Map(
    mevcutKayitlar
      .filter((k) => k.uyumsoftEttn)
      .map((k) => [k.uyumsoftEttn as string, k]),
  );

  const detaySonuclari = await mapWithConcurrency(validItems, DETAY_CONCURRENCY, async (item) => {
    try {
      const detay = await getInboxInvoice(uyumsoftSirketId, item.documentId);
      return { item, detay };
    } catch (err) {
      console.warn(`[gelen-fatura] detay alınamadı (${item.documentId}):`, err);
      return { item, detay: null as InboxInvoiceDetail | null };
    }
  });

  for (const { item, detay } of detaySonuclari) {
    if (!detay) continue;

    const ozet = detaydanOzet(detay, item.issueDate);
    if (!faturaTarihiAralikta(ozet.issueDate, faturaBasStr, faturaBitStr)) {
      aralikDisiSayisi += 1;
      continue;
    }

    const mevcut = mevcutByEttn.get(item.documentId);
    const kalemlerJson = JSON.stringify(
      detay.lines.map((k) => ({
        stokKodu: k.stokKodu,
        urunAdi: k.urunAdi,
        barkod: k.barkod,
        miktar: k.miktar,
        birimFiyat: k.birimFiyat,
        kdvOrani: k.kdvOrani,
        iskonto: k.iskonto,
      })),
    );

    if (mevcut) {
      await prisma.bekleyenFatura.update({
        where: { id: mevcut.id },
        data: {
          uyumsoftNo: detay.invoiceNo,
          tedarikciAdi: detay.supplierTitle,
          uyumsoftVeri: JSON.stringify(ozet),
          uyumsoftDurum: item.status,
          uyumsoftSirketId,
          kalemler: kalemlerJson,
          aciklama: `Uyumsoft gelen fatura — ${detay.supplierTitle}`,
        },
      });
      guncellenen += 1;
    } else {
      await prisma.bekleyenFatura.create({
        data: {
          girisTipi: GIRIS_TIPI,
          uyumsoftEttn: item.documentId,
          uyumsoftNo: detay.invoiceNo,
          tedarikciAdi: detay.supplierTitle,
          uyumsoftVeri: JSON.stringify(ozet),
          uyumsoftDurum: item.status,
          uyumsoftSirketId,
          hedefDepo: 'ANADEPO',
          subeAdi: 'ANADEPO',
          kalemler: kalemlerJson,
          aciklama: `Uyumsoft gelen fatura — ${detay.supplierTitle}`,
          durum: 'BEKLIYOR',
        },
      });
      eklenen += 1;
    }
  }

  const hasMore = (pageIndex + 1) * pageSize < liste.totalCount;
  const sureMs = Date.now() - startedAt;

  return {
    eklenen,
    guncellenen,
    toplam: liste.items.length,
    pageIndex: liste.pageIndex,
    pageSize: liste.pageSize,
    totalCount: liste.totalCount,
    hasMore,
    sureMs,
    aralikDisiSayisi,
  };
}

export interface UrunGirisFormVerisi {
  girisTipi: 'FATURAYLA';
  kaynak: 'UYUMSOFT';
  cariAdi: string;
  tedarikciVkn: string;
  tedarikci: UyumsoftSupplierParty;
  faturaNo: string;
  faturaReferans: string;
  faturaTarihi: string;
  faturaToplamKdvHaric: number;
  hedefDepo: string;
  hamSatirlar: UyumsoftHamSatir[];
  kolonMap: UyumsoftKolonMap;
  kolonMapKayitli: boolean;
  utsKalemler: Array<{ barkod: string; adet: number; urunAdi: string }>;
}

function normalizeKolonMap(raw: unknown): UyumsoftKolonMap {
  const base = { ...VARSAYILAN_KOLON_MAP };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, string>;
  for (const key of UYUMSOFT_KOLON_ANAHTARLARI) {
    const val = obj[key];
    if (
      val === 'urunAdi' ||
      val === 'malzemeHizmet' ||
      val === 'stokKodu' ||
      val === 'barkod' ||
      val === 'miktar' ||
      val === 'birimFiyat' ||
      val === 'iskontoOrani' ||
      val === 'iskontoTutar' ||
      val === 'kdvOrani' ||
      val === 'siparisNo' ||
      val === 'yoksay'
    ) {
      base[key] = val;
    }
  }
  return base;
}

export async function getSutunEslestirme(opts: {
  tedarikciVkn?: string;
  tedarikciAdi?: string;
}): Promise<{ kolonMap: UyumsoftKolonMap; kayitli: boolean }> {
  const vkn = opts.tedarikciVkn?.trim();
  const adi = opts.tedarikciAdi?.trim();

  let kayit = vkn
    ? await prisma.uyumsoftSutunEslestirme.findUnique({ where: { tedarikciVkn: vkn } })
    : null;

  if (!kayit && adi) {
    kayit = await prisma.uyumsoftSutunEslestirme.findFirst({
      where: { tedarikciAdi: { equals: adi, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!kayit) {
    return { kolonMap: { ...VARSAYILAN_KOLON_MAP }, kayitli: false };
  }

  try {
    return {
      kolonMap: normalizeKolonMap(JSON.parse(kayit.kolonMap)),
      kayitli: true,
    };
  } catch {
    return { kolonMap: { ...VARSAYILAN_KOLON_MAP }, kayitli: false };
  }
}

export async function saveSutunEslestirme(opts: {
  tedarikciVkn?: string;
  tedarikciAdi?: string;
  kolonMap: UyumsoftKolonMap;
}): Promise<void> {
  const vkn = opts.tedarikciVkn?.trim() || null;
  const adi = opts.tedarikciAdi?.trim() || null;
  const kolonMap = normalizeKolonMap(opts.kolonMap);
  const json = JSON.stringify(kolonMap);

  if (vkn) {
    await prisma.uyumsoftSutunEslestirme.upsert({
      where: { tedarikciVkn: vkn },
      create: { tedarikciVkn: vkn, tedarikciAdi: adi, kolonMap: json },
      update: { tedarikciAdi: adi ?? undefined, kolonMap: json },
    });
    return;
  }

  if (!adi) {
    throw new Error('Tedarikçi bilgisi gerekli');
  }

  const mevcut = await prisma.uyumsoftSutunEslestirme.findFirst({
    where: { tedarikciAdi: { equals: adi, mode: 'insensitive' } },
  });

  if (mevcut) {
    await prisma.uyumsoftSutunEslestirme.update({
      where: { id: mevcut.id },
      data: { kolonMap: json, tedarikciAdi: adi },
    });
  } else {
    await prisma.uyumsoftSutunEslestirme.create({
      data: { tedarikciAdi: adi, kolonMap: json },
    });
  }
}

export function hamSatirlardanUrunSatirlari(
  bekleyenFaturaId: string,
  hamSatirlar: UyumsoftHamSatir[],
  kolonMap: UyumsoftKolonMap,
) {
  const rolDeger = (satir: UyumsoftHamSatir, rol: UyumsoftKolonRol): string => {
    for (const kolon of UYUMSOFT_KOLON_ANAHTARLARI) {
      if (kolonMap[kolon] === rol) {
        const val = satir[kolon];
        return val == null ? '' : String(val);
      }
    }
    return '';
  };

  return hamSatirlar.map((satir, idx) => ({
    id: `uyum-${bekleyenFaturaId}-${idx}`,
    tedarikciUrunAdi: rolDeger(satir, 'urunAdi'),
    tedarikciKodu: rolDeger(satir, 'stokKodu'),
    uretici: '',
    bizimUrunId: null as string | null,
    bizimUrunAdi: '',
    bizimUrunOdooId: null as number | null,
    miktar: Number(rolDeger(satir, 'miktar') || satir.miktar || 1),
    birimFiyat: rolDeger(satir, 'birimFiyat') || String(satir.birimFiyat),
    iskonto: String(satir.iskonto ?? 0),
    kdvOrani: rolDeger(satir, 'kdvOrani') || String(satir.kdvOrani || 20),
    eslesti: false,
  }));
}

export async function urunGirisineAktar(
  id: string,
  opts?: { hedefDepo?: string },
): Promise<{ form: UrunGirisFormVerisi; bekleyenFaturaId: string }> {
  const kayit = await prisma.bekleyenFatura.findFirst({
    where: { id, girisTipi: GIRIS_TIPI },
  });
  if (!kayit) {
    throw new Error('Gelen fatura kaydı bulunamadı');
  }

  let detay: ReturnType<typeof detaydanOzet> | null = null;
  if (kayit.uyumsoftVeri) {
    try {
      detay = JSON.parse(kayit.uyumsoftVeri);
    } catch {
      detay = null;
    }
  }

  const supplierEksik = !detay?.supplier;
  const linesEksik = !detay?.lines?.length || detay.lines.some((l) => l.malzemeHizmet === undefined);
  if ((!detay || supplierEksik || linesEksik) && kayit.uyumsoftEttn) {
    const uyumsoftSirketId = resolveUyumsoftSirketId(kayit.uyumsoftSirketId ?? undefined);
    const fresh = await getInboxInvoice(uyumsoftSirketId, kayit.uyumsoftEttn);
    if (fresh) {
      detay = detaydanOzet(fresh);
      await prisma.bekleyenFatura.update({
        where: { id },
        data: {
          uyumsoftVeri: JSON.stringify(detay),
          kalemler: JSON.stringify(detay.lines),
          tedarikciAdi: fresh.supplierTitle,
          uyumsoftNo: fresh.invoiceNo,
        },
      });
    }
  }

  if (!detay) {
    throw new Error('Fatura detayı okunamadı');
  }

  if (detay.lines?.length) {
    const corrected = resolveTaxExclusiveAmount(detay.taxExclusiveAmount, detay.lines);
    if (corrected !== detay.taxExclusiveAmount) {
      detay = { ...detay, taxExclusiveAmount: corrected };
    }
  }

  const supplier: UyumsoftSupplierParty = detay.supplier ?? {
    name: detay.supplierTitle,
    vkn: detay.supplierVkn,
    vergiDairesi: '',
    adres: '',
    il: '',
    ilce: '',
    telefon: '',
    email: '',
    tip: tipFromVkn(detay.supplierVkn),
  };

  const hedefDepo = opts?.hedefDepo ?? kayit.hedefDepo ?? 'ANADEPO';

  const hamSatirlar: UyumsoftHamSatir[] = detay.lines.map((line) => ({
    sira: line.sira,
    stokKodu: line.stokKodu || '',
    urunAdi: line.urunAdi || '',
    malzemeHizmet: line.malzemeHizmet || '',
    barkod: line.barkod || '',
    miktar: line.miktar,
    birimFiyat: line.birimFiyat,
    kdvOrani: line.kdvOrani,
    iskontoOrani: line.iskontoOrani || '',
    iskontoTutar: line.iskontoTutar ?? 0,
    iskonto: line.iskonto ?? 0,
    siparisNo: line.siparisNo || detay.siparisNo || '',
  }));

  const { kolonMap, kayitli: kolonMapKayitli } = await getSutunEslestirme({
    tedarikciVkn: detay.supplierVkn,
    tedarikciAdi: detay.supplierTitle,
  });

  const utsKalemler = hamSatirlar
    .filter((l) => l.barkod)
    .map((l) => ({ barkod: l.barkod, adet: l.miktar, urunAdi: l.malzemeHizmet || l.urunAdi }));

  await prisma.bekleyenFatura.update({
    where: { id },
    data: {
      hedefDepo,
      subeAdi: hedefDepo,
    },
  });

  return {
    bekleyenFaturaId: id,
    form: {
      girisTipi: 'FATURAYLA',
      kaynak: 'UYUMSOFT',
      cariAdi: detay.supplierTitle,
      tedarikciVkn: detay.supplierVkn,
      tedarikci: supplier,
      faturaNo: detay.invoiceNo,
      faturaReferans: detay.documentId,
      faturaTarihi: detay.issueDate || new Date().toISOString().slice(0, 10),
      faturaToplamKdvHaric: detay.taxExclusiveAmount,
      hedefDepo,
      hamSatirlar,
      kolonMap,
      kolonMapKayitli,
      utsKalemler,
    },
  };
}

export async function onaylaUyumsoftAktarim(id: string): Promise<void> {
  const kayit = await prisma.bekleyenFatura.findFirst({
    where: { id, girisTipi: GIRIS_TIPI },
  });
  if (!kayit) throw new Error('Gelen fatura kaydı bulunamadı');

  await prisma.bekleyenFatura.update({
    where: { id },
    data: { durum: 'AKTARILDI' },
  });
}

export async function olusturUtsAlmaBildirimi(
  bekleyenFaturaId: string,
  opts: {
    branchId: string;
    kalemler: Array<{ barkod: string; seriNo?: string; lotNo?: string; adet?: number }>;
    belgeNo?: string;
    hemenGonder?: boolean;
  },
): Promise<{ bildirimId: string }> {
  const kayit = await prisma.bekleyenFatura.findFirst({
    where: { id: bekleyenFaturaId, girisTipi: GIRIS_TIPI },
  });
  if (!kayit) throw new Error('Gelen fatura bulunamadı');
  if (!opts.kalemler.length) throw new Error('UTS için kalem gerekli');

  let detay: { supplierVkn?: string; supplierTitle?: string; invoiceNo?: string } | null = null;
  if (kayit.uyumsoftVeri) {
    try {
      detay = JSON.parse(kayit.uyumsoftVeri);
    } catch {
      detay = null;
    }
  }

  const bildirim = await prisma.utsBildirim.create({
    data: {
      tip: 'ALMA',
      branchId: opts.branchId,
      belgeNo: opts.belgeNo ?? kayit.uyumsoftNo ?? undefined,
      karsiVkn: detay?.supplierVkn,
      karsiAd: detay?.supplierTitle ?? kayit.tedarikciAdi ?? undefined,
      payload: {
        BNO: opts.belgeNo ?? kayit.uyumsoftNo ?? null,
        VKN: detay?.supplierVkn ?? null,
        kaynak: 'UYUMSOFT_GELEN',
        bekleyenFaturaId,
      },
      durum: 'BEKLIYOR',
      kalemler: {
        create: opts.kalemler.map((k) => ({
          barkod: k.barkod,
          seriNo: k.seriNo ?? null,
          lotNo: k.lotNo ?? null,
          adet: k.adet ?? 1,
        })),
      },
    },
  });

  return { bildirimId: bildirim.id };
}
