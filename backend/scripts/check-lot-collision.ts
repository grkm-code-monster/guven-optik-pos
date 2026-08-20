/**
 * "Seri numarası kullanılmaktadır" hatasının kök nedenini teşhis eder.
 * Belirli barkodlar için Odoo'daki TÜM stock.lot kayıtlarını (her lokasyonda,
 * arşivli dahil) listeler.
 *
 * Kullanım:
 *   cd backend
 *   npm run check-lot-collision -- 8680000000050,8680000000056
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const barkodlar = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!barkodlar.length) {
    console.log('Kullanım: npm run check-lot-collision -- BARKOD1,BARKOD2');
    return;
  }

  for (const barkod of barkodlar) {
    console.log('='.repeat(70));
    console.log(`Barkod: ${barkod}`);
    console.log('='.repeat(70));

    const products = (await execute(
      'product.product',
      'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'name', 'default_code'], context: { active_test: false } },
    )) as Array<{ id: number; name: string; default_code: string | false }>;

    if (!products.length) {
      console.log('  Ürün bulunamadı.');
      continue;
    }

    for (const p of products) {
      console.log(`  Ürün #${p.id}: ${p.name} (kod: ${p.default_code || '-'})`);

      const lots = (await execute(
        'stock.lot',
        'search_read',
        [[['product_id', '=', p.id]]],
        { fields: ['id', 'name', 'product_qty'], context: { active_test: false }, limit: 50 },
      )) as Array<{ id: number; name: string; product_qty: number }>;

      console.log(`    Bu ürüne ait lot sayısı: ${lots.length}`);
      for (const l of lots) {
        console.log(`      lot #${l.id} "${l.name}" qty:${l.product_qty}`);
      }

      const quants = (await execute(
        'stock.quant',
        'search_read',
        [[['product_id', '=', p.id]]],
        { fields: ['id', 'location_id', 'lot_id', 'quantity'], context: { active_test: false }, limit: 50 },
      )) as Array<{ id: number; location_id: [number, string]; lot_id: [number, string] | false; quantity: number }>;

      console.log(`    Bu ürüne ait quant sayısı: ${quants.length}`);
      for (const q of quants) {
        console.log(`      quant #${q.id} lokasyon:${q.location_id?.[1]} lot:${q.lot_id ? q.lot_id[1] : '-'} miktar:${q.quantity}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
