/**
 * 17.11.2026 — Hazır Raporlar Faz 2: Bir Tarihteki Envanter, Satılan/Kalan, Devir Hızı ve
 * Yaşlandırma, Stok Seviye, Karekod Hareketleri, ÜTS Bildirim Durumu, Alış Özeti, Ayrıntılı Alış.
 */
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { minMaxDegerlendir } from '../admin/stok-seviye.service';
import {
  GECERSIZ_SATIS,
  GUN_MS,
  KATEGORI_ADI,
  LOKASYON_KODU,
  ODOO_CTX,
  STOK_LOKASYONLARI,
  aralik,
  bugunTr,
  gunSonu,
  m2oAd,
  m2oId,
  odooParcaOku,
  sayi,
  subeFiltresi,
  subeler,
  trGun,
  trSaat,
  varyantMaliyetleri,
  yuvarla,
} from './ortak';
import { KULLANIM_TUR, fotograf, lokasyonSecimi, stokNotu, urunFiltresi, urunleriOku, type Urun } from './stok-raporlari';
import { RaporHatasi, type CalistirmaBaglami, type Filtre, type RaporSonuc, type Satir } from './tipler';

const odooZaman = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

/** Şube kodu (Branch.code) → stok lokasyon kodu aynı yazılıyor (GVN2 = GVN2) */
async function subeKodlari(): Promise<Map<string, string>> {
  const sb = await subeler();
  return new Map([...sb.entries()].map(([id, s]) => [id, s.kod]));
}

/** Ortak gruplama anahtarı (stok raporları) */
function stokAnahtar(gruplama: string, u: Urun, lok: string): { k: string; ad: string } {
  switch (gruplama) {
    case 'kategori':
      return { k: u.kategori, ad: KATEGORI_ADI[u.kategori] };
    case 'marka':
      return { k: u.marka, ad: u.marka };
    case 'sablon':
      return { k: String(u.tmplId ?? u.id), ad: u.tmplAd || u.ad };
    case 'urun':
      return { k: String(u.id), ad: u.ad };
    default:
      return { k: lok, ad: lok };
  }
}

// ───────────────────────── Bir Tarihteki Envanter ─────────────────────────

export const TARIHLI_ENVANTER_GRUPLAMA = [
  { key: 'lokasyon', label: 'Lokasyon' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'marka', label: 'Marka' },
  { key: 'sablon', label: 'Ürün (şablon)' },
  { key: 'urun', label: 'Ürün (varyant)' },
];

export async function birTarihtekiEnvanter(f: Filtre, ctx: CalistirmaBaglami): Promise<RaporSonuc> {
  const gun = f.bit && /^\d{4}-\d{2}-\d{2}$/.test(f.bit) ? f.bit : bugunTr();
  const bugun = bugunTr();
  if (gun > bugun) throw new RaporHatasi('Gelecek bir tarih seçilemez.');
  const enEski = new Date(Date.now() - 2 * 366 * GUN_MS);
  if (new Date(`${gun}T00:00:00+03:00`) < enEski) throw new RaporHatasi('En fazla 2 yıl geriye gidilebilir.');
  const fo = await fotograf();
  const loklar = lokasyonSecimi(f);
  const lokIds = loklar.map((l) => STOK_LOKASYONLARI[l]);
  const secim = new Set(lokIds);
  // Bugünkü stok
  const miktar = new Map<string, number>(); // `${urunId}|${lok}`
  for (const q of fo.quantlar) {
    if (!loklar.includes(q.lok)) continue;
    const k = `${q.urunId}|${q.lok}`;
    miktar.set(k, (miktar.get(k) ?? 0) + q.adet);
  }
  // Seçilen günden SONRAKİ hareketleri geri al
  let hareketSayisi = 0;
  if (gun < bugun) {
    const satirlar = (await execute('stock.move.line', 'search_read', [[
      ['state', '=', 'done'],
      ['date', '>', odooZaman(gunSonu(gun))],
      '|',
      ['location_id', 'in', lokIds],
      ['location_dest_id', 'in', lokIds],
    ]], { fields: ['product_id', 'quantity', 'location_id', 'location_dest_id'], limit: 400000, ...ODOO_CTX })) as {
      product_id: unknown;
      quantity: number;
      location_id: unknown;
      location_dest_id: unknown;
    }[];
    hareketSayisi = satirlar.length;
    for (const x of satirlar) {
      const pid = m2oId(x.product_id);
      if (!pid) continue;
      const kaynak = m2oId(x.location_id);
      const hedef = m2oId(x.location_dest_id);
      const adet = sayi(x.quantity);
      if (hedef != null && secim.has(hedef)) {
        const k = `${pid}|${LOKASYON_KODU.get(hedef)}`;
        miktar.set(k, (miktar.get(k) ?? 0) - adet);
      }
      if (kaynak != null && secim.has(kaynak)) {
        const k = `${pid}|${LOKASYON_KODU.get(kaynak)}`;
        miktar.set(k, (miktar.get(k) ?? 0) + adet);
      }
    }
  }
  const pidler = [...new Set([...miktar.keys()].map((k) => Number(k.split('|')[0])))];
  const eksik = pidler.filter((id) => !fo.urunler.has(id));
  const ek = eksik.length ? await urunleriOku(eksik) : new Map<number, Urun>();
  const urun = (id: number) => fo.urunler.get(id) ?? ek.get(id);
  const uygun = urunFiltresi(f);
  const maliyet = ctx.maliyetGorur ? await varyantMaliyetleri(pidler) : new Map<number, number>();
  const gruplama = f.gruplama || 'lokasyon';
  const m = new Map<string, { ad: string; adet: number; satis: number; maliyet: number; cesit: Set<number> }>();
  for (const [k, adet] of miktar) {
    if (Math.abs(adet) < 1e-9) continue;
    const [pidS, lok] = k.split('|');
    const pid = Number(pidS);
    const u = urun(pid);
    if (!u || !uygun(u)) continue;
    const a = stokAnahtar(gruplama, u, lok);
    const o = m.get(a.k) ?? { ad: a.ad, adet: 0, satis: 0, maliyet: 0, cesit: new Set<number>() };
    o.adet += adet;
    o.satis += u.fiyat * adet;
    o.maliyet += (maliyet.get(pid) ?? 0) * adet;
    o.cesit.add(pid);
    m.set(a.k, o);
  }
  const satirlar: Satir[] = [...m.values()]
    .filter((x) => Math.abs(x.adet) > 1e-9)
    .sort((a, b) => b.adet - a.adet)
    .map((x) => ({ grup: x.ad, adet: yuvarla(x.adet, 2), cesit: x.cesit.size, satisDegeri: yuvarla(x.satis), maliyet: yuvarla(x.maliyet) }));
  const top = (k: 'adet' | 'satis' | 'maliyet') => [...m.values()].reduce((a, x) => a + x[k], 0);
  return {
    kolonlar: [
      { key: 'grup', label: TARIHLI_ENVANTER_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
      { key: 'cesit', label: 'Çeşit', tip: 'sayi' },
      { key: 'satisDegeri', label: 'Satış değeri', tip: 'para', toplam: true },
      { key: 'maliyet', label: 'Maliyet değeri', tip: 'para', toplam: true, maliyet: true },
    ],
    satirlar,
    ozet: [
      { ad: `${gun} gün sonu adet`, deger: yuvarla(top('adet'), 2), tip: 'sayi' },
      { ad: 'Satış değeri', deger: yuvarla(top('satis')), tip: 'para' },
      { ad: 'Maliyet değeri', deger: yuvarla(top('maliyet')), tip: 'para', maliyet: true },
    ],
    notlar: [
      `Seçilen günün (${gun}) sonundaki stok: bugünkü stoktan, o günden sonraki ${hareketSayisi.toLocaleString('tr-TR')} hareket geri alınarak hesaplandı.`,
      'Değerler bugünkü satış fiyatı ve bugünkü maliyetle hesaplanır. Tarih olarak “bitiş” günü kullanılır.',
    ],
  };
}

// ───────────────────────── POS satışları (ürün bazında) ─────────────────────────

async function posSatislari(gte: Date, lte: Date, lokasyonlar?: string[]): Promise<Map<number, { adet: number; son: Date }>> {
  const kod = await subeKodlari();
  const kalemler = await prisma.saleItem.findMany({
    where: { status: { not: 'VOID' }, odooProductId: { not: null }, sale: { status: { notIn: [...GECERSIZ_SATIS] }, createdAt: { gte, lte } } },
    select: { odooProductId: true, qty: true, sale: { select: { createdAt: true, branchId: true } } },
  });
  const secim = lokasyonlar?.length ? new Set(lokasyonlar) : null;
  const out = new Map<number, { adet: number; son: Date }>();
  for (const k of kalemler) {
    if (secim && !secim.has(kod.get(k.sale.branchId) ?? '')) continue;
    const id = Number(k.odooProductId);
    if (!Number.isFinite(id)) continue;
    const o = out.get(id) ?? { adet: 0, son: k.sale.createdAt };
    o.adet += sayi(k.qty);
    if (k.sale.createdAt > o.son) o.son = k.sale.createdAt;
    out.set(id, o);
  }
  return out;
}

// ───────────────────────── Satılan / Kalan ─────────────────────────

export const SATILAN_GRUPLAMA = [
  { key: 'marka', label: 'Marka' },
  { key: 'sablon', label: 'Ürün (şablon)' },
  { key: 'urun', label: 'Ürün (varyant)' },
  { key: 'kategori', label: 'Kategori' },
];

export async function satilanKalan(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const fo = await fotograf();
  const loklar = lokasyonSecimi(f);
  const lokIds = loklar.map((l) => STOK_LOKASYONLARI[l]);
  const tumu = !(f.lokasyonlar ?? []).length;
  // Giren: tedarikçiden / sayımdan seçili lokasyonlara
  const girisler = (await execute('stock.move.line', 'search_read', [[
    ['state', '=', 'done'],
    ['date', '>=', odooZaman(r.gte)],
    ['date', '<=', odooZaman(r.lte)],
    ['location_dest_id', 'in', lokIds],
    ['location_id.usage', 'in', ['supplier', 'inventory']],
  ]], { fields: ['product_id', 'quantity', 'date'], limit: 200000, ...ODOO_CTX })) as { product_id: unknown; quantity: number; date: string }[];
  const giren = new Map<number, { adet: number; ilk: string }>();
  for (const g of girisler) {
    const id = m2oId(g.product_id);
    if (!id) continue;
    const o = giren.get(id) ?? { adet: 0, ilk: g.date.slice(0, 10) };
    o.adet += sayi(g.quantity);
    if (g.date.slice(0, 10) < o.ilk) o.ilk = g.date.slice(0, 10);
    giren.set(id, o);
  }
  const satis = await posSatislari(r.gte, r.lte, tumu ? undefined : loklar);
  const kalan = new Map<number, number>();
  const lokSet = new Set(loklar);
  for (const q of fo.quantlar) if (lokSet.has(q.lok)) kalan.set(q.urunId, (kalan.get(q.urunId) ?? 0) + q.adet);

  const ilgili = [...new Set([...giren.keys(), ...satis.keys()])];
  const eksik = ilgili.filter((id) => !fo.urunler.has(id));
  const ek = eksik.length ? await urunleriOku(eksik) : new Map<number, Urun>();
  const urun = (id: number) => fo.urunler.get(id) ?? ek.get(id);
  const uygun = urunFiltresi(f);
  const gruplama = f.gruplama || 'marka';
  const m = new Map<string, { ad: string; giren: number; satilan: number; kalan: number; ilk: string; son: Date | null }>();
  for (const id of ilgili) {
    const u = urun(id);
    if (!u || !uygun(u)) continue;
    const a = stokAnahtar(gruplama, u, '');
    const o = m.get(a.k) ?? { ad: a.ad, giren: 0, satilan: 0, kalan: 0, ilk: '', son: null };
    const g = giren.get(id);
    const s = satis.get(id);
    o.giren += g?.adet ?? 0;
    o.satilan += s?.adet ?? 0;
    o.kalan += kalan.get(id) ?? 0;
    if (g && (!o.ilk || g.ilk < o.ilk)) o.ilk = g.ilk;
    if (s && (!o.son || s.son > o.son)) o.son = s.son;
    m.set(a.k, o);
  }
  const satirlar: Satir[] = [...m.values()]
    .sort((a, b) => b.satilan - a.satilan || b.giren - a.giren)
    .map((x) => ({
      grup: x.ad,
      giren: yuvarla(x.giren, 2),
      satilan: yuvarla(x.satilan, 2),
      kalan: yuvarla(x.kalan, 2),
      oran: x.satilan + x.kalan > 0 ? yuvarla((x.satilan / (x.satilan + x.kalan)) * 100, 1) : null,
      ilk: x.ilk,
      son: x.son ? trGun(x.son) : '',
    }));
  return {
    kolonlar: [
      { key: 'grup', label: SATILAN_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'giren', label: 'Dönemde giren', tip: 'sayi', toplam: true },
      { key: 'satilan', label: 'Dönemde satılan', tip: 'sayi', toplam: true },
      { key: 'kalan', label: 'Bugün kalan', tip: 'sayi', toplam: true },
      { key: 'oran', label: 'Satış oranı', tip: 'yuzde' },
      { key: 'ilk', label: 'İlk giriş', tip: 'tarih' },
      { key: 'son', label: 'Son satış', tip: 'tarih' },
    ],
    satirlar,
    notlar: [
      stokNotu(fo),
      'Giren: dönemde tedarikçiden ya da sayımla seçili lokasyonlara giren adet (transferler sayılmaz). Satılan: yeni sistemdeki satışlar. Satış oranı = satılan ÷ (satılan + kalan).',
    ],
  };
}

// ───────────────────────── Devir Hızı ve Yaşlandırma ─────────────────────────

export const YAS_GRUPLAMA = [
  { key: 'kategori', label: 'Kategori' },
  { key: 'marka', label: 'Marka' },
  { key: 'lokasyon', label: 'Lokasyon' },
  { key: 'sablon', label: 'Ürün (şablon)' },
  { key: 'olu', label: 'Ölü stok listesi (ürün ürün)' },
];

export async function devirYaslandirma(f: Filtre, ctx: CalistirmaBaglami): Promise<RaporSonuc> {
  const fo = await fotograf();
  const loklar = new Set(lokasyonSecimi(f));
  const uygun = urunFiltresi(f);
  const gruplama = f.gruplama || 'kategori';
  const secili = fo.quantlar.filter((q) => loklar.has(q.lok) && uygun(fo.urunler.get(q.urunId)));
  const simdi = Date.now();
  const s90 = await posSatislari(new Date(simdi - 90 * GUN_MS), new Date(simdi));
  const s180 = await posSatislari(new Date(simdi - 180 * GUN_MS), new Date(simdi));
  const maliyet = ctx.maliyetGorur ? await varyantMaliyetleri(secili.map((q) => q.urunId)) : new Map<number, number>();
  const yas = (g: string | null) => (g ? Math.floor((simdi - new Date(`${g}T12:00:00Z`).getTime()) / GUN_MS) : null);

  if (gruplama === 'olu') {
    const m = new Map<string, { u: Urun; lok: Set<string>; adet: number; enEski: number; deger: number }>();
    for (const q of secili) {
      const u = fo.urunler.get(q.urunId)!;
      const y = yas(q.giris) ?? 0;
      if (y < 180 || s180.has(u.id)) continue;
      const o = m.get(String(u.id)) ?? { u, lok: new Set<string>(), adet: 0, enEski: 0, deger: 0 };
      o.lok.add(q.lok);
      o.adet += q.adet;
      o.enEski = Math.max(o.enEski, y);
      o.deger += (maliyet.get(u.id) ?? 0) * q.adet;
      m.set(String(u.id), o);
    }
    return {
      kolonlar: [
        { key: 'urun', label: 'Ürün', tip: 'metin' },
        { key: 'kategori', label: 'Kategori', tip: 'metin' },
        { key: 'lokasyon', label: 'Lokasyon', tip: 'metin' },
        { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
        { key: 'gun', label: 'En eski (gün)', tip: 'sayi' },
        { key: 'satisDegeri', label: 'Satış değeri', tip: 'para', toplam: true },
        { key: 'maliyet', label: 'Bağlı para (maliyet)', tip: 'para', toplam: true, maliyet: true },
      ],
      satirlar: [...m.values()]
        .sort((a, b) => b.enEski - a.enEski)
        .map((x) => ({
          urun: x.u.ad,
          kategori: KATEGORI_ADI[x.u.kategori],
          lokasyon: [...x.lok].join(', '),
          adet: yuvarla(x.adet, 2),
          gun: x.enEski,
          satisDegeri: yuvarla(x.u.fiyat * x.adet),
          maliyet: yuvarla(x.deger),
        })),
      notlar: [stokNotu(fo), 'Ölü stok: 180 günden eski ve son 180 günde yeni sistemde hiç satılmamış ürünler.'],
    };
  }

  const m = new Map<string, { ad: string; adet: number; b: number[]; s90: number; deger365: number; urunler: Set<number> }>();
  for (const q of secili) {
    const u = fo.urunler.get(q.urunId)!;
    const a = stokAnahtar(gruplama, u, q.lok);
    const o = m.get(a.k) ?? { ad: a.ad, adet: 0, b: [0, 0, 0, 0, 0], s90: 0, deger365: 0, urunler: new Set<number>() };
    const y = yas(q.giris);
    const i = y == null ? 4 : y <= 90 ? 0 : y <= 180 ? 1 : y <= 365 ? 2 : 3;
    o.b[i] += q.adet;
    o.adet += q.adet;
    if (i === 3) o.deger365 += (maliyet.get(u.id) ?? 0) * q.adet;
    o.urunler.add(u.id);
    m.set(a.k, o);
  }
  for (const o of m.values()) for (const id of o.urunler) o.s90 += s90.get(id)?.adet ?? 0;
  const satirlar: Satir[] = [...m.values()]
    .sort((a, b) => b.adet - a.adet)
    .map((x) => ({
      grup: x.ad,
      adet: yuvarla(x.adet, 2),
      y0: yuvarla(x.b[0], 2) || null,
      y1: yuvarla(x.b[1], 2) || null,
      y2: yuvarla(x.b[2], 2) || null,
      y3: yuvarla(x.b[3], 2) || null,
      bilinmiyor: yuvarla(x.b[4], 2) || null,
      satis90: yuvarla(x.s90, 2),
      stokGunu: x.s90 > 0 ? Math.round(x.adet / (x.s90 / 90)) : null,
      deger365: yuvarla(x.deger365),
    }));
  return {
    kolonlar: [
      { key: 'grup', label: YAS_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'adet', label: 'Stok', tip: 'sayi', toplam: true },
      { key: 'y0', label: '0–90 gün', tip: 'sayi', toplam: true },
      { key: 'y1', label: '91–180', tip: 'sayi', toplam: true },
      { key: 'y2', label: '181–365', tip: 'sayi', toplam: true },
      { key: 'y3', label: '365+', tip: 'sayi', toplam: true },
      { key: 'bilinmiyor', label: 'Tarihsiz', tip: 'sayi', toplam: true },
      { key: 'satis90', label: 'Son 90 gün satış', tip: 'sayi', toplam: true },
      { key: 'stokGunu', label: 'Kaç günlük stok', tip: 'sayi' },
      { key: 'deger365', label: '365+ bağlı para', tip: 'para', toplam: true, maliyet: true },
    ],
    satirlar,
    notlar: [
      stokNotu(fo),
      'Yaş: ürünün o lokasyona giriş tarihinden (transferle yer değiştirince yenilenir) bugüne. Kaç günlük stok = stok ÷ (son 90 gün satışı ÷ 90); boşsa son 90 günde satış yok.',
    ],
  };
}

// ───────────────────────── Stok Seviye / İkmal ─────────────────────────

export const SEVIYE_DURUMLARI = [
  { key: 'eksik', label: 'Minimumun altında olanlar' },
  { key: 'hepsi', label: 'Kurala giren tüm ürünler' },
];

export async function stokSeviyeRaporu(f: Filtre): Promise<RaporSonuc> {
  const loklar = (f.lokasyonlar ?? []).filter((l) => l in STOK_LOKASYONLARI && !l.includes('DEPO'));
  if (!loklar.length) throw new RaporHatasi('En az bir mağaza seçin (depolar hariç).');
  const sadeceEksik = (f.durum || 'eksik') === 'eksik';
  const satirlar: Satir[] = [];
  const notlar: string[] = ['Mağaza stok kuralları (Stok Yönetimi › Min-Max) ile hesaplanır. Önerilen = maksimuma tamamlamak için gereken adet (taslak ve siparişler düşülmüş).'];
  for (const lok of loklar) {
    let sonuc: Awaited<ReturnType<typeof minMaxDegerlendir>>;
    try {
      sonuc = await minMaxDegerlendir(lok);
    } catch (e) {
      notlar.push(`${lok}: ${e instanceof Error ? e.message : 'okunamadı'}`);
      continue;
    }
    if (!sonuc.kuralOzet.length) notlar.push(`${lok}: tanımlı stok kuralı yok.`);
    for (const s of sonuc.satirlar) {
      if (sadeceEksik && s.eksik <= 0) continue;
      satirlar.push({
        lokasyon: lok,
        urun: s.ad,
        seri: s.seri,
        sph: s.sph != null ? s.sph.toFixed(2) : '',
        cyl: s.cyl != null ? s.cyl.toFixed(2) : '',
        min: s.min,
        max: s.max,
        magaza: s.magazaAdet,
        depo: s.depoAdet,
        taslak: s.taslakta,
        siparis: s.sipariste,
        satis30: s.satis30,
        eksik: s.eksik,
        onerilen: s.onerilen,
      });
    }
  }
  return {
    kolonlar: [
      { key: 'lokasyon', label: 'Mağaza', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'seri', label: 'Seri', tip: 'metin' },
      { key: 'sph', label: 'SPH', tip: 'metin' },
      { key: 'cyl', label: 'CYL', tip: 'metin' },
      { key: 'min', label: 'Min', tip: 'sayi' },
      { key: 'max', label: 'Max', tip: 'sayi' },
      { key: 'magaza', label: 'Mağazada', tip: 'sayi', toplam: true },
      { key: 'depo', label: 'Depoda', tip: 'sayi' },
      { key: 'taslak', label: 'Taslakta', tip: 'sayi', toplam: true },
      { key: 'siparis', label: 'Siparişte', tip: 'sayi', toplam: true },
      { key: 'satis30', label: 'Son 30 gün satış', tip: 'sayi', toplam: true },
      { key: 'eksik', label: 'Eksik', tip: 'sayi', toplam: true },
      { key: 'onerilen', label: 'Önerilen sipariş', tip: 'sayi', toplam: true },
    ],
    satirlar,
    notlar,
  };
}

// ───────────────────────── Karekod Hareketleri ─────────────────────────

export async function karekodHareketleri(f: Filtre): Promise<RaporSonuc> {
  const q = (f.ara ?? '').trim();
  if (q.length < 4) throw new RaporHatasi('Karekodu, seri ya da lot numarasını yazın veya okutun (en az 4 karakter).');
  const varyant = [...new Set([q, q.replace(/\(/g, '*'), q.replace(/\*/g, '(')])];
  const domain: unknown[] = [];
  for (let i = 0; i < varyant.length * 2 - 1; i++) domain.push('|');
  for (const v of varyant) domain.push(['name', 'ilike', v], ['x_uts_kodu', 'ilike', v]);
  const lotlar = (await execute('stock.lot', 'search_read', [domain], {
    fields: ['id', 'name', 'product_id', 'x_uts_kodu'],
    limit: 20,
    ...ODOO_CTX,
  })) as { id: number; name: string; product_id: unknown; x_uts_kodu?: string | false }[];
  type O = { t: Date; olay: string; belge: string; urun: string; lot: string; nereden: string; nereye: string; kaynak: string; aciklama: string };
  const olaylar: O[] = [];
  if (lotlar.length) {
    const hareket = (await execute('stock.move.line', 'search_read', [[['state', '=', 'done'], ['lot_id', 'in', lotlar.map((l) => l.id)]]], {
      fields: ['date', 'reference', 'product_id', 'lot_id', 'quantity', 'location_id', 'location_dest_id'],
      order: 'date asc',
      limit: 2000,
      ...ODOO_CTX,
    })) as { date: string; reference: string | false; product_id: unknown; lot_id: unknown; quantity: number; location_id: unknown; location_dest_id: unknown }[];
    const locIds = [...new Set(hareket.flatMap((x) => [m2oId(x.location_id), m2oId(x.location_dest_id)]).filter((x): x is number => !!x))];
    const lb = new Map(
      (await odooParcaOku<{ id: number; usage: string; complete_name: string }>('stock.location', locIds, ['id', 'usage', 'complete_name'])).map((l) => [l.id, l]),
    );
    const ad = (id: number | null) => (id ? LOKASYON_KODU.get(id) ?? lb.get(id)?.complete_name ?? String(id) : '');
    for (const x of hareket) {
      const ka = m2oId(x.location_id);
      const he = m2oId(x.location_dest_id);
      olaylar.push({
        t: new Date(`${x.date.replace(' ', 'T')}Z`),
        olay: KULLANIM_TUR(lb.get(ka ?? -1)?.usage ?? '', lb.get(he ?? -1)?.usage ?? ''),
        belge: x.reference || '',
        urun: m2oAd(x.product_id),
        lot: m2oAd(x.lot_id),
        nereden: ad(ka),
        nereye: ad(he),
        kaynak: 'Odoo stok',
        aciklama: `${sayi(x.quantity)} adet`,
      });
    }
  }
  const lotAdlari = lotlar.map((l) => l.name);
  const sb = await subeler();
  const satisKalemleri = await prisma.saleItem.findMany({
    where: { OR: [{ lotNo: { in: lotAdlari.length ? lotAdlari : ['__yok__'] } }, { lotNo: { contains: q } }] },
    select: {
      lotNo: true,
      odooProductName: true,
      status: true,
      sale: { select: { createdAt: true, referansNo: true, id: true, branchId: true, status: true, customer: { select: { name: true } } } },
    },
    take: 200,
  });
  for (const k of satisKalemleri) {
    olaylar.push({
      t: k.sale.createdAt,
      olay: k.sale.status === 'VOID' || k.status === 'VOID' ? 'Satış (iptal edildi)' : k.sale.status === 'DRAFT' ? 'Satış taslağı' : 'Satış (POS)',
      belge: k.sale.referansNo ?? k.sale.id.slice(0, 8),
      urun: k.odooProductName ?? '',
      lot: k.lotNo ?? '',
      nereden: sb.get(k.sale.branchId)?.kod ?? '',
      nereye: k.sale.customer?.name ?? '',
      kaynak: 'POS',
      aciklama: '',
    });
  }
  const seriler = [...new Set([...lotAdlari, q])];
  const utsKalemleri = await prisma.utsBildirimKalem.findMany({
    where: { OR: [{ seriNo: { in: seriler } }, { lotNo: { in: seriler } }, { seriNo: { contains: q } }] },
    select: { barkod: true, seriNo: true, lotNo: true, bildirim: { select: { tip: true, durum: true, createdAt: true, belgeNo: true, branchId: true, karsiAd: true, hataDetay: true } } },
    take: 200,
  });
  for (const k of utsKalemleri) {
    olaylar.push({
      t: k.bildirim.createdAt,
      olay: `ÜTS ${k.bildirim.tip.replace(/_/g, ' ').toLocaleLowerCase('tr-TR')} — ${k.bildirim.durum}`,
      belge: k.bildirim.belgeNo ?? '',
      urun: k.barkod,
      lot: k.seriNo ?? k.lotNo ?? '',
      nereden: sb.get(k.bildirim.branchId)?.kod ?? '',
      nereye: k.bildirim.karsiAd ?? '',
      kaynak: 'ÜTS',
      aciklama: (k.bildirim.hataDetay ?? '').slice(0, 150),
    });
  }
  olaylar.sort((a, b) => a.t.getTime() - b.t.getTime());
  return {
    kolonlar: [
      { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
      { key: 'olay', label: 'Olay', tip: 'metin' },
      { key: 'kaynak', label: 'Kaynak', tip: 'metin' },
      { key: 'belge', label: 'Belge', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'lot', label: 'Seri / lot', tip: 'metin' },
      { key: 'nereden', label: 'Nereden', tip: 'metin' },
      { key: 'nereye', label: 'Nereye / kime', tip: 'metin' },
      { key: 'aciklama', label: 'Açıklama', tip: 'metin' },
    ],
    satirlar: olaylar.map((o) => ({ tarih: trSaat(o.t), olay: o.olay, kaynak: o.kaynak, belge: o.belge, urun: o.urun, lot: o.lot, nereden: o.nereden, nereye: o.nereye, aciklama: o.aciklama })),
    ozet: [
      { ad: 'Bulunan karekod', deger: lotlar.length, tip: 'sayi' },
      { ad: 'Olay', deger: olaylar.length, tip: 'sayi' },
      { ad: 'ÜTS karekodu', deger: lotlar.find((l) => typeof l.x_uts_kodu === 'string' && l.x_uts_kodu)?.x_uts_kodu || '-', tip: 'metin' },
    ],
    notlar: ['Odoo stok hareketleri, POS satışları ve ÜTS bildirimleri tek zaman çizelgesinde. Aynı aramaya uyan en fazla 20 karekod gösterilir.'],
  };
}

// ───────────────────────── ÜTS Bildirim Durumu ─────────────────────────

export const UTS_DURUMLARI = [
  { key: 'hepsi', label: 'Hepsi' },
  { key: 'BEKLIYOR', label: 'Bekliyor' },
  { key: 'HATA', label: 'Hata' },
  { key: 'GONDERILDI', label: 'Gönderildi' },
  { key: 'IPTAL', label: 'İptal' },
];
export const UTS_GRUPLAMA = [
  { key: 'detay', label: 'Bildirim bildirim (detay)' },
  { key: 'tip', label: 'Bildirim türü' },
  { key: 'durum', label: 'Durum' },
  { key: 'sube', label: 'Şube' },
];
const UTS_TIP: Record<string, string> = {
  ALMA: 'Alma',
  VERME: 'Verme',
  TUKETICIYE_VERME: 'Tüketiciye verme',
  TANIMSIZ_YERE_VERME: 'Tanımsız yere verme',
  TUKETICIDEN_IADE: 'Tüketiciden iade',
  HEK_ZAYIAT: 'HEK / zayiat',
};
const UTS_DURUM: Record<string, string> = { BEKLIYOR: 'Bekliyor', GONDERILDI: 'Gönderildi', HATA: 'Hata', IPTAL: 'İptal' };

export async function utsBildirimDurumu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const durum = f.durum || 'hepsi';
  const gruplama = f.gruplama || 'detay';
  const liste = await prisma.utsBildirim.findMany({
    where: {
      createdAt: { gte: r.gte, lte: r.lte },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
      ...(durum !== 'hepsi' ? { durum } : {}),
    },
    select: {
      createdAt: true,
      tip: true,
      durum: true,
      branchId: true,
      karsiAd: true,
      belgeNo: true,
      gonderimZamani: true,
      hataDetay: true,
      _count: { select: { kalemler: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });
  const sb = await subeler();
  const say = (d: string) => liste.filter((x) => x.durum === d).length;
  const ozet = [
    { ad: 'Bildirim', deger: liste.length, tip: 'sayi' as const },
    { ad: 'Bekliyor', deger: say('BEKLIYOR'), tip: 'sayi' as const },
    { ad: 'Hata', deger: say('HATA'), tip: 'sayi' as const },
    { ad: 'Gönderildi', deger: say('GONDERILDI'), tip: 'sayi' as const },
  ];
  if (gruplama === 'detay') {
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'tip', label: 'Tür', tip: 'metin' },
        { key: 'durum', label: 'Durum', tip: 'metin' },
        { key: 'karsi', label: 'Karşı taraf', tip: 'metin' },
        { key: 'belge', label: 'Belge no', tip: 'metin' },
        { key: 'kalem', label: 'Kalem', tip: 'sayi', toplam: true },
        { key: 'gonderim', label: 'Gönderim', tip: 'tarihSaat' },
        { key: 'hata', label: 'Hata', tip: 'metin' },
      ],
      satirlar: liste.map((x) => ({
        tarih: trSaat(x.createdAt),
        sube: sb.get(x.branchId)?.kod ?? '',
        tip: UTS_TIP[x.tip] ?? x.tip,
        durum: UTS_DURUM[x.durum] ?? x.durum,
        karsi: x.karsiAd ?? '',
        belge: x.belgeNo ?? '',
        kalem: x._count.kalemler,
        gonderim: x.gonderimZamani ? trSaat(x.gonderimZamani) : '',
        hata: (x.hataDetay ?? '').slice(0, 200),
      })),
      ozet,
    };
  }
  const m = new Map<string, { ad: string; adet: number; kalem: number; bekliyor: number; hata: number; tamam: number }>();
  for (const x of liste) {
    let k: string;
    let ad: string;
    if (gruplama === 'tip') [k, ad] = [x.tip, UTS_TIP[x.tip] ?? x.tip];
    else if (gruplama === 'durum') [k, ad] = [x.durum, UTS_DURUM[x.durum] ?? x.durum];
    else {
      const s = sb.get(x.branchId);
      [k, ad] = [x.branchId, s ? `${s.kod} · ${s.ad}` : x.branchId];
    }
    const o = m.get(k) ?? { ad, adet: 0, kalem: 0, bekliyor: 0, hata: 0, tamam: 0 };
    o.adet++;
    o.kalem += x._count.kalemler;
    if (x.durum === 'BEKLIYOR') o.bekliyor++;
    else if (x.durum === 'HATA') o.hata++;
    else if (x.durum === 'GONDERILDI') o.tamam++;
    m.set(k, o);
  }
  return {
    kolonlar: [
      { key: 'grup', label: UTS_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'adet', label: 'Bildirim', tip: 'sayi', toplam: true },
      { key: 'kalem', label: 'Kalem', tip: 'sayi', toplam: true },
      { key: 'tamam', label: 'Gönderildi', tip: 'sayi', toplam: true },
      { key: 'bekliyor', label: 'Bekliyor', tip: 'sayi', toplam: true },
      { key: 'hata', label: 'Hata', tip: 'sayi', toplam: true },
    ],
    satirlar: [...m.values()].sort((a, b) => b.adet - a.adet).map((x) => ({ grup: x.ad, adet: x.adet, kalem: x.kalem, tamam: x.tamam, bekliyor: x.bekliyor, hata: x.hata })),
    ozet,
  };
}

// ───────────────────────── Alış (Odoo satın alma) ─────────────────────────

type PoSatir = {
  id: number;
  order_id: unknown;
  partner_id: unknown;
  product_id: unknown;
  name: string;
  product_qty: number;
  qty_received: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
  company_id: unknown;
};
type PoBaslik = { id: number; name: string; partner_ref: string | false; date_order: string; state: string };

async function alisSatirlari(f: Filtre) {
  const r = aralik(f);
  const domain: unknown[] = [
    ['order_id.state', 'in', ['purchase', 'done']],
    ['order_id.date_order', '>=', odooZaman(r.gte)],
    ['order_id.date_order', '<=', odooZaman(r.lte)],
  ];
  if (f.ara) domain.push('|', '|', ['partner_id', 'ilike', f.ara], ['product_id', 'ilike', f.ara], ['order_id.partner_ref', 'ilike', f.ara]);
  const satirlar = (await execute('purchase.order.line', 'search_read', [domain], {
    fields: ['id', 'order_id', 'partner_id', 'product_id', 'name', 'product_qty', 'qty_received', 'price_unit', 'discount', 'price_subtotal', 'company_id'],
    limit: 50000,
    ...ODOO_CTX,
  })) as PoSatir[];
  const basliklar = new Map(
    (await odooParcaOku<PoBaslik>('purchase.order', satirlar.map((s) => m2oId(s.order_id)).filter((x): x is number => !!x), ['id', 'name', 'partner_ref', 'date_order', 'state'])).map(
      (p) => [p.id, p],
    ),
  );
  const urunler = await urunleriOku(satirlar.map((s) => m2oId(s.product_id)).filter((x): x is number => !!x));
  const uygun = urunFiltresi({ ...f, ara: undefined });
  const liste = satirlar.filter((s) => {
    const u = urunler.get(m2oId(s.product_id) ?? -1);
    return !(f.kategori || f.marka) || uygun(u);
  });
  return { liste, basliklar, urunler };
}

export const ALIS_GRUPLAMA = [
  { key: 'tedarikci', label: 'Tedarikçi' },
  { key: 'marka', label: 'Marka' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'urun', label: 'Ürün' },
  { key: 'ay', label: 'Ay' },
  { key: 'sirket', label: 'Şirket' },
];

export async function alisOzeti(f: Filtre): Promise<RaporSonuc> {
  const { liste, basliklar, urunler } = await alisSatirlari(f);
  const gruplama = f.gruplama || 'tedarikci';
  const m = new Map<string, { ad: string; belge: Set<number>; adet: number; alinan: number; tutar: number }>();
  for (const s of liste) {
    const u = urunler.get(m2oId(s.product_id) ?? -1);
    const po = basliklar.get(m2oId(s.order_id) ?? -1);
    let k: string;
    let ad: string;
    switch (gruplama) {
      case 'marka':
        [k, ad] = [u?.marka ?? '(belirsiz)', u?.marka ?? '(belirsiz)'];
        break;
      case 'kategori':
        [k, ad] = [u?.kategori ?? 'DIGER', KATEGORI_ADI[u?.kategori ?? 'DIGER']];
        break;
      case 'urun':
        [k, ad] = [String(m2oId(s.product_id)), m2oAd(s.product_id) || s.name];
        break;
      case 'ay': {
        const a = (po?.date_order ?? '').slice(0, 7);
        [k, ad] = [a, a];
        break;
      }
      case 'sirket':
        [k, ad] = [m2oAd(s.company_id), m2oAd(s.company_id)];
        break;
      default:
        [k, ad] = [m2oAd(s.partner_id), m2oAd(s.partner_id) || '(tedarikçi yok)'];
    }
    const o = m.get(k) ?? { ad, belge: new Set<number>(), adet: 0, alinan: 0, tutar: 0 };
    o.belge.add(m2oId(s.order_id) ?? 0);
    o.adet += sayi(s.product_qty);
    o.alinan += sayi(s.qty_received);
    o.tutar += sayi(s.price_subtotal);
    m.set(k, o);
  }
  const toplam = [...m.values()].reduce((a, x) => a + x.tutar, 0);
  return {
    kolonlar: [
      { key: 'grup', label: ALIS_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'belge', label: 'Belge', tip: 'sayi', toplam: true },
      { key: 'adet', label: 'Alınan adet', tip: 'sayi', toplam: true },
      { key: 'alinan', label: 'Teslim alınan', tip: 'sayi', toplam: true },
      { key: 'tutar', label: 'Tutar (KDV hariç)', tip: 'para', toplam: true, maliyet: true },
      { key: 'ort', label: 'Ort. birim maliyet', tip: 'para', maliyet: true },
      { key: 'pay', label: 'Pay', tip: 'yuzde', maliyet: true },
    ],
    satirlar: [...m.values()]
      .sort((a, b) => (gruplama === 'ay' ? a.ad.localeCompare(b.ad) : b.tutar - a.tutar))
      .map((x) => ({
        grup: x.ad,
        belge: x.belge.size,
        adet: yuvarla(x.adet, 2),
        alinan: yuvarla(x.alinan, 2),
        tutar: yuvarla(x.tutar),
        ort: x.adet ? yuvarla(x.tutar / x.adet) : null,
        pay: toplam ? yuvarla((x.tutar / toplam) * 100, 1) : 0,
      })),
    ozet: [
      { ad: 'Alış tutarı', deger: yuvarla(toplam), tip: 'para', maliyet: true },
      { ad: 'Alınan adet', deger: yuvarla([...m.values()].reduce((a, x) => a + x.adet, 0), 2), tip: 'sayi' },
    ],
    notlar: [
      'Ürün Girişi ekranından Odoo’ya işlenen satın alma kayıtları (fatura tarihine göre, iskonto sonrası, KDV hariç). Faturasız girişler burada yoktur; “Ayrıntılı Alış” raporunun “Bekleyen faturalar” görünümüne bakın.',
    ],
  };
}

export const AYRINTILI_ALIS_GRUPLAMA = [
  { key: 'kalem', label: 'Kalem kalem' },
  { key: 'belge', label: 'Belge (fatura) bazında' },
  { key: 'bekleyen', label: 'Faturası beklenen girişler' },
];

export async function ayrintiliAlis(f: Filtre): Promise<RaporSonuc> {
  const gruplama = f.gruplama || 'kalem';
  if (gruplama === 'bekleyen') {
    const liste = await prisma.bekleyenFatura.findMany({
      where: {
        durum: { in: ['BEKLIYOR', 'KISMI'] },
        ...(f.ara
          ? { OR: [{ tedarikciAdi: { contains: f.ara, mode: 'insensitive' } }, { irsaliyeNo: { contains: f.ara } }, { uyumsoftNo: { contains: f.ara } }] }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });
    const TIP: Record<string, string> = { FATURA_SONRA: 'Fatura sonra gelecek', IRSALIYELI: 'İrsaliyeli', FATURASIZ: 'Faturasız', UYUMSOFT_GELEN: 'Uyumsoft gelen fatura' };
    return {
      kolonlar: [
        { key: 'tarih', label: 'Kayıt tarihi', tip: 'tarih' },
        { key: 'tip', label: 'Giriş tipi', tip: 'metin' },
        { key: 'tedarikci', label: 'Tedarikçi', tip: 'metin' },
        { key: 'irsaliye', label: 'İrsaliye no', tip: 'metin' },
        { key: 'fatura', label: 'Fatura no', tip: 'metin' },
        { key: 'sube', label: 'Şube / depo', tip: 'metin' },
        { key: 'kalem', label: 'Kalem', tip: 'sayi', toplam: true },
        { key: 'tutar', label: 'Tutar', tip: 'para', toplam: true, maliyet: true },
        { key: 'gun', label: 'Bekleyen gün', tip: 'sayi' },
        { key: 'durum', label: 'Durum', tip: 'metin' },
      ],
      satirlar: liste.map((b) => {
        let kalemler: { miktar?: number; birimFiyat?: number }[] = [];
        try {
          const j = b.kalemler ? (JSON.parse(b.kalemler) as unknown) : [];
          kalemler = Array.isArray(j) ? (j as typeof kalemler) : [];
        } catch {
          kalemler = [];
        }
        return {
          tarih: trGun(b.createdAt),
          tip: TIP[b.girisTipi] ?? b.girisTipi,
          tedarikci: b.tedarikciAdi ?? '',
          irsaliye: b.tedarikciIrsaliyeNo ?? b.irsaliyeNo ?? '',
          fatura: b.uyumsoftNo ?? b.odooFaturaNo ?? '',
          sube: b.subeAdi ?? b.hedefDepo ?? '',
          kalem: kalemler.length,
          tutar: yuvarla(kalemler.reduce((a, k) => a + sayi(k.miktar) * sayi(k.birimFiyat), 0)),
          gun: Math.floor((Date.now() - b.createdAt.getTime()) / GUN_MS),
          durum: b.durum === 'KISMI' ? 'Kısmi eşleşti' : 'Bekliyor',
        };
      }),
      notlar: ['Faturası henüz gelmemiş / eşleşmemiş girişler (irsaliyeli, faturasız, sonradan faturalı). Tarih filtresi uygulanmaz.'],
    };
  }
  const { liste, basliklar } = await alisSatirlari(f);
  if (gruplama === 'belge') {
    const m = new Map<number, { po: PoBaslik | undefined; tedarikci: string; sirket: string; kalem: number; adet: number; alinan: number; tutar: number }>();
    for (const s of liste) {
      const id = m2oId(s.order_id) ?? 0;
      const o = m.get(id) ?? { po: basliklar.get(id), tedarikci: m2oAd(s.partner_id), sirket: m2oAd(s.company_id), kalem: 0, adet: 0, alinan: 0, tutar: 0 };
      o.kalem++;
      o.adet += sayi(s.product_qty);
      o.alinan += sayi(s.qty_received);
      o.tutar += sayi(s.price_subtotal);
      m.set(id, o);
    }
    return {
      kolonlar: [
        { key: 'tarih', label: 'Fatura tarihi', tip: 'tarih' },
        { key: 'belge', label: 'Satın alma no', tip: 'metin' },
        { key: 'fatura', label: 'Fatura no', tip: 'metin' },
        { key: 'tedarikci', label: 'Tedarikçi', tip: 'metin' },
        { key: 'sirket', label: 'Şirket', tip: 'metin' },
        { key: 'kalem', label: 'Kalem', tip: 'sayi', toplam: true },
        { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
        { key: 'alinan', label: 'Teslim alınan', tip: 'sayi', toplam: true },
        { key: 'tutar', label: 'Tutar (KDV hariç)', tip: 'para', toplam: true, maliyet: true },
      ],
      satirlar: [...m.values()]
        .sort((a, b) => String(b.po?.date_order ?? '').localeCompare(String(a.po?.date_order ?? '')))
        .map((x) => ({
          tarih: (x.po?.date_order ?? '').slice(0, 10),
          belge: x.po?.name ?? '',
          fatura: x.po?.partner_ref || '',
          tedarikci: x.tedarikci,
          sirket: x.sirket,
          kalem: x.kalem,
          adet: yuvarla(x.adet, 2),
          alinan: yuvarla(x.alinan, 2),
          tutar: yuvarla(x.tutar),
        })),
    };
  }
  return {
    kolonlar: [
      { key: 'tarih', label: 'Fatura tarihi', tip: 'tarih' },
      { key: 'belge', label: 'Satın alma no', tip: 'metin' },
      { key: 'fatura', label: 'Fatura no', tip: 'metin' },
      { key: 'tedarikci', label: 'Tedarikçi', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'tedarikciAdi', label: 'Faturadaki ad', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
      { key: 'alinan', label: 'Teslim alınan', tip: 'sayi', toplam: true },
      { key: 'birim', label: 'Birim fiyat', tip: 'para', maliyet: true },
      { key: 'iskonto', label: 'İskonto %', tip: 'yuzde', maliyet: true },
      { key: 'tutar', label: 'Tutar (KDV hariç)', tip: 'para', toplam: true, maliyet: true },
    ],
    satirlar: liste
      .map((s) => {
        const po = basliklar.get(m2oId(s.order_id) ?? -1);
        return {
          tarih: (po?.date_order ?? '').slice(0, 10),
          belge: po?.name ?? m2oAd(s.order_id),
          fatura: po?.partner_ref || '',
          tedarikci: m2oAd(s.partner_id),
          urun: m2oAd(s.product_id),
          tedarikciAdi: s.name,
          adet: yuvarla(sayi(s.product_qty), 2),
          alinan: yuvarla(sayi(s.qty_received), 2),
          birim: yuvarla(sayi(s.price_unit)),
          iskonto: sayi(s.discount) || null,
          tutar: yuvarla(sayi(s.price_subtotal)),
        };
      })
      .sort((a, b) => b.tarih.localeCompare(a.tarih)),
  };
}

