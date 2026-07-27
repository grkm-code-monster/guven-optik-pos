import ExcelJS from 'exceljs';
import { attrsFromPtavIds, buildPtavMap } from '../odoo/odoo-variant-label.util';
import { execute } from '../odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from './envanter-import.constants';

const inactiveCtx = { context: { active_test: false } };

function m2oName(val: unknown): string {
  if (Array.isArray(val) && val[1]) return String(val[1]);
  return '';
}

function m2oId(val: unknown): number {
  if (Array.isArray(val) && val[0]) return Number(val[0]);
  return 0;
}

function odooStrVal(v: unknown): string {
  if (v === false || v == null) return '';
  return String(v).trim();
}

async function getTaxRateMap(taxIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(taxIds.filter((id) => id > 0))];
  if (!ids.length) return map;

  const taxes = (await execute('account.tax', 'read', [ids], {
    fields: ['id', 'amount'],
  })) ?? [];
  for (const t of taxes) {
    map.set(t.id, Number(t.amount) || 0);
  }
  return map;
}

type StokluLot = {
  lotId: number;
  lotName: string;
  utsKodu: string;
};

async function getStokluLotlarByVariant(productIds: number[]): Promise<Map<number, StokluLot[]>> {
  const map = new Map<number, StokluLot[]>();
  if (!productIds.length) return map;

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', productIds],
    ['lot_id', '!=', false],
    ['location_id.usage', '=', 'internal'],
    ['quantity', '>', 0],
  ]], {
    fields: ['product_id', 'lot_id'],
    limit: 10000,
    ...inactiveCtx,
  })) ?? [];

  const lotIdsByProduct = new Map<number, Set<number>>();
  for (const q of quants) {
    const pid = m2oId(q.product_id);
    const lid = m2oId(q.lot_id);
    if (!pid || !lid) continue;
    const set = lotIdsByProduct.get(pid) ?? new Set<number>();
    set.add(lid);
    lotIdsByProduct.set(pid, set);
  }

  const allLotIds = [...new Set([...lotIdsByProduct.values()].flatMap((s) => [...s]))];
  if (!allLotIds.length) return map;

  const lots = (await execute('stock.lot', 'read', [allLotIds], {
    fields: ['id', 'name', 'x_uts_kodu', 'product_id'],
    ...inactiveCtx,
  })) ?? [];

  const lotById = new Map<number, typeof lots[0]>(lots.map((l: { id: number }) => [l.id, l]));

  for (const [pid, lotIdSet] of lotIdsByProduct) {
    const rows: StokluLot[] = [...lotIdSet]
      .map((lotId) => {
        const lot = lotById.get(lotId);
        if (!lot) return null;
        return {
          lotId: lot.id,
          lotName: lot.name ?? '',
          utsKodu: odooStrVal(lot.x_uts_kodu),
        };
      })
      .filter(Boolean) as StokluLot[];
    rows.sort((a, b) => a.lotName.localeCompare(b.lotName, 'tr') || a.lotId - b.lotId);
    map.set(pid, rows);
  }

  return map;
}

export async function buildUtsDuzeltmeSablonBuffer(productIds: number[]): Promise<Buffer> {
  const ids = [...new Set(productIds.filter((id) => id > 0))];
  if (!ids.length) {
    throw new Error('En az bir ürün seçilmeli');
  }

  const products = (await execute('product.product', 'read', [ids], {
    fields: [
      'id', 'barcode', 'lst_price', 'standard_price', 'taxes_id',
      'product_tmpl_id', 'product_template_attribute_value_ids', 'categ_id',
    ],
    ...inactiveCtx,
  })) ?? [];

  const byId = new Map<number, typeof products[0]>(products.map((p: { id: number }) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  const allPtavIds = [...new Set(
    ordered.flatMap((p: { product_template_attribute_value_ids?: number[] }) => p.product_template_attribute_value_ids ?? []),
  )];
  const ptavMap = await buildPtavMap(allPtavIds);

  const allTaxIds = [...new Set(
    ordered.flatMap((p: { taxes_id?: number[] }) => (Array.isArray(p.taxes_id) ? p.taxes_id : [])),
  )] as number[];
  const taxRateMap = await getTaxRateMap(allTaxIds);
  const lotMap = await getStokluLotlarByVariant(ids);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.columns = ENVANTER_IMPORT_HEADERS.map((h) => ({
    header: h,
    width: Math.max(12, h.length + 2),
  }));

  const textHeaders = ['Barkod', 'UTS Kodu', 'Odoo Varyant ID', 'Lot No', 'Odoo Lot ID'] as const;
  const textCols = textHeaders.map((h) => ENVANTER_IMPORT_HEADERS.indexOf(h) + 1);

  let rowNum = 2;
  for (const p of ordered) {
    const attrs = attrsFromPtavIds(p.product_template_attribute_value_ids, ptavMap);
    const tmplName = m2oName(p.product_tmpl_id);
    const kategori = m2oName(p.categ_id);
    const taxId = Array.isArray(p.taxes_id) && p.taxes_id.length ? p.taxes_id[0] : null;
    const kdvOrani = taxId ? (taxRateMap.get(taxId) ?? 0) : 0;
    const barkod = typeof p.barcode === 'string' ? p.barcode : '';
    const lots = lotMap.get(p.id) ?? [];

    if (!lots.length) continue;

    for (const lot of lots) {
      const rowValues: Record<string, string | number> = {
        Kategori: kategori,
        'Ürün Adı': tmplName,
        Model: attrs.MODEL ?? '',
        Renk: attrs.RENK ?? '',
        Ölçü: attrs['ÖLÇÜ'] ?? '',
        Barkod: barkod,
        'UTS Kodu': lot.utsKodu,
        Adet: 1,
        'Satış Fiyatı': Number(p.lst_price) || 0,
        'Maliyet Fiyatı': Number(p.standard_price) || 0,
        'KDV Oranı': kdvOrani,
        'Odoo Varyant ID': p.id,
        'Lot No': lot.lotName,
        'Odoo Lot ID': lot.lotId,
      };

      ws.addRow(ENVANTER_IMPORT_HEADERS.map((h) => rowValues[h] ?? ''));
      for (const col of textCols) ws.getCell(rowNum, col).numFmt = '@';
      rowNum++;
    }
  }

  if (rowNum === 2) {
    throw new Error('Seçili ürünlerde stoklu lot bulunamadı');
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function countUtsDuzeltmeSablonSatirlari(productIds: number[]): Promise<number> {
  const lotMap = await getStokluLotlarByVariant([...new Set(productIds.filter((id) => id > 0))]);
  let total = 0;
  for (const lots of lotMap.values()) total += lots.length;
  return total;
}
