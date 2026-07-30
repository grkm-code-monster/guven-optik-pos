import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import {
  resolveStandardPriceAcrossCompanies,
  resolveTemplateStandardPriceMap,
  resolveTemplateVariantAverages,
  writeStandardPriceAllCompanies,
} from '../odoo/odoo-standard-price.util';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import { resolveTemplateKdvMap } from '../odoo/odoo-tax.util';
import { buildPtavMap, buildUrunAdiFromProduct } from '../odoo/odoo-variant-label.util';
import {
  applyArchivePrefixToVariant,
  applyArchivePrefixToVariants,
  restoreArchivePrefixFromVariant,
  restoreArchivePrefixFromVariants,
} from './archive-barcode.util';
import { ODOO_OPTIK_CAM_CATEGORY_IDS } from '../sales/sale-item-lab.util';

// E-Ticaret (harici) API'de sadece güneş gözlüğü ve (kontakt) lens ürünleri gösterilir —
// reçeteli optik cam hariç (o kategori ID'leri zaten ayrı bir listede biliniyor, hariç tutulur).
const ETICARET_KATEGORI_DOMAIN: unknown[] = [
  '&',
  ['categ_id', 'not in', [...ODOO_OPTIK_CAM_CATEGORY_IDS]],
  '|',
  ['categ_id.complete_name', 'ilike', 'GÜNEŞ'],
  ['categ_id.complete_name', 'ilike', 'LENS'],
];

const ODOO_LOCATION_TO_CODE = Object.fromEntries(
  Object.entries(LOKASYON_ID_MAP).map(([code, id]) => [id, code]),
);

type StokFiltre = {
  q?: string;
  kategoriId?: number;
  fiyatMin?: number;
  fiyatMax?: number;
  stokDurumu?: 'tumu' | 'var' | 'sifir';
  lokasyon?: string;
  kdv?: number;
  durum?: 'aktif' | 'arsiv' | 'hepsi';
  page?: number;
  limit?: number;
};

type StokUrunRow = {
  id: number
  icReferans: string
  urunAdi: string
  kategori: string
  kategoriId: number | null
  satisFiyati: number
  alisFiyati: number
  kdvOrani: number
  toplamStok: number
  aktif: boolean
  varyantSayisi: number
}

type VariantMeta = { fiyat: number; barkod: string | null }

function m2oId(v: unknown): number | null {
  if (Array.isArray(v) && v.length) return Number(v[0]) || null;
  if (typeof v === 'number') return v;
  return null;
}

function m2oName(v: unknown): string {
  if (Array.isArray(v) && v.length > 1) return String(v[1]);
  return '';
}

async function getTaxRateMap(taxIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!taxIds.length) return map;
  const taxes = (await execute('account.tax', 'read', [taxIds], { fields: ['id', 'amount'] })) ?? [];
  for (const t of taxes) {
    map.set(t.id, Number(t.amount) || 0);
  }
  return map;
}

async function getTemplateStockMap(
  tmplIds: number[],
  lokasyon?: string,
  includeInactive = false,
): Promise<Map<number, number>> {
  const stockMap = new Map<number, number>();
  if (!tmplIds.length) return stockMap;

  const variantKwargs: Record<string, unknown> = {
    fields: ['id', 'product_tmpl_id'],
    limit: 5000,
  };
  if (includeInactive) {
    variantKwargs.context = { active_test: false };
  }

  const variants = (await execute('product.product', 'search_read', [[['product_tmpl_id', 'in', tmplIds]]], variantKwargs)) ?? [];

  const variantToTmpl = new Map<number, number>();
  const productIds: number[] = [];
  for (const v of variants) {
    const tmplId = m2oId(v.product_tmpl_id);
    if (tmplId) {
      variantToTmpl.set(v.id, tmplId);
      productIds.push(v.id);
    }
  }
  if (!productIds.length) return stockMap;

  const quantDomain: unknown[] = [
    ['product_id', 'in', productIds],
    ['location_id.usage', '=', 'internal'],
  ];
  if (lokasyon && LOKASYON_ID_MAP[lokasyon]) {
    quantDomain.push(['location_id', '=', LOKASYON_ID_MAP[lokasyon]]);
  }

  const quants = (await execute('stock.quant', 'search_read', [quantDomain], {
    fields: ['product_id', 'quantity'],
    limit: 10000,
  })) ?? [];

  for (const q of quants) {
    const pid = m2oId(q.product_id);
    if (!pid) continue;
    const tmplId = variantToTmpl.get(pid);
    if (!tmplId) continue;
    stockMap.set(tmplId, (stockMap.get(tmplId) ?? 0) + (Number(q.quantity) || 0));
  }
  return stockMap;
}

export async function listStokUrunleri(filtre: StokFiltre) {
  const page = Math.max(1, filtre.page ?? 1);
  const limit = Math.min(100, Math.max(1, filtre.limit ?? 50));
  const offset = (page - 1) * limit;
  const durum = filtre.durum ?? 'aktif';

  const domain: unknown[] = [['type', 'in', ['product', 'consu']]];
  const searchContext: Record<string, unknown> = {};
  if (durum === 'aktif') {
    domain.push(['active', '=', true]);
  } else if (durum === 'arsiv') {
    domain.push(['active', '=', false]);
    searchContext.active_test = false;
  } else {
    domain.push(['active', 'in', [true, false]]);
    searchContext.active_test = false;
  }

  if (filtre.q?.trim()) {
    const q = filtre.q.trim();
    domain.push('|', ['name', 'ilike', q], ['default_code', 'ilike', q]);
  }
  if (filtre.kategoriId) domain.push(['categ_id', 'child_of', filtre.kategoriId]);
  if (filtre.fiyatMin != null) domain.push(['list_price', '>=', filtre.fiyatMin]);
  if (filtre.fiyatMax != null) domain.push(['list_price', '<=', filtre.fiyatMax]);

  const fields = ['id', 'name', 'default_code', 'categ_id', 'list_price', 'standard_price', 'taxes_id', 'active', 'product_variant_count'];
  const searchKwargs: Record<string, unknown> = {
    fields,
    limit: limit + 200,
    order: 'name asc',
  };
  if (Object.keys(searchContext).length) {
    searchKwargs.context = searchContext;
  }

  const templates = (await execute('product.template', 'search_read', [domain], searchKwargs)) ?? [];

  const tmplIds = templates.map((t: { id: number }) => t.id);
  const stockMap = await getTemplateStockMap(tmplIds, filtre.lokasyon, durum !== 'aktif');
  const alisFiyatiMap = await resolveTemplateStandardPriceMap(tmplIds);

  const kdvMap = await resolveTemplateKdvMap(tmplIds);

  const multiVariantTmplIds = templates
    .filter((t: { product_variant_count?: number }) => Math.max(1, Number(t.product_variant_count) || 1) > 1)
    .map((t: { id: number }) => t.id);
  const variantAvgMap = await resolveTemplateVariantAverages(multiVariantTmplIds);

  let rows: StokUrunRow[] = templates.map((t: any) => {
    const kdvOrani = kdvMap.get(t.id) ?? 0;
    const toplamStok = stockMap.get(t.id) ?? 0;
    const varyantSayisi = Math.max(1, Number(t.product_variant_count) || 1);
    let satisFiyati = Number(t.list_price) || 0;
    let alisFiyati = alisFiyatiMap.get(t.id) ?? 0;
    if (varyantSayisi > 1) {
      const avg = variantAvgMap.get(t.id);
      if (avg && avg.varyantSayisi > 0) {
        satisFiyati = avg.ortalamaSatis;
        alisFiyati = avg.ortalamaMaliyet;
      }
    }
    return {
      id: t.id,
      icReferans: t.default_code || '',
      urunAdi: t.name,
      kategori: m2oName(t.categ_id),
      kategoriId: m2oId(t.categ_id),
      satisFiyati,
      alisFiyati,
      kdvOrani,
      toplamStok,
      aktif: !!t.active,
      varyantSayisi,
    };
  });

  if (filtre.kdv === 10 || filtre.kdv === 20) {
    rows = rows.filter((r) => Math.round(r.kdvOrani) === filtre.kdv);
  }
  if (filtre.stokDurumu === 'var') rows = rows.filter((r) => r.toplamStok > 0);
  if (filtre.stokDurumu === 'sifir') rows = rows.filter((r) => r.toplamStok <= 0);

  const total = rows.length;
  const data = rows.slice(offset, offset + limit);
  return { data, total, page, limit };
}

export async function getStokUrunRowsByIds(urunIds: number[]): Promise<StokUrunRow[]> {
  const ids = [...new Set(urunIds.filter((id) => id > 0))];
  if (!ids.length) return [];

  const templates = (await execute('product.template', 'read', [ids], {
    fields: ['id', 'name', 'default_code', 'categ_id', 'list_price', 'standard_price', 'taxes_id', 'active', 'product_variant_count'],
    context: { active_test: false },
  })) ?? [];

  const byId = new Map<number, any>(templates.map((t: { id: number }) => [t.id, t]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const tmplIds = ordered.map((t: { id: number }) => t.id);

  const stockMap = await getTemplateStockMap(tmplIds, undefined, true);
  const alisFiyatiMap = await resolveTemplateStandardPriceMap(tmplIds);
  const kdvMap = await resolveTemplateKdvMap(tmplIds);

  const multiVariantTmplIds = ordered
    .filter((t: { product_variant_count?: number }) => Math.max(1, Number(t.product_variant_count) || 1) > 1)
    .map((t: { id: number }) => t.id);
  const variantAvgMap = await resolveTemplateVariantAverages(multiVariantTmplIds);

  return ordered.map((t: any) => {
    const varyantSayisi = Math.max(1, Number(t.product_variant_count) || 1);
    let satisFiyati = Number(t.list_price) || 0;
    let alisFiyati = alisFiyatiMap.get(t.id) ?? 0;
    if (varyantSayisi > 1) {
      const avg = variantAvgMap.get(t.id);
      if (avg && avg.varyantSayisi > 0) {
        satisFiyati = avg.ortalamaSatis;
        alisFiyati = avg.ortalamaMaliyet;
      }
    }
    return {
      id: t.id,
      icReferans: t.default_code || '',
      urunAdi: t.name,
      kategori: m2oName(t.categ_id),
      kategoriId: m2oId(t.categ_id),
      satisFiyati,
      alisFiyati,
      kdvOrani: kdvMap.get(t.id) ?? 0,
      toplamStok: stockMap.get(t.id) ?? 0,
      aktif: !!t.active,
      varyantSayisi,
    };
  });
}

export async function findBranchesWithStock(tmplId: number): Promise<string[]> {
  const variants = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', tmplId]]], {
    fields: ['id'],
    limit: 500,
  })) ?? [];
  const productIds = variants.map((v: { id: number }) => v.id);
  if (!productIds.length) return [];

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', productIds],
    ['quantity', '>', 0],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['location_id'],
    limit: 500,
  })) ?? [];

  const codes = new Set<string>();
  for (const q of quants) {
    const locId = m2oId(q.location_id);
    if (locId && ODOO_LOCATION_TO_CODE[locId]) codes.add(ODOO_LOCATION_TO_CODE[locId]);
  }
  return [...codes];
}

export async function olusturFiyatBildirimleri(opts: {
  urunId: number;
  urunAdi: string;
  eskiFiyat: number;
  yeniFiyat: number;
  fiyatTipi: 'SATIS' | 'ALIS';
  degistirenUserId: string;
  kategoriAdi?: string | null;
}) {
  if (opts.eskiFiyat === opts.yeniFiyat) return [];
  const subeler = await findBranchesWithStock(opts.urunId);
  if (!subeler.length) return [];

  let kategoriAdi = opts.kategoriAdi ?? null;
  if (kategoriAdi == null) {
    const tmpl = (await execute('product.template', 'read', [[opts.urunId]], {
      fields: ['categ_id'],
    }))?.[0];
    kategoriAdi = m2oName(tmpl?.categ_id) || null;
  }

  const kayitlar = await Promise.all(
    subeler.map((subeKodu) =>
      prisma.fiyatDegisiklikBildirimi.create({
        data: {
          urunId: opts.urunId,
          urunAdi: opts.urunAdi,
          eskiFiyat: opts.eskiFiyat,
          yeniFiyat: opts.yeniFiyat,
          fiyatTipi: opts.fiyatTipi,
          degistirenUserId: opts.degistirenUserId,
          subeKodu,
          kategoriAdi,
        },
      }),
    ),
  );
  return kayitlar;
}

export async function guncelleStokFiyat(opts: {
  urunId: number;
  satisFiyati?: number;
  alisFiyati?: number;
  degistirenUserId: string;
}) {
  const tmpl = (await execute('product.template', 'read', [[opts.urunId]], {
    fields: ['id', 'name', 'list_price', 'standard_price', 'categ_id'],
  }))?.[0];
  if (!tmpl) throw new Error('Ürün bulunamadı');

  const kategoriAdi = m2oName(tmpl.categ_id) || null;

  const writeVals: Record<string, number> = {};
  const bildirimler: unknown[] = [];

  if (opts.satisFiyati != null) {
    const eski = Number(tmpl.list_price) || 0;
    const yeni = Number(opts.satisFiyati);
    writeVals.list_price = yeni;
    const kayitlar = await olusturFiyatBildirimleri({
      urunId: opts.urunId,
      urunAdi: tmpl.name,
      eskiFiyat: eski,
      yeniFiyat: yeni,
      fiyatTipi: 'SATIS',
      degistirenUserId: opts.degistirenUserId,
      kategoriAdi,
    });
    bildirimler.push(...kayitlar);
  }

  if (opts.alisFiyati != null) {
    const { price: eski } = await resolveStandardPriceAcrossCompanies('product.template', opts.urunId);
    const yeni = Number(opts.alisFiyati);
    await writeStandardPriceAllCompanies('product.template', opts.urunId, yeni);
    const kayitlar = await olusturFiyatBildirimleri({
      urunId: opts.urunId,
      urunAdi: tmpl.name,
      eskiFiyat: eski,
      yeniFiyat: yeni,
      fiyatTipi: 'ALIS',
      degistirenUserId: opts.degistirenUserId,
      kategoriAdi,
    });
    bildirimler.push(...kayitlar);
  }

  if (Object.keys(writeVals).length) {
    await execute('product.template', 'write', [[opts.urunId], writeVals]);
  }

  return { success: true, bildirimSayisi: bildirimler.length };
}

type TopluFiyatOpts = {
  urunIds: number[];
  tip: 'yuzde' | 'sabit' | 'yeni';
  deger: number;
  hedef: 'satis' | 'alis' | 'her_ikisi';
  degistirenUserId: string;
};

export async function topluFiyatGuncelle(opts: TopluFiyatOpts) {
  const sonuclar: Array<{ urunId: number; basarili: boolean; hata?: string }> = [];
  const BATCH = 50;

  for (let i = 0; i < opts.urunIds.length; i += BATCH) {
    const batch = opts.urunIds.slice(i, i + BATCH);
    const templates = (await execute('product.template', 'read', [batch], {
      fields: ['id', 'name', 'list_price', 'standard_price', 'categ_id'],
    })) ?? [];

    for (const tmpl of templates) {
      try {
        const writeVals: Record<string, number> = {};
        const satis = Number(tmpl.list_price) || 0;
        const { price: alis } = await resolveStandardPriceAcrossCompanies('product.template', tmpl.id);
        const kategoriAdi = m2oName(tmpl.categ_id) || null;

        function hesapla(eski: number): number {
          if (opts.tip === 'yuzde') return Math.round(eski * (1 + opts.deger / 100) * 100) / 100;
          if (opts.tip === 'sabit') return Math.round((eski + opts.deger) * 100) / 100;
          return opts.deger;
        }

        if (opts.hedef === 'satis' || opts.hedef === 'her_ikisi') {
          const yeni = hesapla(satis);
          writeVals.list_price = yeni;
          await olusturFiyatBildirimleri({
            urunId: tmpl.id,
            urunAdi: tmpl.name,
            eskiFiyat: satis,
            yeniFiyat: yeni,
            fiyatTipi: 'SATIS',
            degistirenUserId: opts.degistirenUserId,
            kategoriAdi,
          });
        }
        if (opts.hedef === 'alis' || opts.hedef === 'her_ikisi') {
          const yeni = hesapla(alis);
          await writeStandardPriceAllCompanies('product.template', tmpl.id, yeni);
          await olusturFiyatBildirimleri({
            urunId: tmpl.id,
            urunAdi: tmpl.name,
            eskiFiyat: alis,
            yeniFiyat: yeni,
            fiyatTipi: 'ALIS',
            degistirenUserId: opts.degistirenUserId,
            kategoriAdi,
          });
        }

        if (Object.keys(writeVals).length) {
          await execute('product.template', 'write', [[tmpl.id], writeVals]);
        }
        sonuclar.push({ urunId: tmpl.id, basarili: true });
      } catch (e: any) {
        sonuclar.push({ urunId: tmpl.id, basarili: false, hata: e?.message });
      }
    }
  }

  const basarili = sonuclar.filter((s) => s.basarili).length;
  return { success: true, basarili, toplam: opts.urunIds.length, sonuclar };
}

async function setTemplateActiveBatch(urunIds: number[], active: boolean) {
  const sonuclar: Array<{ urunId: number; basarili: boolean; hata?: string }> = [];
  const BATCH = 50;
  const inactiveCtx = { context: { active_test: false } };

  for (let i = 0; i < urunIds.length; i += BATCH) {
    const batch = urunIds.slice(i, i + BATCH);
    for (const urunId of batch) {
      try {
        const variantIds = (await execute(
          'product.product',
          'search',
          [[['product_tmpl_id', '=', urunId]]],
          { ...inactiveCtx, limit: 5000 },
        )) ?? [];

        if (active) {
          const restore = await restoreArchivePrefixFromVariants(variantIds, inactiveCtx);
          if (!restore.ok) {
            sonuclar.push({ urunId, basarili: false, hata: restore.reason });
            continue;
          }
        }

        await execute('product.template', 'write', [[urunId], { active }], inactiveCtx);
        if (variantIds.length) {
          await execute('product.product', 'write', [variantIds, { active }], inactiveCtx);
        }

        if (!active && variantIds.length) {
          await applyArchivePrefixToVariants(variantIds, inactiveCtx);
        }

        sonuclar.push({ urunId, basarili: true });
      } catch (e: any) {
        sonuclar.push({ urunId, basarili: false, hata: e?.message ?? String(e) });
      }
    }
  }

  const basarili = sonuclar.filter((s) => s.basarili).length;
  return { success: true, basarili, toplam: urunIds.length, sonuclar };
}

export async function topluUrunArsivle(urunIds: number[]) {
  return setTemplateActiveBatch(urunIds, false);
}

export async function topluUrunArsivdenCikar(urunIds: number[]) {
  return setTemplateActiveBatch(urunIds, true);
}

async function setVariantActiveBatch(variantIds: number[], active: boolean) {
  const sonuclar: Array<{ variantId: number; basarili: boolean; hata?: string }> = [];
  const BATCH = 50;
  const inactiveCtx = { context: { active_test: false } };

  for (let i = 0; i < variantIds.length; i += BATCH) {
    const batch = variantIds.slice(i, i + BATCH);
    for (const variantId of batch) {
      try {
        if (active) {
          const restore = await restoreArchivePrefixFromVariant(variantId, inactiveCtx);
          if (!restore.ok) {
            sonuclar.push({ variantId, basarili: false, hata: restore.reason });
            continue;
          }
        }

        await execute('product.product', 'write', [[variantId], { active }], inactiveCtx);

        if (!active) {
          await applyArchivePrefixToVariant(variantId, inactiveCtx);
        }

        sonuclar.push({ variantId, basarili: true });
      } catch (e: any) {
        sonuclar.push({ variantId, basarili: false, hata: e?.message ?? String(e) });
      }
    }
  }

  const basarili = sonuclar.filter((s) => s.basarili).length;
  return { success: true, basarili, toplam: variantIds.length, sonuclar };
}

export async function topluVaryantArsivle(variantIds: number[]) {
  return setVariantActiveBatch(variantIds, false);
}

export async function topluVaryantArsivdenCikar(variantIds: number[]) {
  return setVariantActiveBatch(variantIds, true);
}

export async function listFiyatBildirimleri(opts: {
  subeKodu?: string;
  okundu?: boolean;
  etiketBasildi?: boolean;
  limit?: number;
}) {
  const where: {
    subeKodu?: string;
    okundu?: boolean;
    etiketBasildi?: boolean;
  } = {};
  if (opts.subeKodu) where.subeKodu = opts.subeKodu;
  if (opts.okundu != null) where.okundu = opts.okundu;
  if (opts.etiketBasildi != null) where.etiketBasildi = opts.etiketBasildi;

  return prisma.fiyatDegisiklikBildirimi.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
  });
}

export async function fiyatBildirimSayac(subeKodu?: string) {
  const where: { okundu: boolean; subeKodu?: string } = { okundu: false };
  if (subeKodu) where.subeKodu = subeKodu;
  return prisma.fiyatDegisiklikBildirimi.count({ where });
}

export async function bildirimOkundu(id: string) {
  return prisma.fiyatDegisiklikBildirimi.update({
    where: { id },
    data: { okundu: true },
  });
}

export async function fiyatBildirimEtiketBasildi(id: string, opts?: { subeKodu?: string }) {
  const existing = await prisma.fiyatDegisiklikBildirimi.findUnique({ where: { id } });
  if (!existing) throw new Error('Bildirim bulunamadı');
  if (opts?.subeKodu && existing.subeKodu !== opts.subeKodu) {
    throw new Error('Bu bildirime erişim yetkiniz yok');
  }

  return prisma.fiyatDegisiklikBildirimi.update({
    where: { id },
    data: {
      etiketBasildi: true,
      etiketBasilmaTarihi: new Date(),
    },
  });
}

export async function fiyatBildirimEtiketBasildiToplu(ids: string[], opts?: { subeKodu?: string }) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return { count: 0 };

  const existing = await prisma.fiyatDegisiklikBildirimi.findMany({
    where: { id: { in: uniqueIds } },
  });
  if (existing.length !== uniqueIds.length) {
    throw new Error('Bazı bildirimler bulunamadı');
  }
  if (opts?.subeKodu) {
    const yetkisiz = existing.some((row) => row.subeKodu !== opts.subeKodu);
    if (yetkisiz) throw new Error('Bu bildirimlere erişim yetkiniz yok');
  }

  const result = await prisma.fiyatDegisiklikBildirimi.updateMany({
    where: { id: { in: uniqueIds } },
    data: {
      etiketBasildi: true,
      etiketBasilmaTarihi: new Date(),
    },
  });
  return { count: result.count };
}

export async function bildirimleriOkunduIsaretle(subeKodu?: string) {
  const where: { okundu: boolean; subeKodu?: string } = { okundu: false };
  if (subeKodu) where.subeKodu = subeKodu;
  const result = await prisma.fiyatDegisiklikBildirimi.updateMany({
    where,
    data: { okundu: true },
  });
  return result.count;
}

export async function getUrunLotlari(tmplId: number, lokasyon: string) {
  const locationId = LOKASYON_ID_MAP[lokasyon];
  if (!locationId) throw new Error('Geçersiz lokasyon');

  const variants = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', tmplId]]], {
    fields: ['id', 'lst_price', 'barcode', 'default_code'],
    limit: 500,
  })) ?? [];
  if (!variants.length) return [];

  const productIds = variants.map((v: { id: number }) => v.id);
  const priceMap = new Map<number, VariantMeta>(variants.map((v: any) => [v.id, {
    fiyat: Number(v.lst_price) || 0,
    barkod: v.barcode || v.default_code || null,
  }]));

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', productIds],
    ['location_id', '=', locationId],
    ['quantity', '>', 0],
    ['lot_id', '!=', false],
  ]], {
    fields: ['lot_id', 'quantity', 'product_id'],
    limit: 500,
  })) ?? [];

  return quants.map((q: any) => {
    const pid = m2oId(q.product_id) ?? 0;
    const meta = priceMap.get(pid) ?? { fiyat: 0, barkod: null };
    return {
      lotId: m2oId(q.lot_id),
      seriNo: m2oName(q.lot_id),
      adet: Number(q.quantity) || 1,
      fiyat: meta.fiyat,
      barkod: meta.barkod,
    };
  });
}

export type VaryantLotBilgisi = {
  productId: number;
  kategoriId: number | null;
  utsKodu: string | null;
  lotNo: string | null;
  lotId: number | null;
};

/** Varyant (product.product) için en güncel lot/UTS — stok girişi yoksa boş alanlar */
export async function getVaryantLotBilgisi(productId: number): Promise<VaryantLotBilgisi> {
  const bos: VaryantLotBilgisi = {
    productId,
    kategoriId: null,
    utsKodu: null,
    lotNo: null,
    lotId: null,
  };

  const products = (await execute('product.product', 'read', [[productId]], {
    fields: ['id', 'product_tmpl_id', 'categ_id'],
  })) ?? [];
  if (!products.length) return bos;

  const p = products[0];
  let kategoriId = m2oId(p.categ_id);
  if (!kategoriId) {
    const tmplId = m2oId(p.product_tmpl_id);
    if (tmplId) {
      const tmpls = (await execute('product.template', 'read', [[tmplId]], {
        fields: ['categ_id'],
      })) ?? [];
      kategoriId = m2oId(tmpls[0]?.categ_id);
    }
  }

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', '=', productId],
    ['lot_id', '!=', false],
    ['quantity', '>', 0],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['lot_id'],
    order: 'write_date desc, id desc',
    limit: 1,
  })) ?? [];

  if (!quants.length) {
    return { ...bos, kategoriId };
  }

  const q = quants[0];
  const lotId = m2oId(q.lot_id);
  let utsKodu: string | null = null;
  let lotNo = lotId ? m2oName(q.lot_id) || null : null;

  if (lotId) {
    try {
      const lots = (await execute('stock.lot', 'read', [[lotId]], {
        fields: ['name', 'x_uts_kodu'],
      })) ?? [];
      const lot = lots[0];
      if (lot) {
        lotNo = lot.name ? String(lot.name).trim() || lotNo : lotNo;
        if (lot.x_uts_kodu) {
          utsKodu = String(lot.x_uts_kodu).trim() || null;
        }
      }
    } catch {
      // x_uts_kodu alanı yoksa lot adından devam
    }
  }

  return {
    productId,
    kategoriId,
    utsKodu,
    lotNo,
    lotId,
  };
}

const ODOO_ALL_COMPANIES_KWARGS = {
  context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] },
};

function aggregateLocMapFromQuants(
  quants: Array<{ location_id?: unknown; quantity?: number; reserved_quantity?: number }>,
): Map<number, { qty: number; reserved: number }> {
  const locMap = new Map<number, { qty: number; reserved: number }>();
  for (const row of quants) {
    const locId = m2oId(row.location_id);
    if (!locId) continue;
    const prev = locMap.get(locId) ?? { qty: 0, reserved: 0 };
    prev.qty += Number(row.quantity) || 0;
    prev.reserved += Number(row.reserved_quantity) || 0;
    locMap.set(locId, prev);
  }
  return locMap;
}

function buildLokasyonStokList(locMap: Map<number, { qty: number; reserved: number }>): StokKontrolLokasyon[] {
  const branchCodes = Object.keys(LOKASYON_ID_MAP);
  const lokasyonlar: StokKontrolLokasyon[] = branchCodes.map((kod) => {
    const locId = LOKASYON_ID_MAP[kod];
    const data = locMap.get(locId) ?? { qty: 0, reserved: 0 };
    return { kod, miktar: data.qty, reserved: data.reserved };
  });
  for (const [locId, data] of locMap) {
    if (ODOO_LOCATION_TO_CODE[locId]) continue;
    lokasyonlar.push({
      kod: `#${locId}`,
      miktar: data.qty,
      reserved: data.reserved,
    });
  }
  return lokasyonlar;
}

export type StokKontrolLokasyon = {
  kod: string;
  miktar: number;
  reserved: number;
};

export type StokKontrolUrun = {
  productId: number;
  urunAdi: string;
  barkod: string;
  kategori: string;
  satisFiyati: number;
  kdvOrani: number;
  toplamStok: number;
  lokasyonlar: StokKontrolLokasyon[];
};

type StokKontrolFiltre = {
  q?: string;
  kategoriId?: number;
  fiyatMin?: number;
  fiyatMax?: number;
  stokDurumu?: 'var' | 'sifir';
  lokasyon?: string;
  kdv?: number;
};

export async function listStokKontrol(filtre: StokKontrolFiltre): Promise<StokKontrolUrun[]> {
  const q = filtre.q?.trim();
  const hasFilter = Boolean(
    q || filtre.kategoriId || filtre.fiyatMin != null || filtre.fiyatMax != null
    || filtre.stokDurumu || filtre.lokasyon || filtre.kdv,
  );
  if (!hasFilter) return [];

  const productDomain: unknown[] = [
    ['type', 'in', ['product', 'consu']],
    ['active', '=', true],
  ];
  if (q) {
    productDomain.push(
      '|', '|',
      ['name', 'ilike', q],
      ['default_code', 'ilike', q],
      ['barcode', 'ilike', q],
    );
  }
  if (filtre.kategoriId) {
    productDomain.push(['categ_id', 'child_of', filtre.kategoriId]);
  }
  if (filtre.fiyatMin != null) productDomain.push(['lst_price', '>=', filtre.fiyatMin]);
  if (filtre.fiyatMax != null) productDomain.push(['lst_price', '<=', filtre.fiyatMax]);

  const products = (await execute('product.product', 'search_read', [productDomain], {
    fields: [
      'id', 'display_name', 'name', 'default_code', 'barcode', 'categ_id', 'lst_price', 'taxes_id',
      'product_tmpl_id', 'product_template_attribute_value_ids',
    ],
    limit: 100,
    order: 'display_name asc',
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];

  if (!products.length) return [];

  const allPtavIds = [...new Set(
    products.flatMap((p: { product_template_attribute_value_ids?: number[] }) => p.product_template_attribute_value_ids ?? []),
  )] as number[];
  const ptavMap = await buildPtavMap(allPtavIds);

  const allTaxIds = [...new Set(
    products.flatMap((p: { taxes_id?: number[] }) => (Array.isArray(p.taxes_id) ? p.taxes_id : [])),
  )] as number[];
  const taxRateMap = await getTaxRateMap(allTaxIds);

  const productIds = products.map((p: { id: number }) => p.id);
  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', productIds],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'],
    limit: 10000,
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];

  const agg = new Map<number, Map<number, { qty: number; reserved: number }>>();
  for (const row of quants) {
    const pid = m2oId(row.product_id);
    const locId = m2oId(row.location_id);
    if (!pid || !locId) continue;
    if (!agg.has(pid)) agg.set(pid, new Map());
    const locMap = agg.get(pid)!;
    const prev = locMap.get(locId) ?? { qty: 0, reserved: 0 };
    prev.qty += Number(row.quantity) || 0;
    prev.reserved += Number(row.reserved_quantity) || 0;
    locMap.set(locId, prev);
  }

  let rows: StokKontrolUrun[] = products.map((p: any) => {
    const locMap = agg.get(p.id) ?? new Map();
    const lokasyonlar = buildLokasyonStokList(locMap);
    const taxId = Array.isArray(p.taxes_id) && p.taxes_id.length ? p.taxes_id[0] : null;
    const kdvOrani = taxId ? (taxRateMap.get(taxId) ?? 0) : 0;
    let toplamStok = lokasyonlar.reduce((s, l) => s + l.miktar, 0);
    if (filtre.lokasyon) {
      toplamStok = lokasyonlar.find((l) => l.kod === filtre.lokasyon)?.miktar ?? 0;
    }
    return {
      productId: p.id,
      urunAdi: buildUrunAdiFromProduct(p, ptavMap),
      barkod: typeof p.barcode === 'string' ? p.barcode : '',
      kategori: m2oName(p.categ_id),
      satisFiyati: Number(p.lst_price) || 0,
      kdvOrani,
      toplamStok,
      lokasyonlar,
    };
  });

  if (filtre.kdv === 10 || filtre.kdv === 20) {
    rows = rows.filter((r) => Math.round(r.kdvOrani) === filtre.kdv);
  }
  if (filtre.stokDurumu === 'var') rows = rows.filter((r) => r.toplamStok > 0);
  if (filtre.stokDurumu === 'sifir') rows = rows.filter((r) => r.toplamStok <= 0);

  return rows;
}

export type UrunStokSube = {
  kod: string;
  miktar: number;
  reserved: number;
  kullanilabilir: number;
};

export type UrunStokTumSubeler = {
  productId: number;
  urunAdi: string;
  tracking?: string;
  lokasyonlar: UrunStokSube[];
  toplamStok: number;
};

export async function getUrunStokTumSubeler(productId: number): Promise<UrunStokTumSubeler | null> {
  if (!Number.isFinite(productId) || productId <= 0) return null;

  const products = (await execute('product.product', 'read', [[productId]], {
    fields: ['id', 'display_name', 'name', 'tracking'],
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];
  if (!products.length) return null;

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', '=', productId],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['location_id', 'quantity', 'reserved_quantity'],
    limit: 10000,
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];

  const locMap = aggregateLocMapFromQuants(quants);
  const lokasyonlar = buildLokasyonStokList(locMap).map((l) => ({
    kod: l.kod,
    miktar: l.miktar,
    reserved: l.reserved,
    kullanilabilir: Math.max(0, l.miktar - l.reserved),
  }));
  const toplamStok = lokasyonlar.reduce((s, l) => s + l.miktar, 0);

  return {
    productId,
    urunAdi: products[0].display_name ?? products[0].name ?? '',
    tracking: products[0].tracking ?? 'none',
    lokasyonlar,
    toplamStok,
  };
}

const ACTIVE_PRODUCT_DOMAIN: unknown[] = [
  ['type', 'in', ['product', 'consu']],
  ['active', '=', true],
];

export type ExternalCatalogProduct = {
  barkod: string;
  ad: string;
  kategori: string;
  fiyat: number;
};

export type ExternalStockSube = {
  subeKodu: string;
  subeAdi: string;
  miktar: number;
};

export type ExternalStockRow = {
  barkod: string;
  urunAdi: string;
  toplamStok: number;
  subeler: ExternalStockSube[];
};

function mapOdooProductToCatalog(p: {
  display_name?: string;
  name?: string;
  barcode?: string | false;
  categ_id?: unknown;
  lst_price?: number;
}): ExternalCatalogProduct {
  return {
    barkod: typeof p.barcode === 'string' ? p.barcode : '',
    ad: p.display_name ?? p.name ?? '',
    kategori: m2oName(p.categ_id),
    fiyat: Number(p.lst_price) || 0,
  };
}

function mapLokasyonlarToSubeler(
  lokasyonlar: StokKontrolLokasyon[],
  branchNameMap: Map<string, string>,
): ExternalStockSube[] {
  return lokasyonlar.map((l) => ({
    subeKodu: l.kod,
    subeAdi: branchNameMap.get(l.kod) ?? l.kod,
    miktar: l.miktar,
  }));
}

async function fetchActiveProductsPage(offset: number, limit: number, extraDomain: unknown[] = []) {
  return (await execute('product.product', 'search_read', [[...ACTIVE_PRODUCT_DOMAIN, ...extraDomain]], {
    fields: ['id', 'display_name', 'name', 'barcode', 'categ_id', 'lst_price'],
    limit,
    offset,
    order: 'id asc',
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];
}

export async function countActiveProductsForExternal(extraDomain: unknown[] = []): Promise<number> {
  const count = await execute(
    'product.product',
    'search_count',
    [[...ACTIVE_PRODUCT_DOMAIN, ...extraDomain]],
    ODOO_ALL_COMPANIES_KWARGS,
  );
  return Number(count) || 0;
}

export async function listExternalCatalogProducts(opts: {
  page: number;
  pageSize: number;
}): Promise<{ data: ExternalCatalogProduct[]; totalCount: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;

  const [totalCount, products] = await Promise.all([
    countActiveProductsForExternal(ETICARET_KATEGORI_DOMAIN),
    fetchActiveProductsPage(offset, pageSize, ETICARET_KATEGORI_DOMAIN),
  ]);

  return {
    data: products.map(mapOdooProductToCatalog),
    totalCount,
    page,
    pageSize,
  };
}

async function buildStockRowsForProducts(
  products: Array<{
    id: number;
    display_name?: string;
    name?: string;
    barcode?: string | false;
  }>,
  branchNameMap: Map<string, string>,
): Promise<ExternalStockRow[]> {
  if (!products.length) return [];

  const productIds = products.map((p) => p.id);
  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', productIds],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'],
    limit: 10000,
    ...ODOO_ALL_COMPANIES_KWARGS,
  })) ?? [];

  const agg = new Map<number, Map<number, { qty: number; reserved: number }>>();
  for (const row of quants) {
    const pid = m2oId(row.product_id);
    const locId = m2oId(row.location_id);
    if (!pid || !locId) continue;
    if (!agg.has(pid)) agg.set(pid, new Map());
    const locMap = agg.get(pid)!;
    const prev = locMap.get(locId) ?? { qty: 0, reserved: 0 };
    prev.qty += Number(row.quantity) || 0;
    prev.reserved += Number(row.reserved_quantity) || 0;
    locMap.set(locId, prev);
  }

  return products.map((p) => {
    const locMap = agg.get(p.id) ?? new Map();
    const lokasyonlar = buildLokasyonStokList(locMap);
    const subeler = mapLokasyonlarToSubeler(lokasyonlar, branchNameMap);
    return {
      barkod: typeof p.barcode === 'string' ? p.barcode : '',
      urunAdi: p.display_name ?? p.name ?? '',
      toplamStok: lokasyonlar.reduce((s, l) => s + l.miktar, 0),
      subeler,
    };
  });
}

export async function listExternalStock(opts: {
  page: number;
  pageSize: number;
  barkod?: string;
  branchNameMap: Map<string, string>;
}): Promise<{ data: ExternalStockRow[]; totalCount: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;
  const barkod = opts.barkod?.trim();

  if (barkod) {
    const products = await fetchActiveProductsPage(0, 1, [...ETICARET_KATEGORI_DOMAIN, ['barcode', '=', barkod]]);
    const data = await buildStockRowsForProducts(products, opts.branchNameMap);
    return {
      data,
      totalCount: products.length,
      page: 1,
      pageSize: data.length || pageSize,
    };
  }

  const [totalCount, products] = await Promise.all([
    countActiveProductsForExternal(ETICARET_KATEGORI_DOMAIN),
    fetchActiveProductsPage(offset, pageSize, ETICARET_KATEGORI_DOMAIN),
  ]);
  const data = await buildStockRowsForProducts(products, opts.branchNameMap);

  return { data, totalCount, page, pageSize };
}
