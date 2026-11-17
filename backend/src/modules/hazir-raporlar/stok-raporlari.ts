import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { kategoriTespit } from '../../utils/kategoriTespit';
import type { DashboardKategori } from '../reports/report.service';
import {
  GECERSIZ_SATIS,
  GUN_MS,
  KATEGORI_ADI,
  LOKASYON_KODU,
  ODOO_CTX,
  STOK_LOKASYONLARI,
  aralik,
  buyuk,
  m2oAd,
  m2oId,
  markaTahmin,
  odooParcaOku,
  sayi,
  trSaat,
  varyantMaliyetleri,
  yuvarla,
} from './ortak';
import { RaporHatasi, type CalistirmaBaglami, type Filtre, type Kolon, type RaporSonuc, type Satir } from './tipler';

const ETIKET_TO_KAT: Record<string, DashboardKategori> = {
  CAM: 'CAM',
  'ÇERÇEVE': 'OPTIK_CERCEVE',
  LENS: 'LENS',
  'SOLÜSYON': 'SOLUSYON',
  'GÜNEŞ GÖZLÜĞÜ': 'GUNES_GOZLUGU',
  AKSESUAR: 'AKSESUAR',
};
export function kategoriYoldan(yol: string): DashboardKategori {
  return ETIKET_TO_KAT[kategoriTespit(yol)] ?? 'DIGER';
}

/** "Org 1.5 0075 -0050" → { grup: 'Org 1.5', sph: 75, cyl: -50 } */
const CAM_RE = /^(.+?)\s+(-?\d{4})\s+-(\d{4})$/;
export function camAdCoz(ad: string): { grup: string; sph: number; cyl: number } | null {
  const m = CAM_RE.exec(String(ad ?? '').trim());
  if (!m) return null;
  return { grup: m[1].trim(), sph: Number(m[2]), cyl: -Number(m[3]) };
}

// ───────────────────────── stok fotoğrafı (5 dk önbellek) ─────────────────────────

export type Urun = {
  id: number;
  ad: string;
  tmplId: number | null;
  tmplAd: string;
  kategoriYol: string;
  kategori: DashboardKategori;
  marka: string;
  barkod: string | null;
  fiyat: number;
};
export type Quant = { urunId: number; lok: string; adet: number; lotId: number | null; lotAd: string; giris: string | null };
export type Fotograf = { zaman: number; quantlar: Quant[]; urunler: Map<number, Urun> };

let foto: Fotograf | null = null;
let fotoSoz: Promise<Fotograf> | null = null;

async function fotografCek(): Promise<Fotograf> {
  const lokIds = Object.values(STOK_LOKASYONLARI);
  const ham = (await execute('stock.quant', 'search_read', [[['location_id', 'in', lokIds], ['quantity', '>', 0]]], {
    fields: ['product_id', 'location_id', 'quantity', 'lot_id', 'in_date'],
    ...ODOO_CTX,
  })) as { product_id: unknown; location_id: unknown; quantity: number; lot_id: unknown; in_date: string | false }[];
  const quantlar: Quant[] = [];
  for (const q of ham) {
    const urunId = m2oId(q.product_id);
    const lok = LOKASYON_KODU.get(m2oId(q.location_id) ?? -1);
    if (!urunId || !lok) continue;
    quantlar.push({ urunId, lok, adet: sayi(q.quantity), lotId: m2oId(q.lot_id), lotAd: m2oAd(q.lot_id), giris: q.in_date ? String(q.in_date).slice(0, 10) : null });
  }
  const urunler = await urunleriOku(quantlar.map((q) => q.urunId));
  return { zaman: Date.now(), quantlar, urunler };
}

export async function urunleriOku(ids: number[]): Promise<Map<number, Urun>> {
  type P = { id: number; display_name: string; product_tmpl_id: unknown; categ_id: unknown; barcode: string | false; lst_price: number };
  const rows = await odooParcaOku<P>('product.product', ids, ['id', 'display_name', 'product_tmpl_id', 'categ_id', 'barcode', 'lst_price']);
  const out = new Map<number, Urun>();
  for (const p of rows) {
    const yol = m2oAd(p.categ_id);
    const tmplAd = m2oAd(p.product_tmpl_id);
    out.set(p.id, {
      id: p.id,
      ad: p.display_name,
      tmplId: m2oId(p.product_tmpl_id),
      tmplAd,
      kategoriYol: yol,
      kategori: kategoriYoldan(yol),
      marka: markaTahmin(null, tmplAd),
      barkod: typeof p.barcode === 'string' && p.barcode.trim() ? p.barcode.trim() : null,
      fiyat: sayi(p.lst_price),
    });
  }
  return out;
}

export async function fotograf(): Promise<Fotograf> {
  if (foto && Date.now() - foto.zaman < 5 * 60 * 1000) return foto;
  if (!fotoSoz) {
    fotoSoz = fotografCek()
      .then((x) => {
        foto = x;
        return x;
      })
      .finally(() => {
        fotoSoz = null;
      });
  }
  return fotoSoz;
}

export function lokasyonSecimi(f: Filtre): string[] {
  const secili = (f.lokasyonlar ?? []).filter((k) => k in STOK_LOKASYONLARI);
  return secili.length ? secili : Object.keys(STOK_LOKASYONLARI);
}

export function urunFiltresi(f: Filtre) {
  const markaF = f.marka ? buyuk(f.marka) : '';
  const araF = f.ara ? buyuk(f.ara) : '';
  return (u: Urun | undefined) => {
    if (!u) return false;
    if (f.kategori && u.kategori !== f.kategori) return false;
    if (markaF && !u.marka.includes(markaF)) return false;
    if (araF && !buyuk(u.ad).includes(araF) && !buyuk(u.barkod).includes(araF)) return false;
    return true;
  };
}

export function stokNotu(fo: Fotograf): string {
  return `Stok Odoo’dan okundu (${trSaat(new Date(fo.zaman))}; en fazla 5 dakikalık).`;
}

// ───────────────────────── Son Durum Envanter ─────────────────────────

export const ENVANTER_GRUPLAMA = [
  { key: 'lokasyon', label: 'Lokasyon' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'marka', label: 'Marka' },
  { key: 'sablon', label: 'Ürün (şablon)' },
  { key: 'urun', label: 'Ürün (varyant)' },
];

export async function sonDurumEnvanter(f: Filtre, ctx: CalistirmaBaglami): Promise<RaporSonuc> {
  const fo = await fotograf();
  const loklar = new Set(lokasyonSecimi(f));
  const uygun = urunFiltresi(f);
  const gruplama = f.gruplama || 'lokasyon';
  const secili = fo.quantlar.filter((q) => loklar.has(q.lok) && uygun(fo.urunler.get(q.urunId)));
  const maliyet = ctx.maliyetGorur ? await varyantMaliyetleri(secili.map((q) => q.urunId)) : new Map<number, number>();
  const m = new Map<string, { ad: string; adet: number; cesit: Set<number>; satis: number; maliyet: number }>();
  for (const q of secili) {
    const u = fo.urunler.get(q.urunId)!;
    let k: string;
    let ad: string;
    switch (gruplama) {
      case 'kategori':
        k = u.kategori;
        ad = KATEGORI_ADI[u.kategori];
        break;
      case 'marka':
        k = u.marka;
        ad = u.marka;
        break;
      case 'sablon':
        k = String(u.tmplId ?? u.id);
        ad = u.tmplAd || u.ad;
        break;
      case 'urun':
        k = String(u.id);
        ad = u.ad;
        break;
      default:
        k = q.lok;
        ad = q.lok;
    }
    const o = m.get(k) ?? { ad, adet: 0, cesit: new Set<number>(), satis: 0, maliyet: 0 };
    o.adet += q.adet;
    o.cesit.add(u.id);
    o.satis += u.fiyat * q.adet;
    o.maliyet += (maliyet.get(u.id) ?? 0) * q.adet;
    m.set(k, o);
  }
  const satirlar: Satir[] = [...m.values()]
    .sort((a, b) => b.adet - a.adet)
    .map((x) => ({
      grup: x.ad,
      adet: yuvarla(x.adet, 2),
      cesit: x.cesit.size,
      satisDegeri: yuvarla(x.satis),
      maliyet: yuvarla(x.maliyet),
    }));
  const top = (k: 'adet' | 'satis' | 'maliyet') => [...m.values()].reduce((a, x) => a + x[k], 0);
  return {
    kolonlar: [
      { key: 'grup', label: ENVANTER_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
      { key: 'cesit', label: 'Çeşit', tip: 'sayi' },
      { key: 'satisDegeri', label: 'Satış değeri', tip: 'para', toplam: true },
      { key: 'maliyet', label: 'Maliyet değeri', tip: 'para', toplam: true, maliyet: true },
    ],
    satirlar,
    ozet: [
      { ad: 'Toplam adet', deger: yuvarla(top('adet'), 2), tip: 'sayi' },
      { ad: 'Satış değeri', deger: yuvarla(top('satis')), tip: 'para' },
      { ad: 'Maliyet değeri', deger: yuvarla(top('maliyet')), tip: 'para', maliyet: true },
    ],
    notlar: [stokNotu(fo), 'Satış değeri: ürün kartındaki satış fiyatı × adet. Maliyet: Odoo’daki güncel maliyet × adet.'],
  };
}

// ───────────────────────── Ürünlerin Şube Dağılımı ─────────────────────────

export const DAGILIM_GRUPLAMA = [
  { key: 'sablon', label: 'Ürün (şablon)' },
  { key: 'urun', label: 'Ürün (varyant)' },
  { key: 'marka', label: 'Marka' },
];

export async function subeDagilimi(f: Filtre): Promise<RaporSonuc> {
  const fo = await fotograf();
  const uygun = urunFiltresi(f);
  const gruplama = f.gruplama || 'sablon';
  const secilenLok = lokasyonSecimi(f);
  const loklar = new Set(secilenLok);
  const secili = fo.quantlar.filter((q) => loklar.has(q.lok) && uygun(fo.urunler.get(q.urunId)));
  const anahtar = (u: Urun) =>
    gruplama === 'urun' ? { k: String(u.id), ad: u.ad } : gruplama === 'marka' ? { k: u.marka, ad: u.marka } : { k: String(u.tmplId ?? u.id), ad: u.tmplAd || u.ad };
  const m = new Map<string, { ad: string; lok: Map<string, number>; toplam: number; urunIds: Set<number> }>();
  for (const q of secili) {
    const u = fo.urunler.get(q.urunId)!;
    const a = anahtar(u);
    const o = m.get(a.k) ?? { ad: a.ad, lok: new Map<string, number>(), toplam: 0, urunIds: new Set<number>() };
    o.lok.set(q.lok, (o.lok.get(q.lok) ?? 0) + q.adet);
    o.toplam += q.adet;
    o.urunIds.add(u.id);
    m.set(a.k, o);
  }
  // Son 90 gün POS satışı (aynı anahtar)
  const g90 = new Date(Date.now() - 90 * GUN_MS);
  const urunAnahtar = new Map<number, string>();
  for (const [k, o] of m) for (const id of o.urunIds) urunAnahtar.set(id, k);
  const satis90 = new Map<string, number>();
  if (urunAnahtar.size) {
    const kalemler = await prisma.saleItem.findMany({
      where: {
        status: { not: 'VOID' },
        odooProductId: { in: [...urunAnahtar.keys()].map(String) },
        sale: { status: { notIn: [...GECERSIZ_SATIS] }, createdAt: { gte: g90 } },
      },
      select: { odooProductId: true, qty: true },
    });
    for (const k of kalemler) {
      const key = urunAnahtar.get(Number(k.odooProductId));
      if (key) satis90.set(key, (satis90.get(key) ?? 0) + sayi(k.qty));
    }
  }
  // Sadece stoku olan lokasyonları sütun yap
  const kullanilan = secilenLok.filter((l) => [...m.values()].some((o) => o.lok.has(l)));
  const kolonlar: Kolon[] = [
    { key: 'grup', label: DAGILIM_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Ürün', tip: 'metin' },
    ...kullanilan.map((l) => ({ key: `L_${l}`, label: l, tip: 'sayi' as const, toplam: true })),
    { key: 'toplam', label: 'Toplam', tip: 'sayi', toplam: true },
    { key: 'satis90', label: 'Son 90 gün satış', tip: 'sayi', toplam: true },
  ];
  const satirlar: Satir[] = [...m.entries()]
    .sort((a, b) => b[1].toplam - a[1].toplam)
    .map(([k, o]) => {
      const s: Satir = { grup: o.ad };
      for (const l of kullanilan) s[`L_${l}`] = o.lok.get(l) ?? null;
      s.toplam = yuvarla(o.toplam, 2);
      s.satis90 = satis90.get(k) ?? 0;
      return s;
    });
  return { kolonlar, satirlar, notlar: [stokNotu(fo), 'Boş hücre: o lokasyonda stok yok. 90 gün satış yeni sistemdeki (POS) satışlardır.'] };
}

// ───────────────────────── Stok Hareketleri ─────────────────────────

export const HAREKET_GRUPLAMA = [
  { key: 'detay', label: 'Detay (tek tek)' },
  { key: 'tur', label: 'Hareket türü' },
  { key: 'urun', label: 'Ürün' },
];

export const KULLANIM_TUR = (kaynak: string, hedef: string): string => {
  if (kaynak === 'internal' && hedef === 'customer') return 'Satış / müşteriye çıkış';
  if (kaynak === 'customer' && hedef === 'internal') return 'Müşteriden iade';
  if (kaynak === 'supplier' && hedef === 'internal') return 'Alış girişi';
  if (kaynak === 'internal' && hedef === 'supplier') return 'Tedarikçiye iade';
  if (kaynak === 'inventory' && hedef === 'internal') return 'Sayım / envanter girişi';
  if (kaynak === 'internal' && hedef === 'inventory') return 'Sayım farkı / fire çıkışı';
  if (kaynak === 'internal' || hedef === 'internal' || kaynak === 'transit' || hedef === 'transit') return 'Transfer';
  return `${kaynak} → ${hedef}`;
};

export async function stokHareketleri(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  if (r.gunSayisi > 92) throw new RaporHatasi('Stok hareketlerinde en fazla 3 aylık aralık seçilebilir.');
  const loklar = lokasyonSecimi(f);
  const lokIds = loklar.map((l) => STOK_LOKASYONLARI[l]);
  const gruplama = f.gruplama || 'detay';
  const domain: unknown[] = [
    ['state', '=', 'done'],
    ['date', '>=', r.gte.toISOString().replace('T', ' ').slice(0, 19)],
    ['date', '<=', r.lte.toISOString().replace('T', ' ').slice(0, 19)],
    '|',
    ['location_id', 'in', lokIds],
    ['location_dest_id', 'in', lokIds],
  ];
  if (f.ara) domain.push('|', '|', ['product_id', 'ilike', f.ara], ['reference', 'ilike', f.ara], ['lot_id', 'ilike', f.ara]);
  const satirlarHam = (await execute('stock.move.line', 'search_read', [domain], {
    fields: ['date', 'reference', 'product_id', 'lot_id', 'quantity', 'location_id', 'location_dest_id'],
    order: 'date desc',
    limit: 20000,
    ...ODOO_CTX,
  })) as { date: string; reference: string | false; product_id: unknown; lot_id: unknown; quantity: number; location_id: unknown; location_dest_id: unknown }[];
  const locIds = [...new Set(satirlarHam.flatMap((x) => [m2oId(x.location_id), m2oId(x.location_dest_id)]).filter((x): x is number => !!x))];
  const lokBilgi = new Map(
    (await odooParcaOku<{ id: number; usage: string; complete_name: string }>('stock.location', locIds, ['id', 'usage', 'complete_name'])).map((l) => [l.id, l]),
  );
  const lokAd = (id: number | null) => (id ? LOKASYON_KODU.get(id) ?? lokBilgi.get(id)?.complete_name ?? String(id) : '');
  const secim = new Set(lokIds);
  const liste = satirlarHam.map((x) => {
    const ka = m2oId(x.location_id);
    const he = m2oId(x.location_dest_id);
    const tur = KULLANIM_TUR(lokBilgi.get(ka ?? -1)?.usage ?? '', lokBilgi.get(he ?? -1)?.usage ?? '');
    const giris = he != null && secim.has(he) && !(ka != null && secim.has(ka));
    const cikis = ka != null && secim.has(ka) && !(he != null && secim.has(he));
    return {
      tarih: new Date(`${x.date.replace(' ', 'T')}Z`),
      belge: x.reference || '',
      urun: m2oAd(x.product_id),
      urunId: m2oId(x.product_id),
      lot: m2oAd(x.lot_id),
      adet: sayi(x.quantity),
      kaynak: lokAd(ka),
      hedef: lokAd(he),
      tur,
      giris: giris ? sayi(x.quantity) : 0,
      cikis: cikis ? sayi(x.quantity) : 0,
    };
  });
  const notlar = [
    'Odoo’daki tamamlanmış stok hareketleri. Giriş/çıkış seçili lokasyonlara göredir; seçili lokasyonlar arası transferler ikisinde de sayılmaz.',
  ];
  if (satirlarHam.length >= 20000) notlar.push('İlk 20.000 hareket alındı; aralığı daraltın.');
  if (gruplama === 'detay') {
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'belge', label: 'Belge', tip: 'metin' },
        { key: 'tur', label: 'Tür', tip: 'metin' },
        { key: 'urun', label: 'Ürün', tip: 'metin' },
        { key: 'lot', label: 'Karekod / lot', tip: 'metin' },
        { key: 'kaynak', label: 'Nereden', tip: 'metin' },
        { key: 'hedef', label: 'Nereye', tip: 'metin' },
        { key: 'giris', label: 'Giriş', tip: 'sayi', toplam: true },
        { key: 'cikis', label: 'Çıkış', tip: 'sayi', toplam: true },
      ],
      satirlar: liste.map((x) => ({
        tarih: trSaat(x.tarih),
        belge: x.belge,
        tur: x.tur,
        urun: x.urun,
        lot: x.lot,
        kaynak: x.kaynak,
        hedef: x.hedef,
        giris: x.giris || null,
        cikis: x.cikis || null,
      })),
      notlar,
    };
  }
  const m = new Map<string, { ad: string; hareket: number; giris: number; cikis: number }>();
  for (const x of liste) {
    const k = gruplama === 'urun' ? String(x.urunId) : x.tur;
    const o = m.get(k) ?? { ad: gruplama === 'urun' ? x.urun : x.tur, hareket: 0, giris: 0, cikis: 0 };
    o.hareket++;
    o.giris += x.giris;
    o.cikis += x.cikis;
    m.set(k, o);
  }
  return {
    kolonlar: [
      { key: 'grup', label: gruplama === 'urun' ? 'Ürün' : 'Hareket türü', tip: 'metin' },
      { key: 'hareket', label: 'Hareket', tip: 'sayi', toplam: true },
      { key: 'giris', label: 'Giriş', tip: 'sayi', toplam: true },
      { key: 'cikis', label: 'Çıkış', tip: 'sayi', toplam: true },
      { key: 'net', label: 'Net', tip: 'sayi', toplam: true },
    ],
    satirlar: [...m.values()]
      .sort((a, b) => b.hareket - a.hareket)
      .map((x) => ({ grup: x.ad, hareket: x.hareket, giris: yuvarla(x.giris, 2), cikis: yuvarla(x.cikis, 2), net: yuvarla(x.giris - x.cikis, 2) })),
    notlar,
  };
}

// ───────────────────────── Cam Stok Matrisi ─────────────────────────

let camGrupOnbellek: { zaman: number; gruplar: string[] } | null = null;
export async function camGruplari(): Promise<string[]> {
  if (camGrupOnbellek && Date.now() - camGrupOnbellek.zaman < 30 * 60 * 1000) return camGrupOnbellek.gruplar;
  const t = (await execute('product.template', 'search_read', [[['categ_id.complete_name', 'ilike', 'STOK CAM']]], {
    fields: ['name'],
    context: { active_test: true },
  })) as { name: string }[];
  const say = new Map<string, number>();
  for (const x of t) {
    const c = camAdCoz(x.name);
    if (c) say.set(c.grup, (say.get(c.grup) ?? 0) + 1);
  }
  const gruplar = [...say.entries()].filter(([, n]) => n >= 3).map(([g]) => g).sort((a, b) => a.localeCompare(b, 'tr'));
  camGrupOnbellek = { zaman: Date.now(), gruplar };
  return gruplar;
}

const derece = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${(Math.abs(n) / 100).toFixed(2)}`;

export async function camStokMatrisi(f: Filtre): Promise<RaporSonuc> {
  if (!f.camGrubu) throw new RaporHatasi('Cam grubunu seçin (ör. Org 1.5).');
  const fo = await fotograf();
  const loklar = new Set(lokasyonSecimi(f));
  const hucre = new Map<string, number>();
  const sphler = new Set<number>();
  const cyller = new Set<number>([0]);
  let toplam = 0;
  for (const q of fo.quantlar) {
    if (!loklar.has(q.lok)) continue;
    const u = fo.urunler.get(q.urunId);
    if (!u) continue;
    const c = camAdCoz(u.tmplAd);
    if (!c || c.grup !== f.camGrubu) continue;
    sphler.add(c.sph);
    cyller.add(c.cyl);
    const k = `${c.sph}|${c.cyl}`;
    hucre.set(k, (hucre.get(k) ?? 0) + q.adet);
    toplam += q.adet;
  }
  const sphSirali = [...sphler].sort((a, b) => b - a);
  const cylSirali = [...cyller].sort((a, b) => b - a);
  const kolonlar: Kolon[] = [
    { key: 'sph', label: 'SPH \\ CYL', tip: 'metin' },
    ...cylSirali.map((c) => ({ key: `C${c}`, label: c === 0 ? '0.00' : derece(c), tip: 'sayi' as const, toplam: true })),
    { key: 'toplam', label: 'Toplam', tip: 'sayi', toplam: true },
  ];
  const satirlar: Satir[] = sphSirali.map((s) => {
    const row: Satir = { sph: s === 0 ? '0.00' : derece(s) };
    let t = 0;
    for (const c of cylSirali) {
      const v = hucre.get(`${s}|${c}`) ?? 0;
      row[`C${c}`] = v || 0;
      t += v;
    }
    row.toplam = t;
    return row;
  });
  return {
    kolonlar,
    satirlar,
    ozet: [
      { ad: 'Toplam cam', deger: yuvarla(toplam, 2), tip: 'sayi' },
      { ad: 'Dolu derece', deger: [...hucre.values()].filter((v) => v > 0).length, tip: 'sayi' },
    ],
    notlar: [
      stokNotu(fo),
      'Satırlar SPH, sütunlar silindir (eksi yazım). 0 olan hücreler: o derecede stok yok. Sadece stoku olan SPH ve silindirler listelenir.',
    ],
  };
}

// ───────────────────────── Karekod Listesi ─────────────────────────

export const KAREKOD_DURUMLARI = [
  { key: 'hepsi', label: 'Hepsi' },
  { key: 'var', label: 'ÜTS karekodu olanlar' },
  { key: 'yok', label: 'ÜTS karekodu olmayanlar' },
];

export async function karekodListesi(f: Filtre): Promise<RaporSonuc> {
  const fo = await fotograf();
  const loklar = new Set(lokasyonSecimi(f));
  const uygun = urunFiltresi({ ...f, ara: undefined });
  const secili = fo.quantlar.filter((q) => loklar.has(q.lok) && uygun(fo.urunler.get(q.urunId)));
  const lotIds = secili.map((q) => q.lotId).filter((x): x is number => !!x);
  const lotlar = new Map(
    (await odooParcaOku<{ id: number; name: string; x_uts_kodu?: string | false }>('stock.lot', lotIds, ['id', 'name', 'x_uts_kodu'])).map((l) => [l.id, l]),
  );
  const durum = f.durum || 'hepsi';
  const araF = f.ara ? buyuk(f.ara) : '';
  const satirlar: Satir[] = [];
  let utsli = 0;
  let utssuz = 0;
  for (const q of secili) {
    const u = fo.urunler.get(q.urunId)!;
    const lot = q.lotId ? lotlar.get(q.lotId) : undefined;
    const uts = typeof lot?.x_uts_kodu === 'string' && lot.x_uts_kodu.trim() ? lot.x_uts_kodu.trim() : '';
    if (uts) utsli += q.adet;
    else utssuz += q.adet;
    if (durum === 'var' && !uts) continue;
    if (durum === 'yok' && uts) continue;
    if (araF && ![u.ad, u.barkod, lot?.name, uts].some((x) => buyuk(x).includes(araF))) continue;
    const gtin = uts.startsWith('01') ? uts.slice(2, 16) : '';
    satirlar.push({
      lokasyon: q.lok,
      kategori: KATEGORI_ADI[u.kategori],
      urun: u.ad,
      barkod: u.barkod,
      lot: lot?.name ?? q.lotAd ?? '',
      uts,
      gtin,
      adet: yuvarla(q.adet, 2),
    });
  }
  satirlar.sort((a, b) => String(a.lokasyon).localeCompare(String(b.lokasyon)) || String(a.urun).localeCompare(String(b.urun), 'tr'));
  return {
    kolonlar: [
      { key: 'lokasyon', label: 'Lokasyon', tip: 'metin' },
      { key: 'kategori', label: 'Kategori', tip: 'metin' },
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'barkod', label: 'Barkod', tip: 'metin' },
      { key: 'lot', label: 'Lot / seri', tip: 'metin' },
      { key: 'uts', label: 'ÜTS karekodu', tip: 'metin' },
      { key: 'gtin', label: 'GTIN', tip: 'metin' },
      { key: 'adet', label: 'Adet', tip: 'sayi', toplam: true },
    ],
    satirlar,
    ozet: [
      { ad: 'Karekodlu adet', deger: yuvarla(utsli, 2), tip: 'sayi' },
      { ad: 'Karekodsuz adet', deger: yuvarla(utssuz, 2), tip: 'sayi' },
    ],
    notlar: [stokNotu(fo), 'Karekodsuz: lotu olmayan ya da lotunda ÜTS kodu yazılı olmayan stok.'],
  };
}
