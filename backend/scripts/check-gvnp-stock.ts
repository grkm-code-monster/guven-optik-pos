/**
 * GVNP lokasyonundaki (id 66) mevcut stok kayıtlarını (stock.quant) listeler.
 * Excel'den toplu import yapmadan ÖNCE mevcut durumu görmek için.
 *
 * Kullanım:
 *   cd backend
 *   npm run check-gvnp-stock
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const GVNP_LOCATION_ID = 66;

async function main() {
  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['location_id', '=', GVNP_LOCATION_ID], ['quantity', '!=', 0]]],
    { fields: ['id', 'product_id', 'lot_id', 'quantity'], limit: 5000 },
  )) as Array<{ id: number; product_id: [number, string]; lot_id: [number, string] | false; quantity: number }>;

  console.log(`GVNP (location #${GVNP_LOCATION_ID}) üzerinde sıfır olmayan stok satırı: ${quants.length}`);
  for (const q of quants.slice(0, 50)) {
    console.log(`  #${q.id} ürün: ${q.product_id?.[1]} | lot: ${q.lot_id ? q.lot_id[1] : '-'} | miktar: ${q.quantity}`);
  }
  if (quants.length > 50) console.log(`  ... ve ${quants.length - 50} satır daha`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
