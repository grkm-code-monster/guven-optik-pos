import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';

export function ptavKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** FAZ 2 ile aynı güvenli silme kriterleri + Optik-POS SaleItem referansı */
export async function isVaryantGuvenleSilinebilir(odooProductId: number): Promise<boolean> {
  const rows = await execute(
    'product.product', 'search_read',
    [[['id', '=', odooProductId]]],
    { fields: ['id', 'default_code', 'barcode'], limit: 1 },
  ) as { id: number; default_code: string | false; barcode: string | false }[];

  if (!rows.length) return false;

  const v = rows[0];
  if (v.default_code || v.barcode) return false;

  const stokRows = await execute(
    'stock.quant', 'search_read',
    [[['product_id', '=', odooProductId], ['quantity', '>', 0]]],
    { fields: ['quantity'], limit: 50 },
  ) as { quantity: number }[];
  const stok = stokRows.reduce((s, r) => s + Number(r.quantity), 0);
  if (stok > 0) return false;

  const saleItemCount = await prisma.saleItem.count({
    where: { odooProductId: String(odooProductId) },
  });
  if (saleItemCount > 0) return false;

  const odooChecks = [
    'sale.order.line',
    'stock.move.line',
    'account.move.line',
    'purchase.order.line',
  ];
  for (const model of odooChecks) {
    const count = Number(await execute(model, 'search_count', [[['product_id', '=', odooProductId]]]));
    if (count > 0) return false;
  }

  return true;
}

export type ImportSonrasiTemizlikSonuc = {
  temizlenen: number;
  silinemedi: number[];
  kalanVaryant: number;
};

/**
 * Import sonrası: talep edilmeyen ve güvenle silinebilir varyantları kaldırır.
 * Sadece verilen şablon için çalışır.
 */
export async function temizleImportSonrasiVaryantlar(
  tmplId: number,
  korunanPtavKeys: Set<string>,
  korunanVaryantIds: Set<number>,
): Promise<ImportSonrasiTemizlikSonuc> {
  const tumVaryantlar = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
  ) as { id: number; product_template_attribute_value_ids: number[] }[];

  const silinecek: number[] = [];

  for (const v of tumVaryantlar) {
    const key = ptavKey(v.product_template_attribute_value_ids ?? []);
    const importKombinasyonu = korunanPtavKeys.has(key) || korunanVaryantIds.has(v.id);
    if (importKombinasyonu) continue;

    if (await isVaryantGuvenleSilinebilir(v.id)) {
      silinecek.push(v.id);
    }
  }

  const silinemedi: number[] = [];
  let temizlenen = 0;

  for (const batch of chunk(silinecek, 100)) {
    try {
      await execute('product.product', 'unlink', [batch]);
      temizlenen += batch.length;
    } catch {
      for (const id of batch) {
        try {
          await execute('product.product', 'unlink', [[id]]);
          temizlenen++;
        } catch {
          silinemedi.push(id);
        }
      }
    }
  }

  const kalanVaryant = Number(await execute('product.product', 'search_count', [
    [['product_tmpl_id', '=', Number(tmplId)]],
  ]));

  return { temizlenen, silinemedi, kalanVaryant };
}
