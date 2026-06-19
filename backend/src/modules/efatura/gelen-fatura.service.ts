import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  getInboxInvoice,
  getInboxInvoiceList,
  type InboxInvoiceDetail,
} from '../uyumsoft/uyumsoft.service';

const GIRIS_TIPI = 'UYUMSOFT_GELEN';

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
        urunAdi: k.urunAdi,
        miktar: k.miktar,
        birimFiyat: k.birimFiyat,
        kdvOrani: k.kdvOrani,
        barkod: k.barkod,
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
  cariAdi: string;
  faturaNo: string;
  faturaReferans: string;
  faturaTarihi: string;
  faturaToplamKdvHaric: number;
  hedefDepo: string;
  satirlar: Array<{
    id: string;
    tedarikciUrunAdi: string;
    uretici: string;
    bizimUrunId: string | null;
    bizimUrunAdi: string;
    bizimUrunOdooId: number | null;
    miktar: number;
    birimFiyat: string;
    iskonto: string;
    kdvOrani: string;
    eslesti: boolean;
  }>;
  utsKalemler: Array<{ barkod: string; adet: number; urunAdi: string }>;
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

  const satirlar = detay.lines.map((line, idx) => ({
    id: `uyum-${id}-${idx}`,
    tedarikciUrunAdi: line.urunAdi,
    uretici: '',
    bizimUrunId: null,
    bizimUrunAdi: '',
    bizimUrunOdooId: null,
    miktar: line.miktar,
    birimFiyat: String(line.birimFiyat),
    iskonto: '0',
    kdvOrani: String(line.kdvOrani || 20),
    eslesti: false,
  }));

  const utsKalemler = detay.lines
    .filter((l) => l.barkod)
    .map((l) => ({ barkod: l.barkod!, adet: l.miktar, urunAdi: l.urunAdi }));

  await prisma.bekleyenFatura.update({
    where: { id },
    data: {
      durum: 'AKTARILDI',
      hedefDepo,
      subeAdi: hedefDepo,
    },
  });

  return {
    bekleyenFaturaId: id,
    form: {
      girisTipi: 'FATURAYLA',
      cariAdi: detay.supplierTitle,
      faturaNo: detay.invoiceNo,
      faturaReferans: detay.documentId,
      faturaTarihi: detay.issueDate || new Date().toISOString().slice(0, 10),
      faturaToplamKdvHaric: detay.taxExclusiveAmount,
      hedefDepo,
      satirlar,
      utsKalemler,
    },
  };
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
