/**
 * 14.11.2026 — Satın Alma (firma ziyareti) analizi — çerçeve + güneş.
 *
 * Bir markanın modelleri tek listede: yeni sistemdeki varyantlar + eski sistemlerde satılmış modeller.
 *   • Satış (son 12 ay / son 3 ay): eski Odoo (SatisGecmisi) + yeni sistem (POS, canlı).
 *     Eski Odoo satırı, o şubenin POS'taki ilk satış gününden itibaren sayılmaz (çift sayım olmasın).
 *   • 2023-24 satış: Siber (SatisGecmisi).
 *   • Stok: Odoo canlı (tüm konumlar).
 * Modeller kaynaklar arasında "model kökü" ile eşleşir: model kodundaki en uzun rakam dizisi
 * (OTT203 = 203 = 203OO; HW2104 = HW2104HG). Rakamsız modellerde harflerin tamamı.
 *
 * Bu servis HİÇBİR ŞEY YAZMAZ (marka→firma kartı hariç; o da sadece bu programın tablosu).
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const LOC_ID_TO_KOD = new Map(Object.entries(LOKASYON_ID_MAP).map(([k, id]) => [id, k]));
const DEPO = 'ANADEPO';
const GUN = 24 * 3600 * 1000;

export type SaTur = 'OPTIK' | 'GUNES';
export type SaDurum = 'COK_SATAN' | 'TUKENDI' | 'DURGUN' | 'YENI' | 'ESKI' | 'NORMAL';

// ───────────────────────── anahtarlar ─────────────────────────

function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}
function buyuk(s: string): string {
  return String(s ?? '').toLocaleUpperCase('tr-TR').trim();
}
/** Türkçe harf, boşluk ve işaret farkını yok sayan anahtar: "POLO VİLLAGE" → POLOVILLAGE */
export function anahtar(s: string): string {
  return buyuk(s)
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]/g, '');
}
/** Eski sistemlerdeki farklı yazımlar → yeni sistemdeki marka. */
const MARKA_ESLEME: Record<string, string> = {
  BLACK: 'XBLACK',
  OTTOPTIK: 'OTTO',
  PIERRMOSS: 'PYERMOSS',
  GIGIOOMILANO: 'GIGIMILANO',
  ALYSSONSASSO: 'ALYSONSASSO',
  FISHERPRICE: 'FISHERPRICEKIDS',
  BURBERY: 'BURBERRY',
  CALVINKLAIN: 'CALVINKLEIN',
  RAYBANN: 'RAYBAN',
};
export function markaAnahtar(m: string): string {
  const k = anahtar(m);
  return MARKA_ESLEME[k] ?? k;
}
export function modelKok(m: string): string {
  const k = anahtar(m);
  const diziler = k.match(/\d+/g) ?? [];
  let en = '';
  for (const d of diziler) if (d.length > en.length) en = d;
  return en.length >= 2 ? en : k;
}
function turKategoriden(kategori: string): SaTur | null {
  const k = buyuk(kategori);
  if (k.includes('ÇERÇEVE')) return 'OPTIK';
  if (k.includes('GÜNEŞ')) return 'GUNES';
  return null;
}
/** "GUCCI OPTİK ÇERÇEVE" → GUCCI; "ALYSON SASSO OPTİK ÇERÇEVE SP8254PO" → marka + ek model */
function markaVeEk(sablonAdi: string): { marka: string; ek: string } {
  const ad = buyuk(sablonAdi).replace(/^\[[^\]]*\]\s*/, '');
  for (const kelime of ['OPTİK ÇERÇEVE', 'GÜNEŞ GÖZLÜĞÜ']) {
    const i = ad.indexOf(kelime);
    if (i > 0) return { marka: ad.slice(0, i).trim(), ek: ad.slice(i + kelime.length).trim() };
  }
  const g = ad.indexOf('GÜNEŞ');
  if (g > 0) return { marka: ad.slice(0, g).trim(), ek: '' };
  return { marka: ad, ek: '' };
}
function barkodAnahtar(b: string): string {
  return String(b ?? '').replace(/\D/g, '').replace(/^0+/, '');
}
function trGun(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

// ───────────────────────── taban veri (5 dk önbellek) ─────────────────────────

type Varyant = {
  id: number;
  tmplId: number | null;
  sablonAdi: string;
  tur: SaTur;
  marka: string;
  markaKey: string;
  model: string;
  kok: string;
  renk: string;
  olcu: string;
  barkod: string | null;
  fiyat: number;
  maliyet: number;
  aktif: boolean;
};
type PosSatis = { a12: number; a3: number; son: Date | null; lok: Map<string, number> };
type Gecmis = {
  kaynak: string;
  tarih: string;
  lokasyon: string;
  tur: SaTur;
  marka: string;
  markaKey: string;
  model: string;
  kok: string;
  renk: string;
  adet: number;
};
type Taban = {
  varyantlar: Map<number, Varyant>;
  barkodlar: Map<string, number>;
  stok: Map<number, Map<string, number>>;
  ilkGiris: Map<number, string>;
  pos: Map<number, PosSatis>;
  gecmis: Gecmis[];
  posBaslangic: Map<string, string>;
  bugun: string;
  b12: string;
  b3: string;
  zaman: number;
};

let tabanCache: Taban | null = null;
let tabanSoz: Promise<Taban> | null = null;

async function parcaOku<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 2000) {
    const p = ids.slice(i, i + 2000);
    if (p.length) out.push(...((await execute(model, 'read', [p], { fields, ...CTX })) as T[]));
  }
  return out;
}

async function varyantlariOku(): Promise<Map<number, Varyant>> {
  type U = {
    id: number;
    product_tmpl_id: [number, string] | false;
    categ_id: [number, string] | false;
    barcode: string | false;
    lst_price: number;
    standard_price: number;
    active: boolean;
    product_template_attribute_value_ids: number[];
  };
  const urunler = (await execute('product.product', 'search_read', [[
    '|', ['categ_id.complete_name', 'ilike', 'ÇERÇEVE'], ['categ_id.complete_name', 'ilike', 'GÜNEŞ'],
  ]], {
    fields: ['id', 'product_tmpl_id', 'categ_id', 'barcode', 'lst_price', 'standard_price', 'active', 'product_template_attribute_value_ids'],
    limit: 100000,
    ...CTX,
  })) as U[];
  const ptavIds = [...new Set(urunler.flatMap((u) => u.product_template_attribute_value_ids ?? []))];
  const ptav = await parcaOku<{ id: number; attribute_id: [number, string] | false; name: string }>(
    'product.template.attribute.value', ptavIds, ['id', 'attribute_id', 'name'],
  );
  const pm = new Map(ptav.map((p) => [p.id, { attr: buyuk(m2oAd(p.attribute_id)), deger: String(p.name ?? '').trim() }]));
  const out = new Map<number, Varyant>();
  for (const u of urunler) {
    const tur = turKategoriden(m2oAd(u.categ_id));
    if (!tur) continue;
    const sablonAdi = m2oAd(u.product_tmpl_id);
    const { marka, ek } = markaVeEk(sablonAdi);
    let model = '';
    let renk = '';
    let olcu = '';
    for (const id of u.product_template_attribute_value_ids ?? []) {
      const p = pm.get(id);
      if (!p) continue;
      if (p.attr.startsWith('MODEL')) model = p.deger;
      else if (p.attr.startsWith('RENK')) renk = p.deger;
      else if (p.attr.startsWith('ÖLÇÜ') || p.attr.startsWith('OLCU')) olcu = p.deger;
    }
    if (!model && ek) model = ek.split(/\s+/)[0];
    if (!marka || !model) continue;
    out.set(u.id, {
      id: u.id,
      tmplId: m2oId(u.product_tmpl_id),
      sablonAdi,
      tur,
      marka,
      markaKey: markaAnahtar(marka),
      model: buyuk(model),
      kok: modelKok(model),
      renk: buyuk(renk),
      olcu,
      barkod: typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : null,
      fiyat: Number(u.lst_price ?? 0),
      maliyet: Number(u.standard_price ?? 0),
      aktif: u.active !== false,
    });
  }
  return out;
}

async function tabanOlustur(): Promise<Taban> {
  const simdi = new Date();
  const bugun = trGun(simdi);
  const b12 = trGun(new Date(simdi.getTime() - 365 * GUN));
  const b3 = trGun(new Date(simdi.getTime() - 90 * GUN));

  const varyantlar = await varyantlariOku();
  const barkodlar = new Map<string, number>();
  for (const v of varyantlar.values()) if (v.barkod) barkodlar.set(barkodAnahtar(v.barkod), v.id);

  // Stok + ilk giriş (tüm konumlar)
  type Q = { product_id: [number, string] | false; location_id: [number, string] | false; quantity: number; in_date: string | false };
  const ids = [...varyantlar.keys()];
  const stok = new Map<number, Map<string, number>>();
  const ilkGiris = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 5000) {
    const q = (await execute('stock.quant', 'search_read', [[
      ['product_id', 'in', ids.slice(i, i + 5000)],
      ['quantity', '>', 0],
      ['location_id', 'in', Object.values(LOKASYON_ID_MAP)],
    ]], { fields: ['product_id', 'location_id', 'quantity', 'in_date'], limit: 200000, ...CTX })) as Q[];
    for (const x of q) {
      const pid = m2oId(x.product_id);
      const kod = LOC_ID_TO_KOD.get(m2oId(x.location_id) ?? -1);
      if (!pid || !kod) continue;
      const m = stok.get(pid) ?? new Map<string, number>();
      m.set(kod, (m.get(kod) ?? 0) + Number(x.quantity ?? 0));
      stok.set(pid, m);
      if (x.in_date) {
        const g = String(x.in_date).slice(0, 10);
        const e = ilkGiris.get(pid);
        if (!e || g < e) ilkGiris.set(pid, g);
      }
    }
  }

  // Yeni sistem (POS) satışları — son 12 ay
  const subeler = await prisma.branch.findMany({ select: { id: true, code: true } });
  const subeKod = new Map(subeler.map((s) => [s.id, s.code ?? '']));
  const kalemler = await prisma.saleItem.findMany({
    where: {
      odooProductId: { not: null },
      sale: { status: { notIn: ['DRAFT', 'VOID'] }, createdAt: { gte: new Date(`${b12}T00:00:00+03:00`) } },
    },
    select: { odooProductId: true, qty: true, sale: { select: { createdAt: true, branchId: true } } },
  });
  const pos = new Map<number, PosSatis>();
  for (const k of kalemler) {
    const id = Number(k.odooProductId);
    if (!varyantlar.has(id)) continue;
    const adet = Math.max(0, Number(k.qty ?? 0));
    const o = pos.get(id) ?? { a12: 0, a3: 0, son: null, lok: new Map<string, number>() };
    o.a12 += adet;
    if (trGun(k.sale.createdAt) >= b3) o.a3 += adet;
    if (!o.son || k.sale.createdAt > o.son) o.son = k.sale.createdAt;
    const kod = subeKod.get(k.sale.branchId) || '?';
    o.lok.set(kod, (o.lok.get(kod) ?? 0) + adet);
    pos.set(id, o);
  }

  // Şubelerin POS'taki ilk satış günü (eski Odoo satırları bu günden itibaren sayılmaz)
  const ilkler = await prisma.sale.groupBy({
    by: ['branchId'],
    where: { status: { notIn: ['DRAFT', 'VOID'] } },
    _min: { createdAt: true },
  });
  const posBaslangic = new Map<string, string>();
  for (const x of ilkler) {
    const kod = subeKod.get(x.branchId);
    if (kod && x._min.createdAt) posBaslangic.set(kod, trGun(x._min.createdAt));
  }

  const ham = await prisma.satisGecmisi.findMany({
    select: { kaynak: true, tarih: true, lokasyon: true, tur: true, marka: true, model: true, renk: true, adet: true },
  });
  const gecmis: Gecmis[] = [];
  for (const g of ham) {
    const tarih = g.tarih.toISOString().slice(0, 10);
    if (g.kaynak === 'ESKI_ODOO') {
      const pb = posBaslangic.get(g.lokasyon);
      if (pb && tarih >= pb) continue;
    }
    gecmis.push({
      kaynak: g.kaynak,
      tarih,
      lokasyon: g.lokasyon,
      tur: g.tur === 'GUNES' ? 'GUNES' : 'OPTIK',
      marka: g.marka,
      markaKey: markaAnahtar(g.marka),
      model: g.model,
      kok: modelKok(g.model),
      renk: buyuk(g.renk),
      adet: g.adet,
    });
  }

  return { varyantlar, barkodlar, stok, ilkGiris, pos, gecmis, posBaslangic, bugun, b12, b3, zaman: Date.now() };
}

async function taban(yenile = false): Promise<Taban> {
  if (!yenile && tabanCache && Date.now() - tabanCache.zaman < 5 * 60 * 1000) return tabanCache;
  if (!tabanSoz) {
    tabanSoz = tabanOlustur()
      .then((t) => { tabanCache = t; return t; })
      .finally(() => { tabanSoz = null; });
  }
  return tabanSoz;
}

function stokToplam(m: Map<string, number> | undefined): number {
  let s = 0;
  for (const v of m?.values() ?? []) s += v;
  return s;
}

// ───────────────────────── marka listesi ─────────────────────────

export type SaMarka = {
  marka: string;
  markaKey: string;
  turler: SaTur[];
  stok: number;
  satis12: number;
  siber: number;
  modelSayisi: number;
  tedarikciId: number | null;
  tedarikciAdi: string | null;
  faturaFirma: string | null;
  temsilci: string | null;
  telefon: string | null;
  ziyaretDonemi: string | null;
  aciklama: string | null;
};

async function markaKartlari() {
  const kartlar = await prisma.markaTedarikci.findMany();
  return new Map(kartlar.map((k) => [markaAnahtar(k.marka), k]));
}

export async function markaListesi(yenile = false): Promise<{ data: SaMarka[]; posBaslangic: Record<string, string>; zaman: string }> {
  const t = await taban(yenile);
  const kart = await markaKartlari();
  const m = new Map<string, { ad: Map<string, number>; tur: Set<SaTur>; stok: number; s12: number; sib: number; modeller: Set<string> }>();
  const al = (key: string) => {
    let x = m.get(key);
    if (!x) { x = { ad: new Map(), tur: new Set(), stok: 0, s12: 0, sib: 0, modeller: new Set() }; m.set(key, x); }
    return x;
  };
  for (const v of t.varyantlar.values()) {
    const st = stokToplam(t.stok.get(v.id));
    const ps = t.pos.get(v.id)?.a12 ?? 0;
    if (!v.aktif && !st && !ps) continue;
    const x = al(v.markaKey);
    x.ad.set(v.marka, (x.ad.get(v.marka) ?? 0) + 1000); // yeni sistemdeki ad öncelikli
    x.tur.add(v.tur);
    x.stok += st;
    x.s12 += ps;
    x.modeller.add(`${v.tur}|${v.kok}`);
  }
  for (const g of t.gecmis) {
    const x = al(g.markaKey);
    x.ad.set(g.marka, (x.ad.get(g.marka) ?? 0) + 1);
    x.tur.add(g.tur);
    if (g.kaynak === 'SIBER') x.sib += g.adet;
    else if (g.tarih >= t.b12) x.s12 += g.adet;
    x.modeller.add(`${g.tur}|${g.kok}`);
  }
  const data: SaMarka[] = [];
  for (const [key, x] of m) {
    const ad = [...x.ad.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
    const k = kart.get(key);
    data.push({
      marka: ad,
      markaKey: key,
      turler: [...x.tur].sort(),
      stok: Math.round(x.stok),
      satis12: Math.round(x.s12),
      siber: Math.round(x.sib),
      modelSayisi: x.modeller.size,
      tedarikciId: k?.tedarikciId ?? null,
      tedarikciAdi: k?.tedarikciAdi ?? null,
      faturaFirma: k?.faturaFirma ?? null,
      temsilci: k?.temsilci ?? null,
      telefon: k?.telefon ?? null,
      ziyaretDonemi: k?.ziyaretDonemi ?? null,
      aciklama: k?.aciklama ?? null,
    });
  }
  data.sort((a, b) => b.satis12 - a.satis12 || b.stok - a.stok || b.siber - a.siber || a.marka.localeCompare(b.marka, 'tr'));
  return { data, posBaslangic: Object.fromEntries(t.posBaslangic), zaman: new Date(t.zaman).toISOString() };
}

// ───────────────────────── marka analizi ─────────────────────────

export type SaVaryant = {
  id: number;
  renk: string;
  olcu: string;
  barkod: string | null;
  aktif: boolean;
  stok: number;
  depo: number;
  lokasyonlar: Record<string, number>;
  satis12: number;
  fiyat: number;
  maliyet: number;
};
export type SaRenk = { renk: string; stok: number; satis12: number; siber: number; sistemde: boolean };
export type SaModel = {
  anahtar: string;
  tur: SaTur;
  model: string;
  digerYazimlar: string[];
  sistemde: boolean;
  sablonAdi: string | null;
  varyantlar: SaVaryant[];
  renkler: SaRenk[];
  stok: number;
  depo: number;
  magaza: number;
  satis12: number;
  satis3: number;
  siber: number;
  satisLokasyon: Record<string, number>;
  sonSatis: string | null;
  ilkGiris: string | null;
  fiyat: number | null;
  maliyet: number | null;
  durum: SaDurum;
};

function durumBul(r: { stok: number; satis12: number; siber: number; ilkGiris: string | null }, bugun: string): SaDurum {
  if (r.stok <= 0 && r.satis12 > 0) return 'TUKENDI';
  if (r.satis12 >= 3 && r.satis12 >= r.stok) return 'COK_SATAN';
  if (r.stok > 0 && r.satis12 === 0) {
    if (r.ilkGiris && (new Date(bugun).getTime() - new Date(r.ilkGiris).getTime()) / GUN <= 60) return 'YENI';
    return 'DURGUN';
  }
  if (r.stok <= 0 && r.satis12 === 0 && r.siber > 0) return 'ESKI';
  return 'NORMAL';
}

export async function markaAnalizi(markaGirdi: string): Promise<{
  marka: string;
  markaKey: string;
  kart: SaMarka | null;
  modeller: SaModel[];
  donem: { b12: string; b3: string; bugun: string };
  posBaslangic: Record<string, string>;
}> {
  const key = markaAnahtar(markaGirdi);
  if (!key) throw new Error('Marka seçin');
  const t = await taban();

  type Top = {
    tur: SaTur;
    kok: string;
    adlar: Map<string, number>;
    sistemAdi: string | null;
    sablonAdi: string | null;
    varyantlar: Varyant[];
    renk: Map<string, { ad: string; stok: number; s12: number; sib: number; sistemde: boolean }>;
    s12: number;
    s3: number;
    sib: number;
    lok: Map<string, number>;
    son: string | null;
  };
  const top = new Map<string, Top>();
  const al = (tur: SaTur, kok: string) => {
    const k = `${tur}|${kok}`;
    let x = top.get(k);
    if (!x) {
      x = { tur, kok, adlar: new Map(), sistemAdi: null, sablonAdi: null, varyantlar: [], renk: new Map(), s12: 0, s3: 0, sib: 0, lok: new Map(), son: null };
      top.set(k, x);
    }
    return x;
  };
  const renkAl = (x: Top, renk: string) => {
    const rk = anahtar(renk) || '-';
    let r = x.renk.get(rk);
    if (!r) { r = { ad: renk || '-', stok: 0, s12: 0, sib: 0, sistemde: false }; x.renk.set(rk, r); }
    return r;
  };

  let markaAdi = '';
  for (const v of t.varyantlar.values()) {
    if (v.markaKey !== key) continue;
    markaAdi = markaAdi || v.marka;
    const x = al(v.tur, v.kok);
    x.varyantlar.push(v);
    x.sistemAdi = x.sistemAdi ?? v.model;
    x.sablonAdi = x.sablonAdi ?? v.sablonAdi;
    const st = stokToplam(t.stok.get(v.id));
    const p = t.pos.get(v.id);
    const r = renkAl(x, v.renk);
    r.sistemde = true;
    r.stok += st;
    if (p) {
      r.s12 += p.a12;
      x.s12 += p.a12;
      x.s3 += p.a3;
      for (const [l, a] of p.lok) x.lok.set(l, (x.lok.get(l) ?? 0) + a);
      const s = p.son ? trGun(p.son) : null;
      if (s && (!x.son || s > x.son)) x.son = s;
    }
  }
  for (const g of t.gecmis) {
    if (g.markaKey !== key) continue;
    markaAdi = markaAdi || g.marka;
    const x = al(g.tur, g.kok);
    x.adlar.set(g.model, (x.adlar.get(g.model) ?? 0) + g.adet);
    const r = renkAl(x, g.renk);
    if (g.kaynak === 'SIBER') {
      x.sib += g.adet;
      r.sib += g.adet;
    } else if (g.tarih >= t.b12) {
      x.s12 += g.adet;
      r.s12 += g.adet;
      if (g.tarih >= t.b3) x.s3 += g.adet;
      x.lok.set(g.lokasyon, (x.lok.get(g.lokasyon) ?? 0) + g.adet);
    }
    if (!x.son || g.tarih > x.son) x.son = g.tarih;
  }

  const modeller: SaModel[] = [];
  for (const [k, x] of top) {
    const varyantlar: SaVaryant[] = x.varyantlar.map((v) => {
      const sm = t.stok.get(v.id);
      return {
        id: v.id,
        renk: v.renk,
        olcu: v.olcu,
        barkod: v.barkod,
        aktif: v.aktif,
        stok: Math.round(stokToplam(sm)),
        depo: Math.round(sm?.get(DEPO) ?? 0),
        lokasyonlar: Object.fromEntries([...(sm ?? new Map<string, number>())].map(([a, b]) => [a, Math.round(b)])),
        satis12: Math.round(t.pos.get(v.id)?.a12 ?? 0),
        fiyat: v.fiyat,
        maliyet: v.maliyet,
      };
    });
    const stok = varyantlar.reduce((a, v) => a + v.stok, 0);
    const depo = varyantlar.reduce((a, v) => a + v.depo, 0);
    // Sistemde olmayan, stoğu ve satışı olmayan pasif varyantları listede gösterme
    const gorunur = varyantlar.filter((v) => v.aktif || v.stok > 0 || v.satis12 > 0);
    let ilk: string | null = null;
    for (const v of x.varyantlar) {
      const g = t.ilkGiris.get(v.id);
      if (g && (!ilk || g < ilk)) ilk = g;
    }
    const tarihceAdlari = [...x.adlar.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
    const model = x.sistemAdi ?? tarihceAdlari[0] ?? x.kok;
    const fiyatlar = gorunur.map((v) => v.fiyat).filter((f) => f > 0);
    const maliyetler = gorunur.map((v) => v.maliyet).filter((f) => f > 0);
    const satis12 = Math.round(x.s12);
    const siber = Math.round(x.sib);
    if (!gorunur.length && satis12 === 0 && siber === 0) continue;
    modeller.push({
      anahtar: k,
      tur: x.tur,
      model,
      digerYazimlar: tarihceAdlari.filter((a) => a !== model).slice(0, 5),
      sistemde: gorunur.length > 0,
      sablonAdi: x.sablonAdi,
      varyantlar: gorunur.sort((a, b) => a.renk.localeCompare(b.renk, 'tr') || a.olcu.localeCompare(b.olcu, 'tr')),
      renkler: [...x.renk.values()]
        .map((r) => ({ renk: r.ad, stok: Math.round(r.stok), satis12: Math.round(r.s12), siber: Math.round(r.sib), sistemde: r.sistemde }))
        .filter((r) => r.sistemde || r.satis12 > 0 || r.siber > 0)
        .sort((a, b) => b.satis12 - a.satis12 || b.stok - a.stok || b.siber - a.siber),
      stok,
      depo,
      magaza: stok - depo,
      satis12,
      satis3: Math.round(x.s3),
      siber,
      satisLokasyon: Object.fromEntries([...x.lok].map(([a, b]) => [a, Math.round(b)])),
      sonSatis: x.son,
      ilkGiris: ilk,
      fiyat: fiyatlar.length ? Math.max(...fiyatlar) : null,
      maliyet: maliyetler.length ? Math.max(...maliyetler) : null,
      durum: durumBul({ stok, satis12, siber, ilkGiris: ilk }, t.bugun),
    });
  }
  modeller.sort((a, b) => b.satis12 - a.satis12 || b.stok - a.stok || b.siber - a.siber || a.model.localeCompare(b.model, 'tr'));

  const liste = await markaListesi();
  const kart = liste.data.find((m) => m.markaKey === key) ?? null;
  return {
    marka: kart?.marka ?? markaAdi ?? markaGirdi,
    markaKey: key,
    kart,
    modeller,
    donem: { b12: t.b12, b3: t.b3, bugun: t.bugun },
    posBaslangic: Object.fromEntries(t.posBaslangic),
  };
}

// ───────────────────────── numune okutma ─────────────────────────

/** Barkod / UTS karekodu (01 + GTIN) → varyant. Bulunamazsa null (ekran metin aramasına düşer). */
export async function okut(kod: string): Promise<{ markaKey: string; marka: string; anahtar: string; varyantId: number } | null> {
  const t = await taban();
  const ham = String(kod ?? '').replace(/[\s\u001d]/g, '');
  const adaylar: string[] = [];
  const m = /^01(\d{14})/.exec(ham);
  if (m) adaylar.push(m[1]);
  adaylar.push(ham);
  for (const a of adaylar) {
    const id = t.barkodlar.get(barkodAnahtar(a));
    const v = id ? t.varyantlar.get(id) : undefined;
    if (v) return { markaKey: v.markaKey, marka: v.marka, anahtar: `${v.tur}|${v.kok}`, varyantId: v.id };
  }
  return null;
}

// ───────────────────────── marka → firma kartı ─────────────────────────

export async function markaKartKaydet(g: {
  marka: string;
  tedarikciId?: number | null;
  tedarikciAdi?: string | null;
  temsilci?: string | null;
  telefon?: string | null;
  ziyaretDonemi?: string | null;
  aciklama?: string | null;
}) {
  const marka = buyuk(g.marka).slice(0, 120);
  if (!marka) throw new Error('Marka boş olamaz');
  const key = markaAnahtar(marka);
  // Aynı markanın farklı yazımıyla açılmış kart varsa onu güncelle
  const mevcut = (await prisma.markaTedarikci.findMany()).find((k) => markaAnahtar(k.marka) === key);
  const temiz = (s: unknown, n: number) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
  const data = {
    tedarikciId: g.tedarikciId ? Number(g.tedarikciId) : null,
    tedarikciAdi: temiz(g.tedarikciAdi, 300),
    temsilci: temiz(g.temsilci, 200),
    telefon: temiz(g.telefon, 60),
    ziyaretDonemi: temiz(g.ziyaretDonemi, 200),
    aciklama: temiz(g.aciklama, 500),
  };
  if (mevcut) return prisma.markaTedarikci.update({ where: { marka: mevcut.marka }, data });
  return prisma.markaTedarikci.create({ data: { marka, ...data } });
}
