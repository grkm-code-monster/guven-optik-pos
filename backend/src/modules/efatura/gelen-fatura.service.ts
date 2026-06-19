import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  getInboxInvoice,
  getInboxInvoiceList,
  type InboxInvoiceDetail,
} from '../uyumsoft/uyumsoft.service';

const GIRIS_TIPI = 'UYUMSOFT_GELEN';

export const UYUMSOFT_KOLON_ANAHTARLARI = [
  'stokKodu',
  'urunAdi',
  'barkod',
  'miktar',
  'birimFiyat',
  'kdvOrani',
] as const;

export type UyumsoftKolonAnahtari = (typeof UYUMSOFT_KOLON_ANAHTARLARI)[number];

export type UyumsoftKolonRol =
  | 'urunAdi'
  | 'stokKodu'
  | 'barkod'
  | 'miktar'
  | 'birimFiyat'
  | 'kdvOrani'
  | 'yoksay';

export type UyumsoftKolonMap = Record<UyumsoftKolonAnahtari, UyumsoftKolonRol>;

export const VARSAYILAN_KOLON_MAP: UyumsoftKolonMap = {
  stokKodu: 'stokKodu',
  urunAdi: 'urunAdi',
  barkod: 'barkod',
  miktar: 'miktar',
  birimFiyat: 'birimFiyat',
  kdvOrani: 'kdvOrani',
};

export interface UyumsoftHamSatir {
  sira: number;
  stokKodu: string;
  urunAdi: string;
  barkod: string;
  miktar: number;
  birimFiyat: number;
  kdvOrani: number;
  iskonto?: number;
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

function detaydanOzet(detay: InboxInvoiceDetail) {
  return {
    documentId: detay.documentId,
    invoiceNo: detay.invoiceNo,
    supplierTitle: detay.supplierTitle,
    supplierVkn: detay.supplierVkn,
    issueDate: detay.issueDate,
    taxExclusiveAmount: detay.taxExclusiveAmount,
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
    faturaTarihi: veri?.issueDate,
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
}): Promise<GelenFaturaOzet[]> {
  const where: Prisma.BekleyenFaturaWhereInput = {
    girisTipi: GIRIS_TIPI,
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
    take: 100,
  });

  return kayitlar.map(kayittanOzet);
}

export async function cekGelenFaturalar(opts?: {
  baslangic?: string;
  bitis?: string;
  onlyUnread?: boolean;
  pageSize?: number;
}): Promise<{ eklenen: number; guncellenen: number; toplam: number }> {
  const baslangic = opts?.baslangic ? new Date(opts.baslangic) : new Date(Date.now() - 30 * 86400000);
  const bitis = opts?.bitis ? new Date(opts.bitis) : new Date();
  const pageSize = opts?.pageSize ?? 30;

  const liste = await getInboxInvoiceList({
    createStartDate: baslangic,
    createEndDate: bitis,
    pageSize,
    onlyUnread: opts?.onlyUnread ?? true,
  });

  let eklenen = 0;
  let guncellenen = 0;

  for (const item of liste.items) {
    if (!item.documentId) continue;

    const mevcut = await prisma.bekleyenFatura.findUnique({
      where: { uyumsoftEttn: item.documentId },
    });

    const detay = await getInboxInvoice(item.documentId);
    if (!detay) continue;

    const ozet = detaydanOzet(detay);
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

  return { eklenen, guncellenen, toplam: liste.items.length };
}

export interface UrunGirisFormVerisi {
  girisTipi: 'FATURAYLA';
  kaynak: 'UYUMSOFT';
  cariAdi: string;
  tedarikciVkn: string;
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
      val === 'stokKodu' ||
      val === 'barkod' ||
      val === 'miktar' ||
      val === 'birimFiyat' ||
      val === 'kdvOrani' ||
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
    iskonto: satir.iskonto ? String(satir.iskonto) : '0',
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

  if (!detay && kayit.uyumsoftEttn) {
    const fresh = await getInboxInvoice(kayit.uyumsoftEttn);
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

  const hedefDepo = opts?.hedefDepo ?? kayit.hedefDepo ?? 'ANADEPO';

  const hamSatirlar: UyumsoftHamSatir[] = detay.lines.map((line) => ({
    sira: line.sira,
    stokKodu: line.stokKodu || '',
    urunAdi: line.urunAdi || '',
    barkod: line.barkod || '',
    miktar: line.miktar,
    birimFiyat: line.birimFiyat,
    kdvOrani: line.kdvOrani,
    iskonto: line.iskonto,
  }));

  const { kolonMap, kayitli: kolonMapKayitli } = await getSutunEslestirme({
    tedarikciVkn: detay.supplierVkn,
    tedarikciAdi: detay.supplierTitle,
  });

  const utsKalemler = hamSatirlar
    .filter((l) => l.barkod)
    .map((l) => ({ barkod: l.barkod, adet: l.miktar, urunAdi: l.urunAdi }));

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
