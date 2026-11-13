/**
 * 13.11.2026 — Etiket Merkezi: etiket basılacak FİZİKSEL ürünleri (lot) bulma.
 *
 * Kapsam: yalnızca Optik Çerçeve ve Güneş Gözlüğü (cam/lens/solüsyona etiket basılmaz).
 * Her satır = stokta duran bir lot (= bir etiket). Bilgiler Odoo'dan canlı okunur.
 *
 * Akış:
 *  1) "Taban" küme Odoo'dan çekilir (konum + tür + giriş tarihi) ve 2 dk önbelleğe alınır —
 *     aynı tabanla marka/model değiştirip tekrar Ara'ya basmak anlık olur.
 *  2) Diğer tüm filtreler (marka/model/renk/ölçü, grup, fiyat, UTS, parti, kaynak, etiket durumu,
 *     arama kelimeleri) bellekte uygulanır.
 *  3) Bağlı açılır listeler için "kombinasyonlar" (marka+model+renk+ölçü → adet) döner; ekran
 *     listeleri sunucuya gitmeden daraltır.
 *
 * Maliyet hiçbir yerde okunmaz/dönülmez.
 */
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import { sonBasimlarLot, sonBasimlarVaryant, type SonBasim } from '../etiket/etiket-basim.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const LOC_ID_TO_KOD = new Map(Object.entries(LOKASYON_ID_MAP).map(([kod, id]) => [id, kod]));

export type EtiketTur = 'CERCEVE' | 'GUNES';
export type EtiketGrup = 'ALT' | 'ORTA' | 'ORTA ÜST' | 'ÜST' | '';
export type EtiketKaynak = 'ENVANTER' | 'TRANSFER' | 'ALIM' | 'IADE' | 'DIGER';

export type EtiketSatir = {
  key: string;
  quantId: number;
  lotId: number | null;
  lotAdi: string | null;
  utsKodu: string | null;
  varyantId: number;
  tmplId: number | null;
  sablonAdi: string;
  urunAdi: string;
  marka: string;
  model: string;
  renk: string;
  olcu: string;
  tur: EtiketTur;
  grup: EtiketGrup;
  kategori: string;
  barkod: string | null;
  fiyat: number;
  lokasyon: string;
  adet: number;
  girisTarihi: string | null;
  parti: string | null;
  kaynak?: EtiketKaynak;
  sonBasim: { basildi: string; fiyat: number | null; kaynak: string } | null;
};

export type EtiketMerkeziFiltre = {
  lokasyonlar?: string[];
  tur?: EtiketTur | '';
  girisBas?: string; // YYYY-MM-DD
  girisBit?: string;
  q?: string;
  marka?: string;
  model?: string;
  renk?: string;
  olcu?: string;
  gruplar?: EtiketGrup[];
  fiyatMin?: number | null;
  fiyatMax?: number | null;
  uts?: 'var' | 'yok' | '';
  barkod?: 'var' | 'yok' | '';
  parti?: string;
  kaynak?: EtiketKaynak | '';
  etiket?: 'hic' | 'fiyat' | 'once' | 'aralik' | '';
  etiketBas?: string;
  etiketBit?: string;
  /** "Son aktarım partisi" hazır düğmesi: parti = tabandaki en yeni parti */
  sonParti?: boolean;
};

export type Kombinasyon = { marka: string; model: string; renk: string; olcu: string; adet: number };

export type EtiketAraSonuc = {
  satirlar: EtiketSatir[];
  toplam: number;
  kesildi: boolean;
  kombinasyonlar: Kombinasyon[];
  partiler: { parti: string; etiket: string; adet: number }[];
  tabanAdet: number;
  uygulananParti: string | null;
};

const SONUC_SINIRI = 3000;

// ───────────────────────── yardımcılar ─────────────────────────

function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}
function buyuk(s: string): string {
  return s.toLocaleUpperCase('tr-TR').trim();
}
/** Aramada Türkçe harf/boşluk farkını yok say. */
function sade(s: string): string {
  return buyuk(s)
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ');
}

const TUR_ANAHTAR: Array<{ tur: EtiketTur; kelime: string }> = [
  { tur: 'CERCEVE', kelime: 'OPTİK ÇERÇEVE' },
  { tur: 'GUNES', kelime: 'GÜNEŞ GÖZLÜĞÜ' },
];

function turBul(kategori: string): EtiketTur | null {
  const k = buyuk(kategori);
  if (k.includes('ÇERÇEVE')) return 'CERCEVE';
  if (k.includes('GÜNEŞ')) return 'GUNES';
  return null;
}

function grupBul(kategori: string): EtiketGrup {
  const son = buyuk(kategori.split('/').pop() ?? '').replace(/\s*GRUP$/, '').trim();
  if (son === 'ALT') return 'ALT';
  if (son === 'ORTA') return 'ORTA';
  if (son === 'ORTA ÜST') return 'ORTA ÜST';
  if (son === 'ÜST') return 'ÜST';
  return '';
}

/** "GUCCI OPTİK ÇERÇEVE" → marka GUCCI; "ALYSON SASSO OPTİK ÇERÇEVE SP8254PO" → marka + ek (model). */
function markaVeEk(sablonAdi: string): { marka: string; ek: string } {
  const ad = buyuk(sablonAdi).replace(/^\[[^\]]*\]\s*/, '');
  for (const { kelime } of TUR_ANAHTAR) {
    const i = ad.indexOf(kelime);
    if (i > 0) return { marka: ad.slice(0, i).trim(), ek: ad.slice(i + kelime.length).trim() };
  }
  const g = ad.indexOf('GÜNEŞ');
  if (g > 0) return { marka: ad.slice(0, g).trim(), ek: '' };
  return { marka: ad, ek: '' };
}

/** "GRS-13112026-EXC6531-017" → parti "GRS-13112026-EXC6531", etiket "13.11.2026 · EXC6531" */
function partiBul(lotAdi: string | null): { parti: string; etiket: string } | null {
  const m = /^GRS-(\d{2})(\d{2})(\d{4})-([A-Z0-9]+)/.exec(lotAdi ?? '');
  if (!m) return null;
  return { parti: `GRS-${m[1]}${m[2]}${m[3]}-${m[4]}`, etiket: `${m[1]}.${m[2]}.${m[3]} · ${m[4]}` };
}

function utsNormal(kod: string): string {
  return kod.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function trTarih(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

// ───────────────────────── Odoo'dan satır üretme ─────────────────────────

type QuantKaydi = {
  id: number;
  product_id: [number, string] | false;
  lot_id: [number, string] | false;
  location_id: [number, string] | false;
  quantity: number;
  in_date: string | false;
};

async function parcaParcaOku<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 2000) {
    const parca = ids.slice(i, i + 2000);
    if (!parca.length) continue;
    const r = (await execute(model, 'read', [parca], { fields, ...CTX })) as T[];
    out.push(...r);
  }
  return out;
}

async function quantlardanSatir(quantlar: QuantKaydi[]): Promise<EtiketSatir[]> {
  const urunIds = [...new Set(quantlar.map((q) => m2oId(q.product_id)).filter((x): x is number => !!x))];
  const lotIds = [...new Set(quantlar.map((q) => m2oId(q.lot_id)).filter((x): x is number => !!x))];

  type Urun = {
    id: number;
    product_tmpl_id: [number, string] | false;
    barcode: string | false;
    lst_price: number;
    categ_id: [number, string] | false;
    product_template_attribute_value_ids: number[];
  };
  const urunler = await parcaParcaOku<Urun>('product.product', urunIds, [
    'id', 'product_tmpl_id', 'barcode', 'lst_price', 'categ_id', 'product_template_attribute_value_ids',
  ]);
  const ptavIds = [...new Set(urunler.flatMap((u) => u.product_template_attribute_value_ids ?? []))];
  type Ptav = { id: number; attribute_id: [number, string] | false; name: string };
  const ptavlar = await parcaParcaOku<Ptav>('product.template.attribute.value', ptavIds, ['id', 'attribute_id', 'name']);
  const ptavMap = new Map(ptavlar.map((p) => [p.id, { attr: buyuk(m2oAd(p.attribute_id)), deger: String(p.name ?? '').trim() }]));

  type Lot = { id: number; name: string; x_uts_kodu?: string | false };
  let lotlar: Lot[] = [];
  try {
    lotlar = await parcaParcaOku<Lot>('stock.lot', lotIds, ['id', 'name', 'x_uts_kodu']);
  } catch {
    lotlar = await parcaParcaOku<Lot>('stock.lot', lotIds, ['id', 'name']);
  }
  const lotMap = new Map(lotlar.map((l) => [l.id, l]));
  const urunMap = new Map(urunler.map((u) => [u.id, u]));

  const satirlar: EtiketSatir[] = [];
  for (const q of quantlar) {
    const uid = m2oId(q.product_id);
    const u = uid ? urunMap.get(uid) : undefined;
    if (!u) continue;
    const kategori = m2oAd(u.categ_id);
    const tur = turBul(kategori);
    if (!tur) continue;
    const sablonAdi = m2oAd(u.product_tmpl_id);
    const { marka, ek } = markaVeEk(sablonAdi);
    let model = '';
    let renk = '';
    let olcu = '';
    for (const pid of u.product_template_attribute_value_ids ?? []) {
      const p = ptavMap.get(pid);
      if (!p) continue;
      if (p.attr.startsWith('MODEL')) model = p.deger;
      else if (p.attr.startsWith('RENK')) renk = p.deger;
      else if (p.attr.startsWith('ÖLÇÜ') || p.attr.startsWith('OLCU')) olcu = p.deger;
    }
    if (!model && ek) model = ek;
    const lotId = m2oId(q.lot_id);
    const lot = lotId ? lotMap.get(lotId) : undefined;
    const lotAdi = lot?.name ?? (m2oAd(q.lot_id) || null);
    const uts = lot && typeof lot.x_uts_kodu === 'string' && lot.x_uts_kodu.trim() ? lot.x_uts_kodu.trim() : null;
    const locId = m2oId(q.location_id);
    const p = partiBul(lotAdi);
    const nitelik = [model, renk, olcu].filter(Boolean).join(' / ');
    satirlar.push({
      key: `q${q.id}`,
      quantId: q.id,
      lotId: lotId ?? null,
      lotAdi,
      utsKodu: uts,
      varyantId: u.id,
      tmplId: m2oId(u.product_tmpl_id),
      sablonAdi,
      urunAdi: nitelik ? `${sablonAdi} (${nitelik})` : sablonAdi,
      marka,
      model,
      renk,
      olcu,
      tur,
      grup: grupBul(kategori),
      kategori,
      barkod: typeof u.barcode === 'string' && u.barcode.trim() ? u.barcode.trim() : null,
      fiyat: Number(u.lst_price ?? 0),
      lokasyon: (locId && LOC_ID_TO_KOD.get(locId)) || m2oAd(q.location_id),
      adet: Math.max(1, Math.round(Number(q.quantity ?? 1))),
      girisTarihi: q.in_date ? trTarih(new Date(`${String(q.in_date).replace(' ', 'T')}Z`)) : null,
      parti: p?.parti ?? null,
      sonBasim: null,
    });
  }
  return satirlar;
}

async function sonBasimEkle(satirlar: EtiketSatir[]): Promise<void> {
  const lotMap = await sonBasimlarLot(satirlar.map((s) => s.lotId ?? 0));
  const lotsuz = satirlar.filter((s) => !s.lotId).map((s) => s.varyantId);
  const varMap = lotsuz.length ? await sonBasimlarVaryant(lotsuz) : new Map<number, SonBasim>();
  for (const s of satirlar) {
    const b = s.lotId ? lotMap.get(s.lotId) : varMap.get(s.varyantId);
    s.sonBasim = b ? { basildi: b.basildi.toISOString(), fiyat: b.fiyat, kaynak: b.kaynak } : null;
  }
}

// ───────────────────────── taban küme + önbellek ─────────────────────────

const KATEGORI_DOMAIN: unknown[] = [
  '|',
  ['product_id.categ_id.complete_name', 'ilike', 'ÇERÇEVE'],
  ['product_id.categ_id.complete_name', 'ilike', 'GÜNEŞ'],
];

function lokasyonIdleri(kodlar?: string[]): number[] {
  const secili = (kodlar ?? []).map((k) => LOKASYON_ID_MAP[k]).filter((x): x is number => !!x);
  return secili.length ? secili : Object.values(LOKASYON_ID_MAP);
}

type TabanKayit = { t: number; satirlar: EtiketSatir[]; kaynakHazir: boolean };
const tabanOnbellek = new Map<string, TabanKayit>();
const ONBELLEK_SURE_MS = 2 * 60 * 1000;

async function tabanKume(f: EtiketMerkeziFiltre): Promise<TabanKayit> {
  const anahtar = JSON.stringify([
    [...(f.lokasyonlar ?? [])].sort(), f.tur ?? '', f.girisBas ?? '', f.girisBit ?? '',
  ]);
  const eski = tabanOnbellek.get(anahtar);
  if (eski && Date.now() - eski.t < ONBELLEK_SURE_MS) return eski;

  const domain: unknown[] = [
    ['quantity', '>', 0],
    ['location_id', 'in', lokasyonIdleri(f.lokasyonlar)],
  ];
  if (f.tur === 'CERCEVE') domain.push(['product_id.categ_id.complete_name', 'ilike', 'ÇERÇEVE']);
  else if (f.tur === 'GUNES') domain.push(['product_id.categ_id.complete_name', 'ilike', 'GÜNEŞ']);
  else domain.push(...KATEGORI_DOMAIN);
  // Giriş tarihleri Türkiye saatine göre gün başı/sonu (Odoo UTC saklar).
  if (f.girisBas && /^\d{4}-\d{2}-\d{2}$/.test(f.girisBas)) {
    domain.push(['in_date', '>=', new Date(`${f.girisBas}T00:00:00+03:00`).toISOString().slice(0, 19).replace('T', ' ')]);
  }
  if (f.girisBit && /^\d{4}-\d{2}-\d{2}$/.test(f.girisBit)) {
    domain.push(['in_date', '<=', new Date(`${f.girisBit}T23:59:59+03:00`).toISOString().slice(0, 19).replace('T', ' ')]);
  }
  const quantlar = (await execute('stock.quant', 'search_read', [domain], {
    fields: ['id', 'product_id', 'lot_id', 'location_id', 'quantity', 'in_date'],
    limit: 40000,
    ...CTX,
  })) as QuantKaydi[];
  const satirlar = await quantlardanSatir(quantlar);
  const kayit: TabanKayit = { t: Date.now(), satirlar, kaynakHazir: false };
  tabanOnbellek.set(anahtar, kayit);
  if (tabanOnbellek.size > 8) {
    const enEski = [...tabanOnbellek.entries()].sort((a, b) => a[1].t - b[1].t)[0];
    if (enEski) tabanOnbellek.delete(enEski[0]);
  }
  return kayit;
}

/** Lotun bulunduğu konuma SON NEREDEN geldiği (stok hareketinden). Sadece Kaynak filtresi seçilince. */
async function kaynakEkle(kayit: TabanKayit): Promise<void> {
  if (kayit.kaynakHazir) return;
  const lotluSatir = kayit.satirlar.filter((s) => s.lotId);
  const hedef = new Map<number, EtiketSatir[]>();
  for (const s of lotluSatir) {
    const l = hedef.get(s.lotId!) ?? [];
    l.push(s);
    hedef.set(s.lotId!, l);
  }
  const lotIds = [...hedef.keys()];
  type Ml = { lot_id: [number, string] | false; location_id: [number, string] | false; location_dest_id: [number, string] | false; date: string };
  const sonHareket = new Map<string, string>(); // lotId|destLocId → kaynak konum adı (en yeni)
  for (let i = 0; i < lotIds.length; i += 1500) {
    const parca = lotIds.slice(i, i + 1500);
    const ml = (await execute('stock.move.line', 'search_read', [[
      ['lot_id', 'in', parca],
      ['state', '=', 'done'],
    ]], { fields: ['lot_id', 'location_id', 'location_dest_id', 'date'], order: 'date desc', ...CTX })) as Ml[];
    for (const m of ml) {
      const k = `${m2oId(m.lot_id)}|${m2oId(m.location_dest_id)}`;
      if (!sonHareket.has(k)) sonHareket.set(k, m2oAd(m.location_id));
    }
  }
  const tamAd = new Map<string, number>(Object.entries(LOKASYON_ID_MAP));
  for (const s of lotluSatir) {
    const locId = tamAd.get(s.lokasyon) ?? null;
    const kaynakAdi = buyuk(sonHareket.get(`${s.lotId}|${locId}`) ?? '');
    s.kaynak = !kaynakAdi ? 'DIGER'
      : kaynakAdi.includes('INVENTORY') || kaynakAdi.includes('ENVANTER') || kaynakAdi.includes('SAYIM') ? 'ENVANTER'
        : kaynakAdi.includes('VENDOR') || kaynakAdi.includes('TEDARİK') || kaynakAdi.includes('SUPPLIER') ? 'ALIM'
          : kaynakAdi.includes('CUSTOMER') || kaynakAdi.includes('MÜŞTERİ') ? 'IADE'
            : kaynakAdi.includes('/STOK') || kaynakAdi.includes('TRANSIT') ? 'TRANSFER'
              : 'DIGER';
  }
  kayit.kaynakHazir = true;
}

// ───────────────────────── ARA ─────────────────────────

function etiketKosulu(f: EtiketMerkeziFiltre, s: EtiketSatir): boolean {
  const b = s.sonBasim;
  switch (f.etiket) {
    case 'hic':
      return !b;
    case 'fiyat':
      return !!b && b.fiyat != null && Math.abs(b.fiyat - s.fiyat) >= 0.01;
    case 'once': {
      if (!f.etiketBas) return true;
      return !b || trTarih(new Date(b.basildi)) < f.etiketBas;
    }
    case 'aralik': {
      if (!b) return false;
      const t = trTarih(new Date(b.basildi));
      if (f.etiketBas && t < f.etiketBas) return false;
      if (f.etiketBit && t > f.etiketBit) return false;
      return true;
    }
    default:
      return true;
  }
}

function aramaMetni(s: EtiketSatir): string {
  return sade([s.sablonAdi, s.marka, s.model, s.renk, s.olcu, s.barkod ?? '', s.lotAdi ?? '', s.utsKodu ?? ''].join(' '));
}

export async function etiketMerkeziAra(f: EtiketMerkeziFiltre): Promise<EtiketAraSonuc> {
  const kayit = await tabanKume(f);
  if (f.kaynak) await kaynakEkle(kayit);
  const taban = kayit.satirlar;
  await sonBasimEkle(taban);

  const partiSay = new Map<string, number>();
  for (const s of taban) if (s.parti) partiSay.set(s.parti, (partiSay.get(s.parti) ?? 0) + s.adet);
  const partiler = [...partiSay.entries()]
    .map(([parti, adet]) => ({ parti, etiket: partiBul(parti)?.etiket ?? parti, adet }))
    .sort((a, b) => {
      const ta = a.parti.slice(4, 12);
      const tb = b.parti.slice(4, 12);
      const ia = `${ta.slice(4)}${ta.slice(2, 4)}${ta.slice(0, 2)}`;
      const ib = `${tb.slice(4)}${tb.slice(2, 4)}${tb.slice(0, 2)}`;
      return ib.localeCompare(ia) || b.parti.localeCompare(a.parti);
    })
    .slice(0, 300);
  const partiFiltre = f.sonParti ? (partiler[0]?.parti ?? '__yok__') : (f.parti ?? '');

  const kelimeler = sade(f.q ?? '').split(' ').filter(Boolean).slice(0, 10);
  const gruplar = new Set((f.gruplar ?? []).filter(Boolean));

  // Bağlı listeler hariç (marka/model/renk/ölçü) tüm filtreler.
  const ortak = taban.filter((s) => {
    if (gruplar.size && !gruplar.has(s.grup)) return false;
    if (f.fiyatMin != null && Number.isFinite(f.fiyatMin) && s.fiyat < Number(f.fiyatMin)) return false;
    if (f.fiyatMax != null && Number.isFinite(f.fiyatMax) && s.fiyat > Number(f.fiyatMax)) return false;
    if (f.uts === 'var' && !s.utsKodu) return false;
    if (f.uts === 'yok' && s.utsKodu) return false;
    if (f.barkod === 'var' && !s.barkod) return false;
    if (f.barkod === 'yok' && s.barkod) return false;
    if (partiFiltre && s.parti !== partiFiltre) return false;
    if (f.kaynak && s.kaynak !== f.kaynak) return false;
    if (!etiketKosulu(f, s)) return false;
    if (kelimeler.length) {
      const m = aramaMetni(s);
      if (!kelimeler.every((k) => m.includes(k))) return false;
    }
    return true;
  });

  const komb = new Map<string, Kombinasyon>();
  for (const s of ortak) {
    const k = `${s.marka}\u0001${s.model}\u0001${s.renk}\u0001${s.olcu}`;
    const v = komb.get(k);
    if (v) v.adet += s.adet;
    else komb.set(k, { marka: s.marka, model: s.model, renk: s.renk, olcu: s.olcu, adet: s.adet });
  }

  // Marka/renk/ölçü birebir; model listeden seçilmediyse (elle yazıldıysa) "içinde geçer".
  const esit = (a: string, b?: string) => !b?.trim() || sade(a) === sade(b);
  const modelUyar = (a: string, b?: string) => !b?.trim() || sade(a) === sade(b) || sade(a).includes(sade(b));
  const sonuc = ortak.filter((s) => esit(s.marka, f.marka) && modelUyar(s.model, f.model) && esit(s.renk, f.renk) && esit(s.olcu, f.olcu));
  sonuc.sort((a, b) =>
    (b.girisTarihi ?? '').localeCompare(a.girisTarihi ?? '')
    || a.marka.localeCompare(b.marka, 'tr')
    || a.model.localeCompare(b.model, 'tr')
    || a.renk.localeCompare(b.renk, 'tr')
    || (a.lotAdi ?? '').localeCompare(b.lotAdi ?? '', 'tr'));


  return {
    satirlar: sonuc.slice(0, SONUC_SINIRI),
    toplam: sonuc.length,
    kesildi: sonuc.length > SONUC_SINIRI,
    kombinasyonlar: [...komb.values()],
    partiler,
    tabanAdet: taban.length,
    uygulananParti: partiFiltre && partiFiltre !== '__yok__' ? partiFiltre : null,
  };
}

/** Konum listesi: her konumda kaç çerçeve/güneş lotu stokta. */
export async function etiketMerkeziLokasyonlar(): Promise<{ kod: string; adet: number }[]> {
  const gruplar = (await execute('stock.quant', 'read_group', [
    [['quantity', '>', 0], ['location_id', 'in', Object.values(LOKASYON_ID_MAP)], ...KATEGORI_DOMAIN],
    ['quantity:sum'],
    ['location_id'],
  ], { lazy: false, ...CTX })) as Array<{ location_id: [number, string] | false; quantity: number }>;
  const say = new Map<string, number>();
  for (const g of gruplar) {
    const id = m2oId(g.location_id);
    const kod = id ? LOC_ID_TO_KOD.get(id) : undefined;
    if (kod) say.set(kod, Math.round(Number(g.quantity ?? 0)));
  }
  return Object.keys(LOKASYON_ID_MAP).map((kod) => ({ kod, adet: say.get(kod) ?? 0 }));
}

/** Etiket basıldıktan sonra önbellekteki "son basım" bilgisinin tazelenmesi için. */
export function etiketMerkeziOnbellekTemizle(): void {
  tabanOnbellek.clear();
}

// ───────────────────────── OKUT ─────────────────────────

export type OkutSonuc =
  | { ok: true; satir: EtiketSatir; tur: 'UTS' | 'BARKOD' | 'LOT' }
  | { ok: false; mesaj: string; digerKonumlar?: { lokasyon: string; adet: number }[] };

async function lotQuantlari(lotIds: number[], lokasyonId: number | null): Promise<QuantKaydi[]> {
  if (!lotIds.length) return [];
  const domain: unknown[] = [['lot_id', 'in', lotIds], ['quantity', '>', 0], ['location_id.usage', '=', 'internal']];
  if (lokasyonId) domain.push(['location_id', '=', lokasyonId]);
  return (await execute('stock.quant', 'search_read', [domain], {
    fields: ['id', 'product_id', 'lot_id', 'location_id', 'quantity', 'in_date'],
    limit: 200,
    ...CTX,
  })) as QuantKaydi[];
}

function konumOzeti(quantlar: QuantKaydi[]): { lokasyon: string; adet: number }[] {
  const say = new Map<string, number>();
  for (const q of quantlar) {
    const id = m2oId(q.location_id);
    const kod = (id && LOC_ID_TO_KOD.get(id)) || m2oAd(q.location_id);
    say.set(kod, (say.get(kod) ?? 0) + Math.round(Number(q.quantity ?? 0)));
  }
  return [...say.entries()].map(([lokasyon, adet]) => ({ lokasyon, adet }));
}

async function tekSatir(q: QuantKaydi): Promise<EtiketSatir | null> {
  const [s] = await quantlardanSatir([q]);
  if (!s) return null;
  await sonBasimEkle([s]);
  return s;
}

export async function etiketMerkeziOkut(
  hamKod: string,
  lokasyon: string,
  haricLotIds: number[],
  haricQuantIds: number[],
): Promise<OkutSonuc> {
  const kod = String(hamKod ?? '').trim();
  if (!kod) return { ok: false, mesaj: 'Boş okutma' };
  const lokId = LOKASYON_ID_MAP[lokasyon] ?? null;
  if (!lokId) return { ok: false, mesaj: 'Önce mağaza/depo seçin' };
  const haricLot = new Set(haricLotIds);
  const haricQuant = new Set(haricQuantIds);
  const norm = utsNormal(kod);

  // 1) UTS karekodu: 01 + GTIN(14) + 21 + seri …
  if (/^01\d{14}21/.test(norm)) {
    const gtin = norm.slice(2, 16);
    type L = { id: number; name: string; x_uts_kodu: string | false };
    const adaylar = (await execute('stock.lot', 'search_read', [[['x_uts_kodu', 'ilike', gtin]]], {
      fields: ['id', 'name', 'x_uts_kodu'],
      limit: 2000,
      ...CTX,
    })) as L[];
    let eslesen = adaylar.filter((l) => typeof l.x_uts_kodu === 'string' && utsNormal(l.x_uts_kodu) === norm);
    if (!eslesen.length) {
      // Okutulan dizide ayraç yoksa seri, sonraki alanlarla birleşik gelir: lotun "01GTIN21SERİ"
      // çekirdeği okutulanın başıyla birebir örtüşmeli; en uzun örtüşen seçilir.
      const cekirdekli = adaylar
        .map((l) => ({ l, c: typeof l.x_uts_kodu === 'string' ? utsNormal(l.x_uts_kodu.split(/[*(\u001d]/)[0]) : '' }))
        .filter((x) => x.c.length > 18 && norm.startsWith(x.c))
        .sort((a, b) => b.c.length - a.c.length);
      if (cekirdekli.length) {
        const enUzun = cekirdekli[0].c.length;
        eslesen = cekirdekli.filter((x) => x.c.length === enUzun).map((x) => x.l);
      }
    }
    if (!eslesen.length) return { ok: false, mesaj: 'Bu UTS karekodu sistemde hiçbir ürüne kayıtlı değil' };
    if (eslesen.length > 1) return { ok: false, mesaj: `Bu UTS kodu ${eslesen.length} farklı lotta kayıtlı — Stok Yönetimi'nden kontrol edin` };
    const lot = eslesen[0];
    if (haricLot.has(lot.id)) return { ok: false, mesaj: 'Bu ürün zaten listede' };
    const buradaki = await lotQuantlari([lot.id], lokId);
    if (!buradaki.length) {
      const her = await lotQuantlari([lot.id], null);
      return {
        ok: false,
        mesaj: her.length ? `Bu ürün ${lokasyon}'de stokta değil` : 'Bu ürün hiçbir konumda stokta görünmüyor (satılmış olabilir)',
        digerKonumlar: konumOzeti(her),
      };
    }
    const s = await tekSatir(buradaki[0]);
    return s ? { ok: true, satir: s, tur: 'UTS' } : { ok: false, mesaj: 'Bu ürün çerçeve/güneş gözlüğü değil' };
  }

  // 2) Lot adı (GRS-… vb.)
  type L2 = { id: number; name: string };
  const lotAdla = (await execute('stock.lot', 'search_read', [[['name', '=', kod]]], { fields: ['id', 'name'], limit: 5, ...CTX })) as L2[];
  if (lotAdla.length) {
    const ids = lotAdla.map((l) => l.id).filter((id) => !haricLot.has(id));
    if (!ids.length) return { ok: false, mesaj: 'Bu ürün zaten listede' };
    const buradaki = await lotQuantlari(ids, lokId);
    if (!buradaki.length) {
      const her = await lotQuantlari(ids, null);
      return { ok: false, mesaj: `Bu lot ${lokasyon}'de stokta değil`, digerKonumlar: konumOzeti(her) };
    }
    const s = await tekSatir(buradaki[0]);
    return s ? { ok: true, satir: s, tur: 'LOT' } : { ok: false, mesaj: 'Bu ürün çerçeve/güneş gözlüğü değil' };
  }

  // 3) Ürün barkodu → o konumdaki, listede olmayan sıradaki lot
  type P = { id: number };
  const urunler = (await execute('product.product', 'search_read', [['|', ['barcode', '=', kod], ['default_code', '=', kod]]], {
    fields: ['id'],
    limit: 20,
    ...CTX,
  })) as P[];
  if (!urunler.length) return { ok: false, mesaj: 'Bu kod sistemde bulunamadı (UTS, barkod ya da lot değil)' };
  const pids = urunler.map((u) => u.id);
  const quantlar = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', pids], ['quantity', '>', 0], ['location_id.usage', '=', 'internal'],
  ]], { fields: ['id', 'product_id', 'lot_id', 'location_id', 'quantity', 'in_date'], limit: 500, ...CTX })) as QuantKaydi[];
  const burada = quantlar
    .filter((q) => m2oId(q.location_id) === lokId)
    .sort((a, b) => m2oAd(a.lot_id).localeCompare(m2oAd(b.lot_id), 'tr'));
  if (!burada.length) {
    return {
      ok: false,
      mesaj: quantlar.length ? `Bu ürün ${lokasyon}'de stokta değil` : 'Bu ürün hiçbir konumda stokta görünmüyor',
      digerKonumlar: konumOzeti(quantlar),
    };
  }
  const sira = burada.find((q) => {
    const lid = m2oId(q.lot_id);
    return lid ? !haricLot.has(lid) : !haricQuant.has(q.id);
  });
  if (!sira) return { ok: false, mesaj: `Bu üründen ${lokasyon}'deki ${burada.length} adedin hepsi zaten listede` };
  const s = await tekSatir(sira);
  return s ? { ok: true, satir: s, tur: 'BARKOD' } : { ok: false, mesaj: 'Bu ürün çerçeve/güneş gözlüğü değil' };
}
