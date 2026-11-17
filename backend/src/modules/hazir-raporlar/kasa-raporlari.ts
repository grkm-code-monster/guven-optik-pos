import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  GECERSIZ_SATIS,
  GUN_MS,
  ODEME_ADI,
  aralik,
  bankalar,
  gecenYil,
  haftaBasi,
  kullanicilar,
  sayi,
  subeFiltresi,
  subeler,
  trGun,
  yuvarla,
} from './ortak';
import type { Filtre, RaporSonuc, Satir } from './tipler';

// ───────────────────────── Ciro ─────────────────────────

export const CIRO_GRUPLAMA = [
  { key: 'gun', label: 'Gün' },
  { key: 'hafta', label: 'Hafta' },
  { key: 'ay', label: 'Ay' },
  { key: 'sube', label: 'Şube' },
];

async function ciroSatislari(gte: Date, lte: Date, subeIds?: string[]) {
  const s = await prisma.sale.findMany({
    where: { status: { notIn: [...GECERSIZ_SATIS] }, createdAt: { gte, lte }, ...(subeIds ? { branchId: { in: subeIds } } : {}) },
    select: {
      createdAt: true,
      branchId: true,
      netTotal: true,
      taxTotal: true,
      payments: { where: { paymentType: 'CIRO_DUZELTME' }, select: { grossAmount: true } },
    },
  });
  return s.map((x) => {
    const net = sayi(x.netTotal);
    const duz = x.payments.reduce((a, p) => a + sayi(p.grossAmount), 0);
    const oran = net > 0 ? (net - sayi(x.taxTotal)) / net : 1;
    return { tarih: x.createdAt, subeId: x.branchId, ciro: net - duz, kdvHaric: (net - duz) * oran };
  });
}

export async function ciroRaporu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'gun';
  const sb = await subeler();
  const anahtar = (d: Date, subeId: string, kaydir = false): { k: string; ad: string } => {
    const t = kaydir ? new Date(d.getTime() + 364 * GUN_MS) : d;
    const gun = trGun(t);
    if (gruplama === 'sube') {
      const s = sb.get(subeId);
      return { k: subeId, ad: s ? `${s.kod} · ${s.ad}` : subeId };
    }
    if (gruplama === 'ay') {
      const a = kaydir ? `${Number(trGun(d).slice(0, 4)) + 1}${trGun(d).slice(4, 7)}` : gun.slice(0, 7);
      return { k: a, ad: a };
    }
    if (gruplama === 'hafta') {
      const h = haftaBasi(gun);
      return { k: h, ad: `${h} haftası` };
    }
    // gün: geçen yılın aynı TARİHİ
    const g = kaydir ? `${Number(trGun(d).slice(0, 4)) + 1}${trGun(d).slice(4)}` : gun;
    return { k: g, ad: g };
  };

  const bu = await ciroSatislari(r.gte, r.lte, subeIds);
  const gy = gecenYil(r.bas, r.bit);
  const once = await ciroSatislari(gy.gte, gy.lte, subeIds);

  const m = new Map<string, { ad: string; satis: number; ciro: number; kdvHaric: number; gy: number }>();
  for (const x of bu) {
    const a = anahtar(x.tarih, x.subeId);
    const o = m.get(a.k) ?? { ad: a.ad, satis: 0, ciro: 0, kdvHaric: 0, gy: 0 };
    o.satis++;
    o.ciro += x.ciro;
    o.kdvHaric += x.kdvHaric;
    m.set(a.k, o);
  }
  for (const x of once) {
    const a = anahtar(x.tarih, x.subeId, true);
    const o = m.get(a.k);
    if (o) o.gy += x.ciro;
    else if (gruplama === 'sube') m.set(a.k, { ad: a.ad, satis: 0, ciro: 0, kdvHaric: 0, gy: x.ciro });
  }
  const toplam = [...m.values()].reduce((a, x) => a + x.ciro, 0);
  const gyToplam = once.reduce((a, x) => a + x.ciro, 0);
  const satirlar: Satir[] = [...m.entries()]
    .sort((a, b) => (gruplama === 'sube' ? b[1].ciro - a[1].ciro : a[0].localeCompare(b[0])))
    .map(([, x]) => ({
      donem: x.ad,
      satis: x.satis,
      ciro: yuvarla(x.ciro),
      kdvHaric: yuvarla(x.kdvHaric),
      sepet: x.satis ? yuvarla(x.ciro / x.satis) : 0,
      pay: toplam ? yuvarla((x.ciro / toplam) * 100, 1) : 0,
      gecenYil: yuvarla(x.gy),
      degisim: x.gy ? yuvarla(((x.ciro - x.gy) / x.gy) * 100, 1) : null,
    }));
  return {
    kolonlar: [
      { key: 'donem', label: CIRO_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Dönem', tip: 'metin' },
      { key: 'satis', label: 'Satış adedi', tip: 'sayi', toplam: true },
      { key: 'ciro', label: 'Ciro (KDV dahil)', tip: 'para', toplam: true },
      { key: 'kdvHaric', label: 'KDV hariç', tip: 'para', toplam: true },
      { key: 'sepet', label: 'Ort. sepet', tip: 'para' },
      { key: 'pay', label: 'Pay', tip: 'yuzde' },
      { key: 'gecenYil', label: 'Geçen yıl', tip: 'para', toplam: true },
      { key: 'degisim', label: 'Değişim', tip: 'yuzde' },
    ],
    satirlar,
    ozet: [
      { ad: 'Ciro', deger: yuvarla(toplam), tip: 'para', alt: gyToplam ? `geçen yıl: %${yuvarla(((toplam - gyToplam) / gyToplam) * 100, 1)}` : undefined },
      { ad: 'Satış adedi', deger: bu.length, tip: 'sayi' },
      { ad: 'Günlük ortalama', deger: yuvarla(toplam / r.gunSayisi), tip: 'para' },
      { ad: 'Geçen yıl aynı dönem', deger: yuvarla(gyToplam), tip: 'para' },
    ],
    notlar: [
      'Ciro satış tarihine göredir, KDV dahildir; ciro düzeltmeleri düşülmüştür.',
      'Geçen yıl: yeni sistemde kayıtlı satışlar. Yeni sisteme geçiş öncesi dönemler 0 görünür.',
      gruplama === 'hafta' ? 'Hafta karşılaştırması geçen yılın aynı haftasıyla (364 gün önce) yapılır.' : '',
    ].filter(Boolean),
  };
}

// ───────────────────────── Tahsilat Dağılımı ─────────────────────────

export const TAHSILAT_GRUPLAMA = [
  { key: 'tip', label: 'Ödeme tipi' },
  { key: 'tur', label: 'Tahsilat türü' },
  { key: 'sube', label: 'Şube (kasa)' },
  { key: 'gun', label: 'Gün' },
  { key: 'personel', label: 'Personel' },
  { key: 'detay', label: 'Detay (tek tek)' },
];

const KASA_TIPLERI = ['CASH', 'CARD', 'TRANSFER'] as const;

type Tahsilat = {
  tarih: Date;
  subeId: string;
  tip: string;
  tur: string;
  tutar: number;
  komisyon: number;
  personelId: string;
  musteri: string;
  aciklama: string;
};

async function tahsilatlariOku(f: Filtre, sadeceTip?: string): Promise<Tahsilat[]> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const tipler = sadeceTip ? [sadeceTip] : f.odemeTipi && (KASA_TIPLERI as readonly string[]).includes(f.odemeTipi) ? [f.odemeTipi] : [...KASA_TIPLERI];
  const subeKosul: Prisma.PaymentWhereInput | undefined = subeIds
    ? { OR: [{ tahsilatBranchId: { in: subeIds } }, { tahsilatBranchId: null, sale: { branchId: { in: subeIds } } }] }
    : undefined;
  const odemeler = await prisma.payment.findMany({
    where: {
      paymentType: { in: tipler as never[] },
      createdAt: { gte: r.gte, lte: r.lte },
      sale: { status: { notIn: [...GECERSIZ_SATIS] } },
      ...(subeKosul ?? {}),
    },
    select: {
      createdAt: true,
      paymentType: true,
      grossAmount: true,
      commissionAmount: true,
      tahsilatBranchId: true,
      createdByUserId: true,
      aciklama: true,
      sale: { select: { createdAt: true, branchId: true, userId: true, referansNo: true, customer: { select: { name: true } } } },
    },
  });
  const out: Tahsilat[] = odemeler.map((o) => ({
    tarih: o.createdAt,
    subeId: o.tahsilatBranchId ?? o.sale.branchId,
    tip: o.paymentType,
    tur: trGun(o.createdAt) === trGun(o.sale.createdAt) ? 'Satış günü tahsilatı' : 'Sonradan / açık hesap tahsilatı',
    tutar: sayi(o.grossAmount),
    komisyon: sayi(o.commissionAmount),
    personelId: o.createdByUserId ?? o.sale.userId,
    musteri: o.sale.customer?.name ?? '',
    aciklama: [o.sale.referansNo ? `Fiş ${o.sale.referansNo}` : '', o.aciklama ?? ''].filter(Boolean).join(' · '),
  }));
  const manuel = await prisma.manuelTahsilat.findMany({
    where: {
      createdAt: { gte: r.gte, lte: r.lte },
      odemeTuru: { in: tipler },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
    },
  });
  for (const m of manuel) {
    out.push({
      tarih: m.createdAt,
      subeId: m.branchId,
      tip: m.odemeTuru,
      tur: 'Eski borç (manuel) tahsilatı',
      tutar: sayi(m.tutar),
      komisyon: sayi(m.commissionAmount),
      personelId: m.userId,
      musteri: m.customerAdi,
      aciklama: m.aciklama ?? '',
    });
  }
  return out;
}

export async function tahsilatDagilimi(f: Filtre): Promise<RaporSonuc> {
  const gruplama = f.gruplama || 'tip';
  const liste = await tahsilatlariOku(f);
  const sb = await subeler();
  const pers = await kullanicilar(liste.map((t) => t.personelId));
  const toplam = liste.reduce((a, t) => a + t.tutar, 0);
  const notlar = [
    'Kasaya giren para, TAHSİLAT gününe ve tahsil eden şubeye göre (kasa formuyla aynı mantık). Nakit, kart ve havale; SGK/Vakıf katkıları dahil değildir.',
  ];
  if (gruplama === 'detay') {
    const satirlar: Satir[] = liste
      .sort((a, b) => b.tarih.getTime() - a.tarih.getTime())
      .map((t) => ({
        tarih: t.tarih.toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 16),
        sube: sb.get(t.subeId)?.kod ?? '',
        tip: ODEME_ADI[t.tip] ?? t.tip,
        tur: t.tur,
        musteri: t.musteri,
        personel: pers.get(t.personelId) ?? '',
        aciklama: t.aciklama,
        tutar: yuvarla(t.tutar),
        komisyon: yuvarla(t.komisyon),
      }));
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'tip', label: 'Ödeme tipi', tip: 'metin' },
        { key: 'tur', label: 'Tür', tip: 'metin' },
        { key: 'musteri', label: 'Müşteri', tip: 'metin' },
        { key: 'personel', label: 'Personel', tip: 'metin' },
        { key: 'aciklama', label: 'Açıklama', tip: 'metin' },
        { key: 'tutar', label: 'Tutar', tip: 'para', toplam: true },
        { key: 'komisyon', label: 'Komisyon', tip: 'para', toplam: true },
      ],
      satirlar,
      notlar,
    };
  }
  const m = new Map<string, { ad: string; islem: number; tutar: number; komisyon: number; nakit: number; kart: number; havale: number }>();
  for (const t of liste) {
    let k: string;
    let ad: string;
    switch (gruplama) {
      case 'tur':
        k = t.tur;
        ad = t.tur;
        break;
      case 'sube': {
        const s = sb.get(t.subeId);
        k = t.subeId;
        ad = s ? `${s.kod} · ${s.ad}` : k;
        break;
      }
      case 'gun':
        k = trGun(t.tarih);
        ad = k;
        break;
      case 'personel':
        k = t.personelId;
        ad = pers.get(t.personelId) ?? '(bilinmiyor)';
        break;
      default:
        k = t.tip;
        ad = ODEME_ADI[t.tip] ?? t.tip;
    }
    const o = m.get(k) ?? { ad, islem: 0, tutar: 0, komisyon: 0, nakit: 0, kart: 0, havale: 0 };
    o.islem++;
    o.tutar += t.tutar;
    o.komisyon += t.komisyon;
    if (t.tip === 'CASH') o.nakit += t.tutar;
    else if (t.tip === 'CARD') o.kart += t.tutar;
    else o.havale += t.tutar;
    m.set(k, o);
  }
  const satirlar: Satir[] = [...m.entries()]
    .sort((a, b) => (gruplama === 'gun' ? a[0].localeCompare(b[0]) : b[1].tutar - a[1].tutar))
    .map(([, x]) => ({
      grup: x.ad,
      islem: x.islem,
      nakit: yuvarla(x.nakit),
      kart: yuvarla(x.kart),
      havale: yuvarla(x.havale),
      tutar: yuvarla(x.tutar),
      komisyon: yuvarla(x.komisyon),
      net: yuvarla(x.tutar - x.komisyon),
      pay: toplam ? yuvarla((x.tutar / toplam) * 100, 1) : 0,
    }));
  const tipBazli = (tip: string) => yuvarla(liste.filter((t) => t.tip === tip).reduce((a, t) => a + t.tutar, 0));
  return {
    kolonlar: [
      { key: 'grup', label: TAHSILAT_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'islem', label: 'İşlem', tip: 'sayi', toplam: true },
      { key: 'nakit', label: 'Nakit', tip: 'para', toplam: true },
      { key: 'kart', label: 'Kart', tip: 'para', toplam: true },
      { key: 'havale', label: 'Havale', tip: 'para', toplam: true },
      { key: 'tutar', label: 'Toplam', tip: 'para', toplam: true },
      { key: 'komisyon', label: 'Komisyon', tip: 'para', toplam: true },
      { key: 'net', label: 'Net', tip: 'para', toplam: true },
      { key: 'pay', label: 'Pay', tip: 'yuzde' },
    ],
    satirlar,
    notlar,
    ozet: [
      { ad: 'Toplam tahsilat', deger: yuvarla(toplam), tip: 'para' },
      { ad: 'Nakit', deger: tipBazli('CASH'), tip: 'para' },
      { ad: 'Kart', deger: tipBazli('CARD'), tip: 'para' },
      { ad: 'Havale', deger: tipBazli('TRANSFER'), tip: 'para' },
    ],
  };
}

// ───────────────────────── Kredi Kartı Tahsilatı ─────────────────────────

export const KART_GRUPLAMA = [
  { key: 'bankaTaksit', label: 'Banka ve taksit' },
  { key: 'banka', label: 'Banka' },
  { key: 'pos', label: 'POS cihazı' },
  { key: 'sube', label: 'Şube' },
  { key: 'gun', label: 'Gün' },
];

export async function krediKartiRaporu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'bankaTaksit';
  const odemeler = await prisma.payment.findMany({
    where: {
      paymentType: 'CARD',
      createdAt: { gte: r.gte, lte: r.lte },
      sale: { status: { notIn: [...GECERSIZ_SATIS] } },
      ...(subeIds
        ? { OR: [{ tahsilatBranchId: { in: subeIds } }, { tahsilatBranchId: null, sale: { branchId: { in: subeIds } } }] }
        : {}),
    },
    select: {
      createdAt: true,
      bankId: true,
      posDeviceId: true,
      installment: true,
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
      tahsilatBranchId: true,
      sale: { select: { branchId: true } },
    },
  });
  const manuel = await prisma.manuelTahsilat.findMany({
    where: { odemeTuru: 'CARD', createdAt: { gte: r.gte, lte: r.lte }, ...(subeIds ? { branchId: { in: subeIds } } : {}) },
  });
  type K = { tarih: Date; bankId: string | null; posId: string | null; taksit: number; brut: number; kom: number; net: number; subeId: string };
  const liste: K[] = [
    ...odemeler.map((o) => ({
      tarih: o.createdAt,
      bankId: o.bankId,
      posId: o.posDeviceId,
      taksit: o.installment ?? 1,
      brut: sayi(o.grossAmount),
      kom: sayi(o.commissionAmount),
      net: sayi(o.netAmount),
      subeId: o.tahsilatBranchId ?? o.sale.branchId,
    })),
    ...manuel.map((m) => ({
      tarih: m.createdAt,
      bankId: m.bankId,
      posId: m.posDeviceId,
      taksit: m.installment ?? 1,
      brut: sayi(m.tutar),
      kom: sayi(m.commissionAmount),
      net: sayi(m.tutar) - sayi(m.commissionAmount),
      subeId: m.branchId,
    })),
  ];
  const bk = await bankalar();
  const sb = await subeler();
  const poslar = new Map((await prisma.posDevice.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const m = new Map<string, { ad: string; islem: number; brut: number; kom: number; net: number }>();
  for (const x of liste) {
    const banka = bk.get(x.bankId ?? '') ?? 'Banka belirtilmemiş';
    let k: string;
    let ad: string;
    switch (gruplama) {
      case 'banka':
        k = x.bankId ?? '-';
        ad = banka;
        break;
      case 'pos':
        k = x.posId ?? '-';
        ad = `${banka} · ${poslar.get(x.posId ?? '') ?? 'POS belirtilmemiş'}`;
        break;
      case 'sube': {
        const s = sb.get(x.subeId);
        k = x.subeId;
        ad = s ? `${s.kod} · ${s.ad}` : k;
        break;
      }
      case 'gun':
        k = trGun(x.tarih);
        ad = k;
        break;
      default:
        k = `${x.bankId}|${x.taksit}`;
        ad = `${banka} · ${x.taksit > 1 ? `${x.taksit} taksit` : 'tek çekim'}`;
    }
    const o = m.get(k) ?? { ad, islem: 0, brut: 0, kom: 0, net: 0 };
    o.islem++;
    o.brut += x.brut;
    o.kom += x.kom;
    o.net += x.net;
    m.set(k, o);
  }
  const toplam = liste.reduce((a, x) => a + x.brut, 0);
  const kom = liste.reduce((a, x) => a + x.kom, 0);
  const satirlar: Satir[] = [...m.entries()]
    .sort((a, b) => (gruplama === 'gun' ? a[0].localeCompare(b[0]) : b[1].brut - a[1].brut))
    .map(([, x]) => ({
      grup: x.ad,
      islem: x.islem,
      brut: yuvarla(x.brut),
      komisyon: yuvarla(x.kom),
      oran: x.brut ? yuvarla((x.kom / x.brut) * 100, 2) : 0,
      net: yuvarla(x.net),
      pay: toplam ? yuvarla((x.brut / toplam) * 100, 1) : 0,
    }));
  return {
    kolonlar: [
      { key: 'grup', label: KART_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'islem', label: 'İşlem', tip: 'sayi', toplam: true },
      { key: 'brut', label: 'Çekilen', tip: 'para', toplam: true },
      { key: 'komisyon', label: 'Komisyon', tip: 'para', toplam: true },
      { key: 'oran', label: 'Komisyon %', tip: 'yuzde' },
      { key: 'net', label: 'Net', tip: 'para', toplam: true },
      { key: 'pay', label: 'Pay', tip: 'yuzde' },
    ],
    satirlar,
    ozet: [
      { ad: 'Çekilen', deger: yuvarla(toplam), tip: 'para' },
      { ad: 'Komisyon', deger: yuvarla(kom), tip: 'para' },
      { ad: 'Net', deger: yuvarla(toplam - kom), tip: 'para' },
      { ad: 'İşlem', deger: liste.length, tip: 'sayi' },
    ],
    notlar: [
      'Kart çekimleri, çekildiği gün ve şubeye göre (açık hesap ve eski borç kart tahsilatları dahil).',
      'Valör (paranın hesaba geçeceği gün) için bankaların gün sayıları sistemde tanımlı değil; tanımlanınca bu rapora eklenecek.',
    ],
  };
}
