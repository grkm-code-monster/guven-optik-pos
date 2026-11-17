import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { loadOdooCategoryPaths, resolveItemKategori, type DashboardKategori } from '../reports/report.service';
import {
  GECERSIZ_SATIS,
  KATEGORI_ADI,
  ODEME_ADI,
  aralik,
  bankalar,
  buyuk,
  haftaBasi,
  kullanicilar,
  markaTahmin,
  oncekiDonem,
  sayi,
  subeFiltresi,
  subeler,
  trGun,
  trSaat,
  varyantMaliyetleri,
  yuvarla,
} from './ortak';
import type { CalistirmaBaglami, Filtre, Kolon, RaporSonuc, Satir } from './tipler';

// ───────────────────────── ortak: satış kalemlerini oku ─────────────────────────

export type Kalem = {
  id: string;
  saleId: string;
  referansNo: string | null;
  tarih: Date;
  subeId: string;
  personelId: string;
  musteriId: string;
  musteriAdi: string;
  musteriTel: string;
  kategori: DashboardKategori;
  marka: string;
  model: string;
  urun: string;
  barkod: string | null;
  lotNo: string | null;
  odooUrunId: number | null;
  adet: number;
  birimFiyat: number;
  brut: number;
  iskonto: number;
  ciro: number; // KDV dahil, ciro düzeltmesi düşülmüş
  kdv: number;
  durum: string;
  odemeTipleri: string[];
};

export async function kalemleriOku(gte: Date, lte: Date, f: Filtre): Promise<Kalem[]> {
  const subeIds = subeFiltresi(f);
  const saleWhere: Prisma.SaleWhereInput = {
    status: { notIn: [...GECERSIZ_SATIS] },
    createdAt: { gte, lte },
    ...(subeIds ? { branchId: { in: subeIds } } : {}),
    ...(f.personelId ? { userId: f.personelId } : {}),
    ...(f.musteriId ? { customerId: f.musteriId } : {}),
    ...(f.odemeTipi ? { payments: { some: { paymentType: f.odemeTipi as never } } } : {}),
  };
  const items = await prisma.saleItem.findMany({
    where: { status: { not: 'VOID' }, sale: saleWhere },
    select: {
      id: true,
      saleId: true,
      odooCategoryId: true,
      odooProductId: true,
      odooProductName: true,
      lotNo: true,
      qty: true,
      unitPrice: true,
      discount: true,
      taxAmount: true,
      lineTotal: true,
      status: true,
      product: { select: { category: true, name: true, brand: true, model: true, barcode: true } },
      sale: {
        select: {
          referansNo: true,
          createdAt: true,
          branchId: true,
          userId: true,
          customerId: true,
          customer: { select: { name: true, phone: true } },
          payments: { select: { paymentType: true, grossAmount: true } },
        },
      },
    },
  });

  const yollar = await loadOdooCategoryPaths(items.map((i) => i.odooCategoryId));

  // Ciro düzeltmesi satış bazında; kalemlere tutar payı oranında dağıtılır
  const satisToplam = new Map<string, number>();
  for (const i of items) satisToplam.set(i.saleId, (satisToplam.get(i.saleId) ?? 0) + sayi(i.lineTotal));

  const kategoriF = f.kategori ? String(f.kategori) : '';
  const markaF = f.marka ? buyuk(f.marka) : '';
  const araF = f.ara ? buyuk(f.ara) : '';

  const out: Kalem[] = [];
  for (const i of items) {
    const kategori = resolveItemKategori(i as never, yollar);
    if (kategoriF && kategori !== kategoriF) continue;
    const urun = i.odooProductName || i.product?.name || '';
    const marka = markaTahmin(i.product?.brand, urun);
    if (markaF && !marka.includes(markaF)) continue;
    const barkod = i.product?.barcode ?? null;
    if (araF && !buyuk(urun).includes(araF) && !buyuk(barkod).includes(araF) && !buyuk(i.lotNo).includes(araF)) continue;

    const duzeltme = i.sale.payments
      .filter((p) => p.paymentType === 'CIRO_DUZELTME')
      .reduce((a, p) => a + sayi(p.grossAmount), 0);
    const tt = satisToplam.get(i.saleId) ?? 0;
    const pay = tt > 0 ? sayi(i.lineTotal) / tt : 0;
    const adet = sayi(i.qty);
    const birim = sayi(i.unitPrice);

    out.push({
      id: i.id,
      saleId: i.saleId,
      referansNo: i.sale.referansNo,
      tarih: i.sale.createdAt,
      subeId: i.sale.branchId,
      personelId: i.sale.userId,
      musteriId: i.sale.customerId,
      musteriAdi: i.sale.customer?.name ?? '',
      musteriTel: i.sale.customer?.phone ?? '',
      kategori,
      marka,
      model: buyuk(i.product?.model) || '',
      urun,
      barkod,
      lotNo: i.lotNo,
      odooUrunId: i.odooProductId ? Number(i.odooProductId) : null,
      adet,
      birimFiyat: birim,
      brut: birim * adet,
      iskonto: sayi(i.discount),
      ciro: sayi(i.lineTotal) - duzeltme * pay,
      kdv: sayi(i.taxAmount),
      durum: i.status,
      odemeTipleri: [...new Set(i.sale.payments.map((p) => p.paymentType))],
    });
  }
  return out;
}

// ───────────────────────── Satış Özeti ─────────────────────────

export const SATIS_OZETI_GRUPLAMA = [
  { key: 'sube', label: 'Şube' },
  { key: 'personel', label: 'Personel' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'marka', label: 'Marka' },
  { key: 'model', label: 'Model' },
  { key: 'urun', label: 'Ürün' },
  { key: 'musteri', label: 'Müşteri' },
  { key: 'gun', label: 'Gün' },
  { key: 'hafta', label: 'Hafta' },
  { key: 'ay', label: 'Ay' },
];

type Toplam = { satis: Set<string>; adet: number; brut: number; iskonto: number; ciro: number; kdv: number; maliyet: number; maliyetsiz: number };
const yeniToplam = (): Toplam => ({ satis: new Set(), adet: 0, brut: 0, iskonto: 0, ciro: 0, kdv: 0, maliyet: 0, maliyetsiz: 0 });

async function grupAnahtari(gruplama: string, kalemler: Kalem[]) {
  const sb = await subeler();
  const pers = gruplama === 'personel' ? await kullanicilar(kalemler.map((k) => k.personelId)) : new Map<string, string>();
  return (k: Kalem): { key: string; ad: string } => {
    switch (gruplama) {
      case 'personel':
        return { key: k.personelId, ad: pers.get(k.personelId) ?? '(bilinmiyor)' };
      case 'kategori':
        return { key: k.kategori, ad: KATEGORI_ADI[k.kategori] };
      case 'marka':
        return { key: k.marka, ad: k.marka };
      case 'model': {
        const m = k.model || k.urun;
        return { key: `${k.marka}|${m}`, ad: k.model ? `${k.marka} ${k.model}` : m };
      }
      case 'urun':
        return { key: k.odooUrunId ? String(k.odooUrunId) : k.urun, ad: k.urun || '(adsız ürün)' };
      case 'musteri':
        return { key: k.musteriId, ad: k.musteriTel ? `${k.musteriAdi} · ${k.musteriTel}` : k.musteriAdi };
      case 'gun': {
        const g = trGun(k.tarih);
        return { key: g, ad: g };
      }
      case 'hafta': {
        const h = haftaBasi(trGun(k.tarih));
        return { key: h, ad: `${h} haftası` };
      }
      case 'ay': {
        const a = trGun(k.tarih).slice(0, 7);
        return { key: a, ad: a };
      }
      default: {
        const s = sb.get(k.subeId);
        return { key: k.subeId, ad: s ? `${s.kod} · ${s.ad}` : k.subeId };
      }
    }
  };
}

async function topla(kalemler: Kalem[], gruplama: string, maliyetIste: boolean) {
  const anahtar = await grupAnahtari(gruplama, kalemler);
  const maliyetler = maliyetIste
    ? await varyantMaliyetleri(kalemler.map((k) => k.odooUrunId ?? 0))
    : new Map<number, number>();
  const gruplar = new Map<string, { ad: string; t: Toplam }>();
  const genel = yeniToplam();
  for (const k of kalemler) {
    const a = anahtar(k);
    const g = gruplar.get(a.key) ?? { ad: a.ad, t: yeniToplam() };
    for (const t of [g.t, genel]) {
      t.satis.add(k.saleId);
      t.adet += k.adet;
      t.brut += k.brut;
      t.iskonto += k.iskonto;
      t.ciro += k.ciro;
      t.kdv += k.kdv;
      const m = k.odooUrunId ? maliyetler.get(k.odooUrunId) : undefined;
      if (m != null) t.maliyet += m * k.adet;
      else if (maliyetIste) t.maliyetsiz += k.ciro;
    }
    gruplar.set(a.key, g);
  }
  return { gruplar, genel };
}

export async function satisOzeti(f: Filtre, ctx: CalistirmaBaglami): Promise<RaporSonuc> {
  const r = aralik(f);
  const gruplama = f.gruplama || 'sube';
  const kalemler = await kalemleriOku(r.gte, r.lte, f);
  const { gruplar, genel } = await topla(kalemler, gruplama, ctx.maliyetGorur);

  let onceki = new Map<string, number>();
  let oncekiToplam = 0;
  const karsilastir = f.karsilastir === true && !['gun', 'hafta', 'ay'].includes(gruplama);
  if (karsilastir) {
    const od = oncekiDonem(r.bas, r.gunSayisi);
    const ok = await kalemleriOku(od.gte, od.lte, f);
    const sonuc = await topla(ok, gruplama, false);
    onceki = new Map([...sonuc.gruplar.entries()].map(([k, v]) => [k, v.t.ciro]));
    oncekiToplam = sonuc.genel.ciro;
  }

  const gl = SATIS_OZETI_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup';
  const kolonlar: Kolon[] = [
    { key: 'grup', label: gl, tip: 'metin' },
    { key: 'satis', label: 'Satış adedi', tip: 'sayi', toplam: true },
    { key: 'adet', label: 'Ürün adedi', tip: 'sayi', toplam: true },
    { key: 'brut', label: 'Liste tutarı', tip: 'para', toplam: true },
    { key: 'iskonto', label: 'İskonto', tip: 'para', toplam: true },
    { key: 'ciro', label: 'Ciro (KDV dahil)', tip: 'para', toplam: true },
    { key: 'kdvHaric', label: 'KDV hariç', tip: 'para', toplam: true },
    { key: 'pay', label: 'Pay', tip: 'yuzde' },
    { key: 'sepet', label: 'Ort. sepet', tip: 'para' },
  ];
  if (karsilastir) {
    kolonlar.push({ key: 'onceki', label: 'Önceki dönem', tip: 'para', toplam: true });
    kolonlar.push({ key: 'degisim', label: 'Değişim', tip: 'yuzde' });
  }
  kolonlar.push(
    { key: 'maliyet', label: 'Maliyet', tip: 'para', toplam: true, maliyet: true },
    { key: 'kar', label: 'Brüt kâr', tip: 'para', toplam: true, maliyet: true },
    { key: 'karOran', label: 'Kâr oranı', tip: 'yuzde', maliyet: true },
  );

  const zamanli = ['gun', 'hafta', 'ay'].includes(gruplama);
  const satirlar: Satir[] = [...gruplar.entries()]
    .map(([key, { ad, t }]) => {
      const kdvHaric = t.ciro - t.kdv;
      const o = onceki.get(key) ?? 0;
      return {
        _key: key,
        grup: ad,
        satis: t.satis.size,
        adet: t.adet,
        brut: yuvarla(t.brut),
        iskonto: yuvarla(t.iskonto),
        ciro: yuvarla(t.ciro),
        kdvHaric: yuvarla(kdvHaric),
        pay: genel.ciro ? yuvarla((t.ciro / genel.ciro) * 100, 1) : 0,
        sepet: t.satis.size ? yuvarla(t.ciro / t.satis.size) : 0,
        ...(karsilastir ? { onceki: yuvarla(o), degisim: o ? yuvarla(((t.ciro - o) / o) * 100, 1) : null } : {}),
        maliyet: yuvarla(t.maliyet),
        kar: yuvarla(kdvHaric - t.maliyet),
        karOran: kdvHaric ? yuvarla(((kdvHaric - t.maliyet) / kdvHaric) * 100, 1) : null,
      } as Satir;
    })
    .sort((a, b) => (zamanli ? String(a._key).localeCompare(String(b._key)) : sayi(b.ciro) - sayi(a.ciro)));
  for (const s of satirlar) delete s._key;

  const genelKdvHaric = genel.ciro - genel.kdv;
  const notlar: string[] = [
    'Ciro KDV dahildir ve satış tarihine göredir; ciro düzeltmeleri düşülmüştür. Taslak ve iptal satışlar dahil değildir.',
  ];
  if (ctx.maliyetGorur) {
    notlar.push('Maliyet, ürünün Odoo’daki güncel maliyetidir (satış anındaki değil). Kâr = KDV hariç ciro − maliyet.');
    if (genel.maliyetsiz > 0)
      notlar.push(`Maliyeti tanımlı olmayan ürünlerin cirosu: ${yuvarla(genel.maliyetsiz).toLocaleString('tr-TR')} TL — bu tutar kâra maliyetsiz eklenmiştir.`);
  }
  if (f.karsilastir && !karsilastir) notlar.push('Önceki dönem karşılaştırması gün/hafta/ay gruplamasında yapılmaz; Ciro raporunu kullanın.');

  return {
    kolonlar,
    satirlar,
    notlar,
    ozet: [
      { ad: 'Ciro', deger: yuvarla(genel.ciro), tip: 'para', alt: karsilastir && oncekiToplam ? `önceki dönem: %${yuvarla(((genel.ciro - oncekiToplam) / oncekiToplam) * 100, 1)}` : undefined },
      { ad: 'Satış adedi', deger: genel.satis.size, tip: 'sayi' },
      { ad: 'Ortalama sepet', deger: genel.satis.size ? yuvarla(genel.ciro / genel.satis.size) : 0, tip: 'para' },
      { ad: 'Ürün adedi', deger: genel.adet, tip: 'sayi' },
      { ad: 'Brüt kâr', deger: yuvarla(genelKdvHaric - genel.maliyet), tip: 'para', maliyet: true, alt: genelKdvHaric ? `kâr oranı %${yuvarla(((genelKdvHaric - genel.maliyet) / genelKdvHaric) * 100, 1)}` : undefined },
    ],
  };
}

// ───────────────────────── Ayrıntılı Satış ─────────────────────────

const KALEM_DURUM: Record<string, string> = {
  PENDING: 'Bekliyor',
  ORDERED: 'Sipariş verildi',
  IN_LAB: 'Atölyede',
  READY: 'Hazır',
  DELIVERED: 'Teslim edildi',
  VOID: 'İptal',
};

export async function ayrintiliSatis(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const kalemler = await kalemleriOku(r.gte, r.lte, f);
  const sb = await subeler();
  const pers = await kullanicilar(kalemler.map((k) => k.personelId));
  kalemler.sort((a, b) => b.tarih.getTime() - a.tarih.getTime());
  const satirlar: Satir[] = kalemler.map((k) => ({
    tarih: trSaat(k.tarih),
    fis: k.referansNo ?? k.saleId.slice(0, 8),
    sube: sb.get(k.subeId)?.kod ?? '',
    personel: pers.get(k.personelId) ?? '',
    musteri: k.musteriAdi,
    telefon: k.musteriTel,
    kategori: KATEGORI_ADI[k.kategori],
    urun: k.urun,
    barkod: k.barkod,
    karekod: k.lotNo,
    adet: k.adet,
    birim: yuvarla(k.birimFiyat),
    iskonto: yuvarla(k.iskonto),
    tutar: yuvarla(k.ciro),
    odeme: k.odemeTipleri.filter((t) => t !== 'CIRO_DUZELTME').map((t) => ODEME_ADI[t] ?? t).join(', '),
    durum: KALEM_DURUM[k.durum] ?? k.durum,
  }));
  return {
    kolonlar: [
      { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
      { key: 'fis', label: 'Fiş no', tip: 'metin' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'personel', label: 'Personel', tip: 'metin' },
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'telefon', label: 'Telefon', tip: 'metin' },
      { key: 'kategori', label: 'Kategori', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'barkod', label: 'Barkod', tip: 'metin' },
      { key: 'karekod', label: 'Karekod / lot', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
      { key: 'birim', label: 'Birim fiyat', tip: 'para' },
      { key: 'iskonto', label: 'İskonto', tip: 'para', toplam: true },
      { key: 'tutar', label: 'Tutar', tip: 'para', toplam: true },
      { key: 'odeme', label: 'Ödeme', tip: 'metin' },
      { key: 'durum', label: 'Durum', tip: 'metin' },
    ],
    satirlar,
    ozet: [
      { ad: 'Satır', deger: satirlar.length, tip: 'sayi' },
      { ad: 'Satış', deger: new Set(kalemler.map((k) => k.saleId)).size, tip: 'sayi' },
      { ad: 'Tutar', deger: yuvarla(kalemler.reduce((a, k) => a + k.ciro, 0)), tip: 'para' },
    ],
  };
}

// ───────────────────────── Ödeme Tipi Dağılımı ─────────────────────────

export const ODEME_GRUPLAMA = [
  { key: 'tip', label: 'Ödeme tipi' },
  { key: 'sube', label: 'Şube' },
  { key: 'banka', label: 'Banka ve taksit' },
  { key: 'personel', label: 'Personel' },
  { key: 'gun', label: 'Gün' },
];

export async function odemeTipiDagilimi(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'tip';
  const odemeler = await prisma.payment.findMany({
    where: {
      paymentType: f.odemeTipi ? (f.odemeTipi as never) : { not: 'CIRO_DUZELTME' },
      sale: {
        status: { notIn: [...GECERSIZ_SATIS] },
        createdAt: { gte: r.gte, lte: r.lte },
        ...(subeIds ? { branchId: { in: subeIds } } : {}),
        ...(f.personelId ? { userId: f.personelId } : {}),
      },
    },
    select: {
      saleId: true,
      paymentType: true,
      bankId: true,
      installment: true,
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
      sale: { select: { branchId: true, userId: true, createdAt: true } },
    },
  });
  const sb = await subeler();
  const bk = await bankalar();
  const pers = gruplama === 'personel' ? await kullanicilar(odemeler.map((o) => o.sale.userId)) : new Map<string, string>();
  const g = new Map<string, { ad: string; islem: number; satis: Set<string>; brut: number; kom: number; net: number }>();
  let genel = 0;
  for (const o of odemeler) {
    let key: string;
    let ad: string;
    switch (gruplama) {
      case 'sube': {
        const s = sb.get(o.sale.branchId);
        key = o.sale.branchId;
        ad = s ? `${s.kod} · ${s.ad}` : key;
        break;
      }
      case 'banka':
        if (o.paymentType !== 'CARD') {
          key = o.paymentType;
          ad = ODEME_ADI[o.paymentType] ?? o.paymentType;
        } else {
          key = `${o.bankId}|${o.installment ?? 1}`;
          ad = `${bk.get(o.bankId ?? '') ?? 'Banka yok'} · ${(o.installment ?? 1) > 1 ? `${o.installment} taksit` : 'tek çekim'}`;
        }
        break;
      case 'personel':
        key = o.sale.userId;
        ad = pers.get(o.sale.userId) ?? '(bilinmiyor)';
        break;
      case 'gun':
        key = trGun(o.sale.createdAt);
        ad = key;
        break;
      default:
        key = o.paymentType;
        ad = ODEME_ADI[o.paymentType] ?? o.paymentType;
    }
    const x = g.get(key) ?? { ad, islem: 0, satis: new Set<string>(), brut: 0, kom: 0, net: 0 };
    x.islem++;
    x.satis.add(o.saleId);
    x.brut += sayi(o.grossAmount);
    x.kom += sayi(o.commissionAmount);
    x.net += sayi(o.netAmount);
    g.set(key, x);
    genel += sayi(o.grossAmount);
  }
  const satirlar: Satir[] = [...g.entries()]
    .map(([key, x]) => ({
      _k: key,
      grup: x.ad,
      islem: x.islem,
      satis: x.satis.size,
      brut: yuvarla(x.brut),
      komisyon: yuvarla(x.kom),
      net: yuvarla(x.net),
      pay: genel ? yuvarla((x.brut / genel) * 100, 1) : 0,
    }))
    .sort((a, b) => (gruplama === 'gun' ? a._k.localeCompare(b._k) : b.brut - a.brut))
    .map(({ _k, ...s }) => s);
  return {
    kolonlar: [
      { key: 'grup', label: ODEME_GRUPLAMA.find((x) => x.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'islem', label: 'İşlem', tip: 'sayi', toplam: true },
      { key: 'satis', label: 'Satış', tip: 'sayi' },
      { key: 'brut', label: 'Tutar', tip: 'para', toplam: true },
      { key: 'komisyon', label: 'Komisyon', tip: 'para', toplam: true },
      { key: 'net', label: 'Net', tip: 'para', toplam: true },
      { key: 'pay', label: 'Pay', tip: 'yuzde' },
    ],
    satirlar,
    notlar: [
      'Seçilen tarihlerdeki SATIŞLARIN ödemeleri (sonradan yapılan açık hesap tahsilatları da o satışın altında). Kasaya giren paranın tahsilat gününe göre dökümü için “Tahsilat Dağılımı” raporunu kullanın.',
    ],
  };
}

// ───────────────────────── Eski Satışlar (Siber arşivi) ─────────────────────────

export async function eskiSatislar(f: Filtre): Promise<RaporSonuc> {
  const ara = (f.ara ?? '').trim();
  const tarihVar = Boolean(f.bas || f.bit);
  if (!ara && !tarihVar) {
    return {
      kolonlar: [{ key: 'bilgi', label: 'Bilgi', tip: 'metin' }],
      satirlar: [{ bilgi: 'Müşteri adı, telefonu, TC no veya ürün adı yazın ya da bir tarih aralığı seçin.' }],
    };
  }
  const where: Prisma.LegacySaleWhereInput = {};
  if (tarihVar) {
    const r = aralik(f);
    where.tarih = { gte: r.gte, lte: r.lte };
  }
  if (ara) {
    const kelime = ara;
    where.OR = [
      { customer: { ad: { contains: kelime, mode: 'insensitive' } } },
      { customer: { soyad: { contains: kelime, mode: 'insensitive' } } },
      { customer: { telefon1: { contains: kelime } } },
      { customer: { cepTelefon: { contains: kelime } } },
      { customer: { tcKimlikNo: { contains: kelime } } },
      { items: { some: { urunAdi: { contains: kelime, mode: 'insensitive' } } } },
    ];
  }
  const satislar = await prisma.legacySale.findMany({
    where,
    take: 3000,
    orderBy: { tarih: 'desc' },
    include: { customer: true, items: true },
  });
  const satirlar: Satir[] = [];
  for (const s of satislar) {
    const musteri = [s.customer?.ad, s.customer?.soyad].filter(Boolean).join(' ');
    const tel = s.customer?.cepTelefon || s.customer?.telefon1 || '';
    const kalemler = s.items.length ? s.items : [null];
    for (const k of kalemler) {
      satirlar.push({
        tarih: s.tarih ? trGun(s.tarih) : '',
        sube: s.subeKodu ?? s.customer?.kaynakSube ?? '',
        musteri,
        telefon: tel,
        urun: k?.urunAdi ?? '',
        adet: k ? sayi(k.miktar) : null,
        fiyat: k ? yuvarla(sayi(k.fiyat)) : null,
        satisToplam: yuvarla(sayi(s.toplamTutar)),
      });
    }
  }
  return {
    kolonlar: [
      { key: 'tarih', label: 'Tarih', tip: 'tarih' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'telefon', label: 'Telefon', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
      { key: 'fiyat', label: 'Fiyat', tip: 'para', toplam: true },
      { key: 'satisToplam', label: 'Satış toplamı', tip: 'para' },
    ],
    satirlar,
    notlar: ['Siber Optik’ten aktarılan eski satışlardır (yeni sisteme geçiş öncesi).'],
    kesildi: satislar.length >= 3000,
  };
}
