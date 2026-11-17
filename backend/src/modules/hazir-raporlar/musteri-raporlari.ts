import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { GECERSIZ_SATIS, GUN_MS, ODEME_ADI, aralik, buyuk, sayi, subeFiltresi, subeler, trGun, trSaat, yuvarla } from './ortak';
import { RaporHatasi, type Filtre, type RaporSonuc, type Satir } from './tipler';

/** Satış detayındaki açık hesap kalanıyla aynı hesap (sale.service acikHesapKalan) */
function acikHesapDurumu(pays: { paymentType: string; grossAmount: unknown; createdAt: Date }[]) {
  const acik = pays.filter((p) => p.paymentType === 'OPEN_ACCOUNT');
  const toplam = acik.reduce((a, p) => a + sayi(p.grossAmount), 0);
  if (!toplam) return { toplam: 0, odenen: 0, kalan: 0, sonOdeme: null as Date | null, ilk: null as Date | null };
  const ilk = Math.min(...acik.map((p) => p.createdAt.getTime()));
  const sonra = pays.filter((p) => p.paymentType !== 'OPEN_ACCOUNT' && p.createdAt.getTime() > ilk);
  const odenen = sonra.reduce((a, p) => a + sayi(p.grossAmount), 0);
  const sonOdeme = sonra.length ? new Date(Math.max(...sonra.map((p) => p.createdAt.getTime()))) : null;
  return { toplam, odenen, kalan: Math.max(0, yuvarla(toplam - odenen)), sonOdeme, ilk: new Date(ilk) };
}

// ───────────────────────── Açık Hesap Kalan ─────────────────────────

export const ACIK_HESAP_GRUPLAMA = [
  { key: 'satis', label: 'Satış bazında' },
  { key: 'musteri', label: 'Müşteri bazında' },
  { key: 'sube', label: 'Şube bazında' },
];

export async function acikHesapKalan(f: Filtre): Promise<RaporSonuc> {
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'satis';
  const enAz = sayi(f.enAz) > 0 ? sayi(f.enAz) : 0.01;
  const satislar = await prisma.sale.findMany({
    where: {
      status: { notIn: [...GECERSIZ_SATIS] },
      payments: { some: { paymentType: 'OPEN_ACCOUNT' } },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
      ...(f.ara
        ? { customer: { OR: [{ name: { contains: f.ara, mode: 'insensitive' } }, { phone: { contains: f.ara } }] } }
        : {}),
    },
    select: {
      id: true,
      referansNo: true,
      createdAt: true,
      branchId: true,
      netTotal: true,
      customerId: true,
      customer: { select: { name: true, phone: true } },
      payments: { select: { paymentType: true, grossAmount: true, createdAt: true } },
    },
  });
  const sb = await subeler();
  const simdi = Date.now();
  type R = { satisId: string; fis: string; tarih: Date; subeId: string; musteriId: string; musteri: string; tel: string; satis: number; acik: number; odenen: number; kalan: number; son: Date | null };
  const liste: R[] = [];
  for (const s of satislar) {
    const d = acikHesapDurumu(s.payments);
    if (d.kalan < enAz) continue;
    liste.push({
      satisId: s.id,
      fis: s.referansNo ?? s.id.slice(0, 8),
      tarih: s.createdAt,
      subeId: s.branchId,
      musteriId: s.customerId,
      musteri: s.customer?.name ?? '',
      tel: s.customer?.phone ?? '',
      satis: sayi(s.netTotal),
      acik: d.toplam,
      odenen: d.odenen,
      kalan: d.kalan,
      son: d.sonOdeme,
    });
  }
  const gun = (x: R) => Math.floor((simdi - (x.son ?? x.tarih).getTime()) / GUN_MS);
  const toplamKalan = liste.reduce((a, x) => a + x.kalan, 0);
  const ozet = [
    { ad: 'Toplam kalan', deger: yuvarla(toplamKalan), tip: 'para' as const },
    { ad: 'Müşteri', deger: new Set(liste.map((x) => x.musteriId)).size, tip: 'sayi' as const },
    { ad: 'Satış', deger: liste.length, tip: 'sayi' as const },
    { ad: '90 günü geçen', deger: yuvarla(liste.filter((x) => gun(x) > 90).reduce((a, x) => a + x.kalan, 0)), tip: 'para' as const },
  ];
  const notlar = ['Kalan = açık hesaba yazılan tutar − sonradan yapılan ödemeler (satış ekranındaki hesapla aynı). Gün: son ödemeden (yoksa satıştan) bu yana.'];

  if (gruplama === 'satis') {
    liste.sort((a, b) => gun(b) - gun(a));
    return {
      kolonlar: [
        { key: 'musteri', label: 'Müşteri', tip: 'metin' },
        { key: 'telefon', label: 'Telefon', tip: 'metin' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'tarih', label: 'Satış tarihi', tip: 'tarih' },
        { key: 'fis', label: 'Fiş no', tip: 'metin' },
        { key: 'satis', label: 'Satış', tip: 'para', toplam: true },
        { key: 'acik', label: 'Açık hesap', tip: 'para', toplam: true },
        { key: 'odenen', label: 'Ödenen', tip: 'para', toplam: true },
        { key: 'kalan', label: 'Kalan', tip: 'para', toplam: true },
        { key: 'son', label: 'Son ödeme', tip: 'tarih' },
        { key: 'gun', label: 'Gün', tip: 'sayi' },
      ],
      satirlar: liste.map((x) => ({
        musteri: x.musteri,
        telefon: x.tel,
        sube: sb.get(x.subeId)?.kod ?? '',
        tarih: trGun(x.tarih),
        fis: x.fis,
        satis: yuvarla(x.satis),
        acik: yuvarla(x.acik),
        odenen: yuvarla(x.odenen),
        kalan: yuvarla(x.kalan),
        son: x.son ? trGun(x.son) : '',
        gun: gun(x),
        _musteriId: x.musteriId,
      })),
      ozet,
      notlar,
    };
  }
  const m = new Map<string, { ad: string; tel: string; satis: number; kalan: number; enEski: number; son: Date | null }>();
  for (const x of liste) {
    const k = gruplama === 'sube' ? x.subeId : x.musteriId;
    const s = sb.get(x.subeId);
    const ad = gruplama === 'sube' ? (s ? `${s.kod} · ${s.ad}` : x.subeId) : x.musteri;
    const o = m.get(k) ?? { ad, tel: x.tel, satis: 0, kalan: 0, enEski: 0, son: null };
    o.satis++;
    o.kalan += x.kalan;
    o.enEski = Math.max(o.enEski, gun(x));
    if (x.son && (!o.son || x.son > o.son)) o.son = x.son;
    m.set(k, o);
  }
  return {
    kolonlar: [
      { key: 'grup', label: gruplama === 'sube' ? 'Şube' : 'Müşteri', tip: 'metin' },
      ...(gruplama === 'musteri' ? [{ key: 'telefon', label: 'Telefon', tip: 'metin' as const }] : []),
      { key: 'satis', label: 'Satış sayısı', tip: 'sayi', toplam: true },
      { key: 'kalan', label: 'Kalan', tip: 'para', toplam: true },
      { key: 'son', label: 'Son ödeme', tip: 'tarih' },
      { key: 'enEski', label: 'En eski (gün)', tip: 'sayi' },
    ],
    satirlar: [...m.entries()]
      .sort((a, b) => b[1].kalan - a[1].kalan)
      .map(([k, x]) => ({
        grup: x.ad,
        ...(gruplama === 'musteri' ? { telefon: x.tel, _musteriId: k } : {}),
        satis: x.satis,
        kalan: yuvarla(x.kalan),
        son: x.son ? trGun(x.son) : '',
        enEski: x.enEski,
      })),
    ozet,
    notlar,
  };
}

// ───────────────────────── Müşteri Ekstresi ─────────────────────────

export async function musteriEkstresi(f: Filtre): Promise<RaporSonuc> {
  if (!f.musteriId) throw new RaporHatasi('Önce müşteriyi seçin.');
  const musteri = await prisma.customer.findUnique({ where: { id: f.musteriId }, select: { name: true, phone: true } });
  if (!musteri) throw new RaporHatasi('Müşteri bulunamadı.');
  const satislar = await prisma.sale.findMany({
    where: { customerId: f.musteriId, status: { notIn: [...GECERSIZ_SATIS] } },
    select: {
      id: true,
      referansNo: true,
      createdAt: true,
      branchId: true,
      netTotal: true,
      items: { where: { status: { not: 'VOID' } }, select: { odooProductName: true, product: { select: { name: true } } } },
      payments: { select: { paymentType: true, grossAmount: true, createdAt: true, aciklama: true } },
    },
  });
  const manuel = await prisma.manuelTahsilat.findMany({ where: { customerId: f.musteriId } });
  const sb = await subeler();
  type H = { t: Date; tur: string; aciklama: string; sube: string; borc: number; alacak: number };
  const h: H[] = [];
  for (const s of satislar) {
    const urunler = s.items.map((i) => i.odooProductName || i.product?.name || '').filter(Boolean);
    h.push({
      t: s.createdAt,
      tur: 'Satış',
      aciklama: `Fiş ${s.referansNo ?? s.id.slice(0, 8)} · ${urunler.slice(0, 3).join(', ')}${urunler.length > 3 ? ` +${urunler.length - 3}` : ''}`,
      sube: sb.get(s.branchId)?.kod ?? '',
      borc: sayi(s.netTotal),
      alacak: 0,
    });
    for (const p of s.payments) {
      if (p.paymentType === 'OPEN_ACCOUNT') continue;
      h.push({
        t: p.createdAt,
        tur: p.paymentType === 'CIRO_DUZELTME' ? 'İndirim (ciro düzeltme)' : `Ödeme · ${ODEME_ADI[p.paymentType] ?? p.paymentType}`,
        aciklama: [`Fiş ${s.referansNo ?? s.id.slice(0, 8)}`, p.aciklama ?? ''].filter(Boolean).join(' · '),
        sube: sb.get(s.branchId)?.kod ?? '',
        borc: 0,
        alacak: sayi(p.grossAmount),
      });
    }
  }
  for (const m of manuel) {
    h.push({
      t: m.createdAt,
      tur: `Eski borç tahsilatı · ${ODEME_ADI[m.odemeTuru] ?? m.odemeTuru}`,
      aciklama: m.aciklama ?? '',
      sube: sb.get(m.branchId)?.kod ?? '',
      borc: 0,
      alacak: sayi(m.tutar),
    });
  }
  h.sort((a, b) => a.t.getTime() - b.t.getTime() || (a.borc ? -1 : 1));
  let bakiye = 0;
  const satirlar: Satir[] = h.map((x) => {
    bakiye += x.borc - x.alacak;
    return {
      tarih: trSaat(x.t),
      tur: x.tur,
      aciklama: x.aciklama,
      sube: x.sube,
      borc: x.borc ? yuvarla(x.borc) : null,
      alacak: x.alacak ? yuvarla(x.alacak) : null,
      bakiye: yuvarla(bakiye),
    };
  });
  const borc = h.reduce((a, x) => a + x.borc, 0);
  const alacak = h.reduce((a, x) => a + x.alacak, 0);
  return {
    kolonlar: [
      { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
      { key: 'tur', label: 'İşlem', tip: 'metin' },
      { key: 'aciklama', label: 'Açıklama', tip: 'metin' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'borc', label: 'Borç', tip: 'para', toplam: true },
      { key: 'alacak', label: 'Ödeme', tip: 'para', toplam: true },
      { key: 'bakiye', label: 'Bakiye', tip: 'para' },
    ],
    satirlar,
    ozet: [
      { ad: musteri.name, deger: musteri.phone ?? '', tip: 'metin' },
      { ad: 'Toplam alışveriş', deger: yuvarla(borc), tip: 'para' },
      { ad: 'Toplam ödeme', deger: yuvarla(alacak), tip: 'para' },
      { ad: 'Bakiye', deger: yuvarla(borc - alacak), tip: 'para', alt: borc - alacak > 0.009 ? 'müşterinin borcu' : 'borç yok' },
    ],
    notlar: ['Satış tutarı borç, alınan her ödeme (nakit, kart, havale, SGK/Vakıf katkısı, indirim) alacak yazılır. Açık hesaba yazılan kısım ödenene kadar bakiyede kalır.'],
  };
}

// ───────────────────────── Müşteri Listesi ─────────────────────────

export async function musteriListesi(f: Filtre): Promise<RaporSonuc> {
  const subeIds = subeFiltresi(f);
  const tarihVar = Boolean(f.bas || f.bit);
  const r = tarihVar ? aralik(f) : null;
  const where: Prisma.SaleWhereInput = {
    status: { notIn: [...GECERSIZ_SATIS] },
    ...(subeIds ? { branchId: { in: subeIds } } : {}),
    ...(r ? { createdAt: { gte: r.gte, lte: r.lte } } : {}),
  };
  const gruplar = await prisma.sale.groupBy({
    by: ['customerId'],
    where,
    _count: { _all: true },
    _sum: { netTotal: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });
  const enAz = sayi(f.enAz);
  const secili = gruplar.filter((g) => sayi(g._sum.netTotal) >= enAz);
  const ara = buyuk(f.ara);
  const musteriler = new Map<string, { name: string; phone: string; birthDate: Date | null; il: string | null; ilce: string | null }>();
  for (let i = 0; i < secili.length; i += 5000) {
    const p = secili.slice(i, i + 5000).map((g) => g.customerId);
    const rows = await prisma.customer.findMany({
      where: { id: { in: p } },
      select: { id: true, name: true, phone: true, birthDate: true, il: true, ilce: true },
    });
    for (const c of rows) musteriler.set(c.id, c);
  }
  // Son alışverişin şubesi
  const sonSube = new Map<string, string>();
  const sonlar = await prisma.sale.findMany({
    where: { ...where, customerId: { in: secili.map((g) => g.customerId) } },
    select: { customerId: true, branchId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const s of sonlar) sonSube.set(s.customerId, s.branchId);
  const sb = await subeler();
  const satirlar: Satir[] = [];
  for (const g of secili) {
    const c = musteriler.get(g.customerId);
    if (!c) continue;
    if (ara && !buyuk(c.name).includes(ara) && !String(c.phone ?? '').includes(f.ara ?? '')) continue;
    satirlar.push({
      musteri: c.name,
      telefon: c.phone,
      dogum: c.birthDate ? trGun(c.birthDate) : '',
      yer: [c.il, c.ilce].filter(Boolean).join(' / '),
      satis: g._count._all,
      harcama: yuvarla(sayi(g._sum.netTotal)),
      ilk: g._min.createdAt ? trGun(g._min.createdAt) : '',
      son: g._max.createdAt ? trGun(g._max.createdAt) : '',
      sube: sb.get(sonSube.get(g.customerId) ?? '')?.kod ?? '',
      _musteriId: g.customerId,
    });
  }
  satirlar.sort((a, b) => sayi(b.harcama) - sayi(a.harcama));
  return {
    kolonlar: [
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'telefon', label: 'Telefon', tip: 'metin' },
      { key: 'dogum', label: 'Doğum tarihi', tip: 'tarih' },
      { key: 'yer', label: 'İl / ilçe', tip: 'metin' },
      { key: 'satis', label: 'Satış sayısı', tip: 'sayi', toplam: true },
      { key: 'harcama', label: 'Toplam harcama', tip: 'para', toplam: true },
      { key: 'ilk', label: 'İlk alışveriş', tip: 'tarih' },
      { key: 'son', label: 'Son alışveriş', tip: 'tarih' },
      { key: 'sube', label: 'Son şube', tip: 'metin' },
    ],
    satirlar,
    ozet: [
      { ad: 'Müşteri', deger: satirlar.length, tip: 'sayi' },
      { ad: 'Toplam harcama', deger: yuvarla(satirlar.reduce((a, s) => a + sayi(s.harcama), 0)), tip: 'para' },
    ],
    notlar: [
      'Yeni sistemde alışverişi olan müşteriler. Tarih seçilirse yalnızca o dönemde alışveriş yapanlar ve o dönemdeki harcamaları gelir.',
    ],
  };
}

// ───────────────────────── Cam Sipariş Raporu ─────────────────────────

export const SIPARIS_DURUMLARI = [
  { key: 'ACIK', label: 'Açık olanlar (teslim edilmemiş)' },
  { key: 'BEKLIYOR', label: 'Bekliyor' },
  { key: 'GONDERILDI', label: 'Tedarikçiye gönderildi' },
  { key: 'URETIMDE', label: 'Üretimde' },
  { key: 'KARGODA', label: 'Kargoda' },
  { key: 'TESLIM_ALINDI', label: 'Depoya geldi' },
  { key: 'LABORATUVARDA', label: 'Laboratuvarda' },
  { key: 'HAZIR', label: 'Hazır' },
  { key: 'TESLIM_EDILDI', label: 'Müşteriye teslim edildi' },
  { key: 'IPTAL', label: 'İptal' },
];
const KAPALI = ['TESLIM_EDILDI', 'IPTAL'];

export async function camSiparisRaporu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const durum = f.durum || 'ACIK';
  const where: Prisma.OzelSiparisWhereInput = {
    createdAt: { gte: r.gte, lte: r.lte },
    ...(subeIds ? { subeId: { in: subeIds } } : {}),
    ...(durum === 'ACIK' ? { durum: { notIn: KAPALI } } : { durum }),
    ...(f.ara
      ? {
          OR: [
            { musteriAdi: { contains: f.ara, mode: 'insensitive' } },
            { urunAdi: { contains: f.ara, mode: 'insensitive' } },
            { tedarikciAdi: { contains: f.ara, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const liste = await prisma.ozelSiparis.findMany({ where, orderBy: { createdAt: 'asc' }, take: 5000 });
  const sb = await subeler();
  const simdi = Date.now();
  const etiket = new Map(SIPARIS_DURUMLARI.map((d) => [d.key, d.label]));
  let geciken = 0;
  const satirlar: Satir[] = liste.map((s) => {
    const bitis = s.teslimTarihi ?? (KAPALI.includes(s.durum) ? s.updatedAt : new Date(simdi));
    const gun = Math.floor((bitis.getTime() - s.createdAt.getTime()) / GUN_MS);
    const gec = !KAPALI.includes(s.durum) && !s.gercekGelisTarihi && s.tahminiGelisTarihi && s.tahminiGelisTarihi.getTime() < simdi;
    if (gec) geciken++;
    return {
      tarih: trGun(s.createdAt),
      musteri: s.musteriAdi,
      telefon: s.musteriTelefon ?? '',
      sube: (s.subeId && sb.get(s.subeId)?.kod) || s.subeAdi || '',
      urun: s.urunAdi,
      tip: s.tip === 'RECETELI' ? 'Reçeteli' : 'Standart',
      tedarikci: s.tedarikciAdi ?? '',
      siparisNo: s.tedarikciSiparisNo ?? '',
      durum: etiket.get(s.durum) ?? s.durum,
      tahmini: s.tahminiGelisTarihi ? trGun(s.tahminiGelisTarihi) : '',
      geldi: s.gercekGelisTarihi ? trGun(s.gercekGelisTarihi) : '',
      gun,
      gecikme: gec ? 'GECİKTİ' : '',
    };
  });
  satirlar.sort((a, b) => sayi(b.gun) - sayi(a.gun));
  return {
    kolonlar: [
      { key: 'tarih', label: 'Sipariş tarihi', tip: 'tarih' },
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'telefon', label: 'Telefon', tip: 'metin' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'tip', label: 'Tip', tip: 'metin' },
      { key: 'tedarikci', label: 'Tedarikçi', tip: 'metin' },
      { key: 'siparisNo', label: 'Tedarikçi sipariş no', tip: 'metin' },
      { key: 'durum', label: 'Durum', tip: 'metin' },
      { key: 'tahmini', label: 'Tahmini geliş', tip: 'tarih' },
      { key: 'geldi', label: 'Geldiği gün', tip: 'tarih' },
      { key: 'gun', label: 'Gün', tip: 'sayi' },
      { key: 'gecikme', label: 'Gecikme', tip: 'metin' },
    ],
    satirlar,
    ozet: [
      { ad: 'Sipariş', deger: satirlar.length, tip: 'sayi' },
      { ad: 'Geciken', deger: geciken, tip: 'sayi' },
      { ad: 'Ortalama bekleme (gün)', deger: satirlar.length ? yuvarla(satirlar.reduce((a, s) => a + sayi(s.gun), 0) / satirlar.length, 1) : 0, tip: 'sayi' },
    ],
    notlar: ['Gün: siparişten teslime (teslim edilmediyse bugüne) kadar geçen süre. Tarih filtresi sipariş tarihine uygulanır.'],
  };
}
