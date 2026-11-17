import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import type { DashboardKategori } from '../reports/report.service';
import { RaporHatasi, type Filtre, type Kolon, type RaporSonuc } from './tipler';

export const GUN_MS = 24 * 3600 * 1000;
export const TZ = 'Europe/Istanbul';
export const ODOO_CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };

/** Satış sayılmayan durumlar (taslak, iptal) */
export const GECERSIZ_SATIS = ['DRAFT', 'VOID'] as const;

export const KATEGORI_ADI: Record<DashboardKategori, string> = {
  GUNES_GOZLUGU: 'Güneş gözlüğü',
  CAM: 'Cam',
  LENS: 'Lens',
  OPTIK_CERCEVE: 'Optik çerçeve',
  AKSESUAR: 'Aksesuar',
  SOLUSYON: 'Solüsyon',
  DIGER: 'Diğer',
};

export const ODEME_ADI: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kredi kartı',
  TRANSFER: 'Havale / EFT',
  OPEN_ACCOUNT: 'Açık hesap',
  SGK: 'SGK',
  VAKIF: 'Vakıf',
  ETICARET: 'E-ticaret',
  CIRO_DUZELTME: 'Ciro düzeltme',
};

/** Stok raporlarında seçilebilen konumlar: şube/depo kodu → Odoo konum id */
export const STOK_LOKASYONLARI: Record<string, number> = {
  ...LOKASYON_ID_MAP,
  'ADESE DEPO': 32,
  'POTENTIAL DEPO': 42,
};
export const LOKASYON_KODU = new Map(Object.entries(STOK_LOKASYONLARI).map(([k, id]) => [id, k]));

export function trGun(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

export function trSaat(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);
}

export function bugunTr(): string {
  return trGun(new Date());
}

/** YYYY-MM-DD → o Türkiye gününün başı/sonu (UTC Date) */
export function gunBasi(gun: string): Date {
  return new Date(`${gun}T00:00:00+03:00`);
}
export function gunSonu(gun: string): Date {
  return new Date(`${gun}T23:59:59.999+03:00`);
}

const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtredeki tarih aralığı (boşsa bu ayın başı – bugün). En fazla 3 yıl. */
export function aralik(f: Filtre): { bas: string; bit: string; gte: Date; lte: Date; gunSayisi: number } {
  const bugun = bugunTr();
  const bas = f.bas && GUN_RE.test(f.bas) ? f.bas : `${bugun.slice(0, 8)}01`;
  const bit = f.bit && GUN_RE.test(f.bit) ? f.bit : bugun;
  if (bas > bit) throw new RaporHatasi('Başlangıç tarihi bitişten sonra olamaz.');
  const gte = gunBasi(bas);
  const lte = gunSonu(bit);
  const gunSayisi = Math.round((gunBasi(bit).getTime() - gte.getTime()) / GUN_MS) + 1;
  if (gunSayisi > 366 * 3) throw new RaporHatasi('Tarih aralığı en fazla 3 yıl olabilir.');
  return { bas, bit, gte, lte, gunSayisi };
}

/** Aynı uzunlukta bir önceki dönem */
export function oncekiDonem(bas: string, gunSayisi: number): { gte: Date; lte: Date; bas: string; bit: string } {
  const gte = new Date(gunBasi(bas).getTime() - gunSayisi * GUN_MS);
  const lte = new Date(gunBasi(bas).getTime() - 1);
  return { gte, lte, bas: trGun(gte), bit: trGun(lte) };
}

/** Bir yıl önceki aynı dönem */
export function gecenYil(bas: string, bit: string): { gte: Date; lte: Date } {
  const y = (g: string) => `${Number(g.slice(0, 4)) - 1}${g.slice(4)}`.replace(/-02-29$/, '-02-28');
  return { gte: gunBasi(y(bas)), lte: gunSonu(y(bit)) };
}

/** ISO hafta başı (pazartesi) — Türkiye günü üzerinden */
export function haftaBasi(gun: string): string {
  const d = new Date(`${gun}T12:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - g * GUN_MS).toISOString().slice(0, 10);
}

export function yuvarla(n: number, b = 2): number {
  const k = 10 ** b;
  return Math.round((n + Number.EPSILON) * k) / k;
}

export function sayi(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buyuk(s: unknown): string {
  return String(s ?? '').toLocaleUpperCase('tr-TR').trim();
}

export function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
export function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}

/** Filtredeki şube id'leri (boşsa undefined = hepsi) */
export function subeFiltresi(f: Filtre): string[] | undefined {
  const ids = (f.subeIds ?? []).filter((x) => typeof x === 'string' && x.length > 0);
  return ids.length ? ids : undefined;
}

let subeOnbellek: { zaman: number; map: Map<string, { kod: string; ad: string }> } | null = null;
export async function subeler(): Promise<Map<string, { kod: string; ad: string }>> {
  if (subeOnbellek && Date.now() - subeOnbellek.zaman < 5 * 60 * 1000) return subeOnbellek.map;
  const rows = await prisma.branch.findMany({ select: { id: true, code: true, name: true } });
  const map = new Map(rows.map((b) => [b.id, { kod: b.code, ad: b.name }]));
  subeOnbellek = { zaman: Date.now(), map };
  return map;
}

export async function kullanicilar(ids: string[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function bankalar(): Promise<Map<string, string>> {
  const rows = await prisma.bank.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((b) => [b.id, b.name]));
}

/** Marka: POS ürün kartındaki marka; yoksa Odoo ürün adının ilk kelimesi */
export function markaTahmin(brand: string | null | undefined, ad: string | null | undefined): string {
  const b = buyuk(brand);
  if (b) return b;
  const a = buyuk(ad).replace(/^\[[^\]]*\]\s*/, '');
  for (const kelime of [' OPTİK ÇERÇEVE', ' GÜNEŞ GÖZLÜĞÜ', ' GÜNEŞ']) {
    const i = a.indexOf(kelime);
    if (i > 0) return a.slice(0, i).trim();
  }
  return a.split(/\s+/)[0] || '(belirsiz)';
}

/**
 * Odoo varyant maliyetleri (standard_price, şirkete bağlı). Önce ortak bağlamda okunur;
 * 0 gelenler sırayla her şirket bağlamında tekrar denenir.
 */
export async function varyantMaliyetleri(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const tekil = [...new Set(ids.filter((x) => Number.isFinite(x) && x > 0))];
  const parca = async (liste: number[], companyId?: number) => {
    for (let i = 0; i < liste.length; i += 2000) {
      const p = liste.slice(i, i + 2000);
      try {
        const rows = (await execute('product.product', 'read', [p], { fields: ['standard_price'], context: { active_test: false } }, companyId)) as {
          id: number;
          standard_price?: number;
        }[];
        for (const r of rows) {
          const v = sayi(r.standard_price);
          if (v > 0) out.set(r.id, v);
        }
      } catch (e) {
        console.warn('[hazir-raporlar] maliyet okunamadı:', e instanceof Error ? e.message : e);
      }
    }
  };
  await parca(tekil);
  for (const c of ODOO_ALL_COMPANY_IDS) {
    const eksik = tekil.filter((id) => !out.has(id));
    if (!eksik.length) break;
    await parca(eksik, c);
  }
  return out;
}

/** Ortak: satır sınırı */
export const SATIR_SINIRI = 5000;

export function sinirla(sonuc: RaporSonuc, sinir = SATIR_SINIRI): RaporSonuc {
  if (sonuc.satirlar.length <= sinir) return sonuc;
  return {
    ...sonuc,
    satirlar: sonuc.satirlar.slice(0, sinir),
    kesildi: true,
    notlar: [...(sonuc.notlar ?? []), `İlk ${sinir} satır gösteriliyor; filtreleri daraltın veya Excel'e alın.`],
  };
}

/** Maliyet sütunlarını ve kutularını yetkisizden gizle */
export function maliyetGizle(sonuc: RaporSonuc): RaporSonuc {
  const gizli = new Set(sonuc.kolonlar.filter((k) => k.maliyet).map((k) => k.key));
  if (!gizli.size && !(sonuc.ozet ?? []).some((o) => o.maliyet)) return sonuc;
  return {
    ...sonuc,
    kolonlar: sonuc.kolonlar.filter((k: Kolon) => !k.maliyet),
    satirlar: sonuc.satirlar.map((s) => {
      const y = { ...s };
      for (const k of gizli) delete y[k];
      return y;
    }),
    ozet: (sonuc.ozet ?? []).filter((o) => !o.maliyet),
  };
}

export async function odooParcaOku<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  const tekil = [...new Set(ids)];
  for (let i = 0; i < tekil.length; i += 2000) {
    const p = tekil.slice(i, i + 2000);
    if (p.length) out.push(...((await execute(model, 'read', [p], { fields, ...ODOO_CTX })) as T[]));
  }
  return out;
}
