/**
 * 13.11.2026 — Mağaza min-max ikmali (stok cam, kontak lens, solüsyon).
 *
 * Kural: mağaza + "seri" (ürün adının başı) + isteğe bağlı SPH/CYL aralığı + min + max.
 * Değerlendirme: kurala giren her derece/ürün için mağaza stoğu MIN'in altına düştüyse MAX'a
 * tamamlayacak kadar Ana Depo'dan sevk önerilir (açık ikmal taslaklarındakiler düşülür).
 *
 * Ad biçimleri: "Plus 1.56 -0125 -0050", "ZEISS 1.56 Blue 0150  0050" (CYL işaretsiz),
 * "ULTRA KONTAKT LENS -0025" (tek derece), "BIOTRUE 300ML" (derecesiz).
 */
import type { StokSeviyeKurali } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';

const CTX = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const DEPO = 'ANADEPO';

export type KuralGirdi = {
  lokasyon: string;
  seri: string;
  sphMin?: number | null;
  sphMax?: number | null;
  cylMin?: number | null;
  cylMax?: number | null;
  min: number;
  max: number;
  aktif?: boolean;
};

function sayi(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function kuralTemizle(g: KuralGirdi) {
  const seri = String(g.seri ?? '').replace(/\s+/g, ' ').trim();
  if (!seri) throw new Error('Seri / ürün adı boş olamaz');
  if (!LOKASYON_ID_MAP[g.lokasyon] || g.lokasyon === DEPO) throw new Error('Geçerli bir mağaza seçin');
  const min = Math.max(0, Math.round(Number(g.min)));
  const max = Math.max(0, Math.round(Number(g.max)));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min || max === 0) throw new Error('Max, min\'den küçük olamaz ve 0 olamaz');
  // CYL her zaman eksi tutulur (0 … -2.00)
  const c1 = sayi(g.cylMin);
  const c2 = sayi(g.cylMax);
  const cyl = [c1, c2].map((c) => (c == null ? null : -Math.abs(c)));
  const cylLo = cyl[0] != null && cyl[1] != null ? Math.min(cyl[0], cyl[1]) : cyl[0] ?? cyl[1];
  const cylHi = cyl[0] != null && cyl[1] != null ? Math.max(cyl[0], cyl[1]) : null;
  const s1 = sayi(g.sphMin);
  const s2 = sayi(g.sphMax);
  return {
    lokasyon: g.lokasyon,
    seri,
    sphMin: s1 != null && s2 != null ? Math.min(s1, s2) : s1,
    sphMax: s1 != null && s2 != null ? Math.max(s1, s2) : s2,
    cylMin: cylLo,
    cylMax: cylHi,
    min,
    max,
    aktif: g.aktif ?? true,
  };
}

export async function kuralListesi(lokasyon?: string) {
  return prisma.stokSeviyeKurali.findMany({
    where: lokasyon ? { lokasyon } : {},
    orderBy: [{ lokasyon: 'asc' }, { seri: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function kuralKaydet(g: KuralGirdi & { id?: string }) {
  const data = kuralTemizle(g);
  if (g.id) return prisma.stokSeviyeKurali.update({ where: { id: g.id }, data });
  return prisma.stokSeviyeKurali.create({ data });
}

export async function kuralSil(id: string) {
  return prisma.stokSeviyeKurali.delete({ where: { id } });
}

/** Bir mağazanın kurallarını başka mağazalara kopyalar (aynı seri+aralık varsa üzerine yazar). */
export async function kuralKopyala(kaynak: string, hedefler: string[]) {
  const kurallar = await prisma.stokSeviyeKurali.findMany({ where: { lokasyon: kaynak } });
  let sayi = 0;
  for (const h of hedefler) {
    if (!LOKASYON_ID_MAP[h] || h === DEPO || h === kaynak) continue;
    for (const k of kurallar) {
      const ayni = await prisma.stokSeviyeKurali.findFirst({
        where: { lokasyon: h, seri: k.seri, sphMin: k.sphMin, sphMax: k.sphMax, cylMin: k.cylMin, cylMax: k.cylMax },
      });
      const data = { lokasyon: h, seri: k.seri, sphMin: k.sphMin, sphMax: k.sphMax, cylMin: k.cylMin, cylMax: k.cylMax, min: k.min, max: k.max, aktif: k.aktif };
      if (ayni) await prisma.stokSeviyeKurali.update({ where: { id: ayni.id }, data });
      else await prisma.stokSeviyeKurali.create({ data });
      sayi++;
    }
  }
  return sayi;
}

/** Odoo arama kalıbı: kelimeler arasına % (çift boşluklu adlar da bulunsun) */
function aramaKalibi(seri: string) {
  return `${seri.trim().split(/\s+/).join('%')}%`;
}

function kacis(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/** Ad → { sph, cyl } ; derecesiz ürünlerde null. */
function dereceCoz(ad: string, seri: string): { uyar: boolean; sph: number | null; cyl: number | null } {
  const re = new RegExp(`^${kacis(seri)}(?:\\s+(-?\\d{4})(?:\\s+(-?\\d{4}))?)?\\s*$`, 'i');
  const m = re.exec(ad.trim());
  if (!m) return { uyar: false, sph: null, cyl: null };
  const sph = m[1] != null ? Number(m[1]) / 100 : null;
  const cyl = m[2] != null ? -Math.abs(Number(m[2]) / 100) : (m[1] != null ? 0 : null);
  return { uyar: true, sph, cyl };
}

function aralikta(k: StokSeviyeKurali, sph: number | null, cyl: number | null) {
  const n = (d: unknown) => (d == null ? null : Number(d));
  const [s1, s2, c1, c2] = [n(k.sphMin), n(k.sphMax), n(k.cylMin), n(k.cylMax)];
  if ((s1 != null || s2 != null) && sph == null) return false;
  if (s1 != null && sph! < s1 - 1e-9) return false;
  if (s2 != null && sph! > s2 + 1e-9) return false;
  if ((c1 != null || c2 != null) && cyl == null) return false;
  if (c1 != null && cyl! < c1 - 1e-9) return false;
  if (c2 != null && cyl! > c2 + 1e-9) return false;
  return true;
}

/** Bir seri adına uyan şablon/varyantları (adla) gösterir — kural girerken önizleme için. */
export async function seriOnizle(seri: string) {
  const s = String(seri ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < 3) return { sablon: 0, ornek: [] as string[] };
  const t = (await execute('product.template', 'search_read', [[['name', '=ilike', aramaKalibi(s)], ['active', '=', true]]], {
    fields: ['name'], limit: 5000, ...CTX,
  })) as { name: string }[];
  const uyan = t.filter((x) => dereceCoz(x.name, s).uyar);
  return { sablon: uyan.length, ornek: uyan.slice(0, 5).map((x) => x.name) };
}

export type MinMaxSatir = {
  varyantId: number;
  ad: string;
  seri: string;
  sph: number | null;
  cyl: number | null;
  min: number;
  max: number;
  magazaAdet: number;
  depoAdet: number;
  taslakta: number;
  satis30: number;
  eksik: number;
  onerilen: number;
};

export async function minMaxDegerlendir(lokasyon: string): Promise<{
  satirlar: MinMaxSatir[];
  kuralOzet: { kuralId: string; seri: string; uyan: number; eksik: number }[];
}> {
  if (!LOKASYON_ID_MAP[lokasyon] || lokasyon === DEPO) throw new Error('Geçerli bir mağaza seçin');
  const kurallar = await prisma.stokSeviyeKurali.findMany({ where: { lokasyon, aktif: true }, orderBy: { createdAt: 'asc' } });
  if (!kurallar.length) return { satirlar: [], kuralOzet: [] };

  // Kural → şablonlar → varyant (son eklenen kural öncelikli)
  const varyantKural = new Map<number, { k: StokSeviyeKurali; ad: string; sph: number | null; cyl: number | null }>();
  const ozet = new Map<string, { kuralId: string; seri: string; uyan: number; eksik: number }>();
  for (const k of kurallar) {
    const t = (await execute('product.template', 'search_read', [[['name', '=ilike', aramaKalibi(k.seri)], ['active', '=', true]]], {
      fields: ['id', 'name'], limit: 10000, ...CTX,
    })) as { id: number; name: string }[];
    const uyan = t
      .map((x) => ({ x, d: dereceCoz(x.name, k.seri) }))
      .filter(({ d }) => d.uyar)
      .filter(({ d }) => aralikta(k, d.sph, d.cyl));
    if (!uyan.length) {
      ozet.set(k.id, { kuralId: k.id, seri: k.seri, uyan: 0, eksik: 0 });
      continue;
    }
    const tmplAd = new Map(uyan.map(({ x, d }) => [x.id, { ad: x.name, ...d }]));
    const vars = (await execute('product.product', 'search_read', [[['product_tmpl_id', 'in', [...tmplAd.keys()]], ['active', '=', true]]], {
      fields: ['id', 'product_tmpl_id'], limit: 20000, ...CTX,
    })) as { id: number; product_tmpl_id: [number, string] }[];
    for (const v of vars) {
      const d = tmplAd.get(v.product_tmpl_id[0]);
      if (d) varyantKural.set(v.id, { k, ad: d.ad, sph: d.sph, cyl: d.cyl });
    }
    ozet.set(k.id, { kuralId: k.id, seri: k.seri, uyan: vars.length, eksik: 0 });
  }
  const pids = [...varyantKural.keys()];
  if (!pids.length) return { satirlar: [], kuralOzet: [...ozet.values()] };

  type Q = { product_id: [number, string]; location_id: [number, string]; quantity: number };
  const stok = new Map<number, { m: number; d: number }>();
  for (let i = 0; i < pids.length; i += 3000) {
    const q = (await execute('stock.quant', 'search_read', [[
      ['product_id', 'in', pids.slice(i, i + 3000)],
      ['location_id', 'in', [LOKASYON_ID_MAP[lokasyon], LOKASYON_ID_MAP[DEPO]]],
      ['quantity', '>', 0],
    ]], { fields: ['product_id', 'location_id', 'quantity'], limit: 50000, ...CTX })) as Q[];
    for (const x of q) {
      const o = stok.get(x.product_id[0]) ?? { m: 0, d: 0 };
      if (x.location_id[0] === LOKASYON_ID_MAP[lokasyon]) o.m += Number(x.quantity);
      else o.d += Number(x.quantity);
      stok.set(x.product_id[0], o);
    }
  }

  // Açık taslaklardakiler ve son 30 gün satış
  const acik = await prisma.ikmalTaslak.findMany({ where: { hedefLokasyon: lokasyon, durum: 'TASLAK' }, select: { kalemler: true } });
  const taslakta = new Map<number, number>();
  for (const t of acik) {
    for (const k of (t.kalemler as Array<{ varyantId: number; adet: number }>) ?? []) {
      taslakta.set(Number(k.varyantId), (taslakta.get(Number(k.varyantId)) ?? 0) + Number(k.adet ?? 0));
    }
  }
  const branch = await prisma.branch.findFirst({ where: { code: lokasyon }, select: { id: true } });
  const satis30 = new Map<number, number>();
  if (branch) {
    const otuz = new Date(Date.now() - 30 * 86400000);
    const kal = await prisma.saleItem.findMany({
      where: {
        odooProductId: { in: pids.map(String) },
        sale: { branchId: branch.id, status: { notIn: ['DRAFT', 'VOID'] }, createdAt: { gte: otuz } },
      },
      select: { odooProductId: true, qty: true },
    });
    for (const k of kal) satis30.set(Number(k.odooProductId), (satis30.get(Number(k.odooProductId)) ?? 0) + Number(k.qty ?? 0));
  }

  const satirlar: MinMaxSatir[] = [];
  for (const [pid, v] of varyantKural) {
    const st = stok.get(pid) ?? { m: 0, d: 0 };
    const mag = Math.round(st.m);
    const ts = taslakta.get(pid) ?? 0;
    const eksik = mag < v.k.min ? Math.max(0, v.k.max - mag - ts) : 0;
    if (eksik <= 0) continue;
    const dep = Math.round(st.d);
    const o = ozet.get(v.k.id);
    if (o) o.eksik++;
    satirlar.push({
      varyantId: pid,
      ad: v.ad,
      seri: v.k.seri,
      sph: v.sph,
      cyl: v.cyl,
      min: v.k.min,
      max: v.k.max,
      magazaAdet: mag,
      depoAdet: dep,
      taslakta: ts,
      satis30: satis30.get(pid) ?? 0,
      eksik,
      onerilen: Math.min(eksik, dep),
    });
  }
  satirlar.sort((a, b) => a.seri.localeCompare(b.seri, 'tr') || (a.sph ?? 0) - (b.sph ?? 0) || (b.cyl ?? 0) - (a.cyl ?? 0));
  return { satirlar, kuralOzet: [...ozet.values()] };
}
