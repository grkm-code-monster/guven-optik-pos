import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';

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
): Promise<Map<number, number>> {
  const stockMap = new Map<number, number>();
  if (!tmplIds.length) return stockMap;

  const variants = (await execute('product.product', 'search_read', [[['product_tmpl_id', 'in', tmplIds]]], {
    fields: ['id', 'product_tmpl_id'],
    limit: 5000,
  })) ?? [];

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

  const domain: unknown[] = [['type', 'in', ['product', 'consu']], ['active', '=', true]];
  if (filtre.q?.trim()) {
    const q = filtre.q.trim();
    domain.push('|', ['name', 'ilike', q], ['default_code', 'ilike', q]);
  }
  if (filtre.kategoriId) domain.push(['categ_id', 'child_of', filtre.kategoriId]);
  if (filtre.fiyatMin != null) domain.push(['list_price', '>=', filtre.fiyatMin]);
  if (filtre.fiyatMax != null) domain.push(['list_price', '<=', filtre.fiyatMax]);

  const fields = ['id', 'name', 'default_code', 'categ_id', 'list_price', 'standard_price', 'taxes_id', 'active'];
  const templates = (await execute('product.template', 'search_read', [domain], {
    fields,
    limit: limit + 200,
    order: 'name asc',
  })) ?? [];

  const tmplIds = templates.map((t: { id: number }) => t.id);
  const stockMap = await getTemplateStockMap(tmplIds, filtre.lokasyon);

  const allTaxIds = [...new Set(
    templates.flatMap((t: { taxes_id?: number[] }) => (Array.isArray(t.taxes_id) ? t.taxes_id : [])),
  )] as number[];
  const taxRateMap = await getTaxRateMap(allTaxIds);

  let rows: StokUrunRow[] = templates.map((t: any) => {
    const taxId = Array.isArray(t.taxes_id) && t.taxes_id.length ? t.taxes_id[0] : null;
    const kdvOrani = taxId ? (taxRateMap.get(taxId) ?? 0) : 0;
    const toplamStok = stockMap.get(t.id) ?? 0;
    return {
      id: t.id,
      icReferans: t.default_code || '',
      urunAdi: t.name,
      kategori: m2oName(t.categ_id),
      kategoriId: m2oId(t.categ_id),
      satisFiyati: Number(t.list_price) || 0,
      alisFiyati: Number(t.standard_price) || 0,
      kdvOrani,
      toplamStok,
      aktif: !!t.active,
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
}) {
  if (opts.eskiFiyat === opts.yeniFiyat) return [];
  const subeler = await findBranchesWithStock(opts.urunId);
  if (!subeler.length) return [];

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
    fields: ['id', 'name', 'list_price', 'standard_price'],
  }))?.[0];
  if (!tmpl) throw new Error('Ürün bulunamadı');

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
    });
    bildirimler.push(...kayitlar);
  }

  if (opts.alisFiyati != null) {
    const eski = Number(tmpl.standard_price) || 0;
    const yeni = Number(opts.alisFiyati);
    writeVals.standard_price = yeni;
    const kayitlar = await olusturFiyatBildirimleri({
      urunId: opts.urunId,
      urunAdi: tmpl.name,
      eskiFiyat: eski,
      yeniFiyat: yeni,
      fiyatTipi: 'ALIS',
      degistirenUserId: opts.degistirenUserId,
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
      fields: ['id', 'name', 'list_price', 'standard_price'],
    })) ?? [];

    for (const tmpl of templates) {
      try {
        const writeVals: Record<string, number> = {};
        const satis = Number(tmpl.list_price) || 0;
        const alis = Number(tmpl.standard_price) || 0;

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
          });
        }
        if (opts.hedef === 'alis' || opts.hedef === 'her_ikisi') {
          const yeni = hesapla(alis);
          writeVals.standard_price = yeni;
          await olusturFiyatBildirimleri({
            urunId: tmpl.id,
            urunAdi: tmpl.name,
            eskiFiyat: alis,
            yeniFiyat: yeni,
            fiyatTipi: 'ALIS',
            degistirenUserId: opts.degistirenUserId,
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

export async function listFiyatBildirimleri(opts: {
  subeKodu?: string;
  okundu?: boolean;
  limit?: number;
}) {
  const where: { subeKodu?: string; okundu?: boolean } = {};
  if (opts.subeKodu) where.subeKodu = opts.subeKodu;
  if (opts.okundu != null) where.okundu = opts.okundu;

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
