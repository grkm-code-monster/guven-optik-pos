import { execute } from '../odoo/odoo.service';
import {
  attrsFromPtavIds,
  buildPtavMap,
  varyantEtiketi,
} from '../odoo/odoo-variant-label.util';
import {
  exportTableCsv,
  exportTableExcel,
  exportTablePdf,
} from '../reports/report-export.service';
import { getStokUrunRowsByIds } from './stok-yonetimi.service';

export type StokExportFormat = 'pdf' | 'xlsx' | 'csv';

const inactiveCtx = { context: { active_test: false } };

function fmtFiyat(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getStokVaryantExportRows(variantIds: number[]) {
  const ids = [...new Set(variantIds.filter((id) => id > 0))];
  if (!ids.length) return [];

  const variants = (await execute(
    'product.product',
    'read',
    [ids],
    {
      fields: [
        'id', 'barcode', 'lst_price', 'standard_price',
        'product_tmpl_id', 'product_template_attribute_value_ids',
      ],
      ...inactiveCtx,
    },
  )) ?? [];

  const byId = new Map<number, any>(variants.map((v: { id: number }) => [v.id, v]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  const allPtavIds = [...new Set(
    ordered.flatMap((v: { product_template_attribute_value_ids?: number[] }) => v.product_template_attribute_value_ids ?? []),
  )];
  const ptavMap = await buildPtavMap(allPtavIds);

  return ordered.map((v: any) => {
    const attrs = attrsFromPtavIds(v.product_template_attribute_value_ids, ptavMap);
    const tmplName = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[1] : '';
    return {
      urunAdi: tmplName || '',
      nitelikEtiketi: varyantEtiketi(attrs),
      barkod: v.barcode || '',
      satisFiyati: Number(v.lst_price) || 0,
      maliyet: Number(v.standard_price) || 0,
    };
  });
}

async function renderExportBuffer(
  format: StokExportFormat,
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): Promise<Buffer> {
  if (format === 'pdf') return exportTablePdf({ title, headers, rows });
  if (format === 'xlsx') return exportTableExcel({ title, headers, rows });
  return exportTableCsv({ title, headers, rows });
}

export async function exportStokUrunleri(
  urunIds: number[],
  format: StokExportFormat,
): Promise<Buffer> {
  const data = await getStokUrunRowsByIds(urunIds);
  const headers = ['İç Referans', 'Ürün Adı', 'Kategori', 'Satış ₺', 'Alış ₺', 'KDV', 'Stok'];
  const rows = data.map((r) => [
    r.icReferans || '—',
    r.urunAdi,
    r.kategori || '—',
    fmtFiyat(r.satisFiyati),
    fmtFiyat(r.alisFiyati),
    r.kdvOrani ? `%${Math.round(r.kdvOrani)}` : '—',
    r.toplamStok,
  ]);
  return renderExportBuffer(format, 'Stok Ürünleri', headers, rows);
}

export async function exportStokVaryantlari(
  variantIds: number[],
  format: StokExportFormat,
): Promise<Buffer> {
  const data = await getStokVaryantExportRows(variantIds);
  const headers = ['Ürün Adı', 'Nitelik Etiketi', 'Barkod', 'Satış ₺', 'Maliyet ₺'];
  const rows = data.map((r) => [
    r.urunAdi,
    r.nitelikEtiketi,
    r.barkod || '—',
    fmtFiyat(r.satisFiyati),
    fmtFiyat(r.maliyet),
  ]);
  return renderExportBuffer(format, 'Stok Varyantları', headers, rows);
}

export function stokExportContentType(format: StokExportFormat): string {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'text/csv; charset=utf-8';
}

export function stokExportExtension(format: StokExportFormat): string {
  if (format === 'pdf') return 'pdf';
  if (format === 'xlsx') return 'xlsx';
  return 'csv';
}

export function stokExportFilename(prefix: string, format: StokExportFormat): string {
  const tarih = new Date().toISOString().slice(0, 10);
  return `${prefix}-${tarih}.${stokExportExtension(format)}`;
}
