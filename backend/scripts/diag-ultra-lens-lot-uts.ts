/**
 * ULTRA KONTAKT LENS lot/UTS teşhisi — sadece okuma, kod değişikliği yok
 * npx tsx scripts/diag-ultra-lens-lot-uts.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const BARKODLAR = ['785812139987', '785812139970', '785811314804'];
const ctx = { context: { active_test: false } };

async function main() {
  console.log('=== ULTRA KONTAKT LENS LOT/UTS TEŞHİSİ ===\n');

  for (const barkod of BARKODLAR) {
    console.log(`--- Barkod: ${barkod} ---`);
    const products = (await execute(
      'product.product',
      'search_read',
      [[['barcode', '=', barkod]]],
      {
        fields: ['id', 'display_name', 'barcode', 'active', 'tracking', 'company_id', 'product_tmpl_id'],
        ...ctx,
      },
    )) ?? [];

    if (!products.length) {
      console.log('  Ürün bulunamadı (bu barkodla).');
      console.log('');
      continue;
    }

    for (const p of products) {
      console.log(`  #${p.id} active=${p.active} tracking=${p.tracking} company=${p.company_id?.[1] ?? '—'} | ${p.display_name}`);

      const lots = (await execute(
        'stock.lot',
        'search_read',
        [[['product_id', '=', p.id]]],
        { fields: ['id', 'name', 'x_uts_kodu', 'ref', 'company_id'], limit: 20, ...ctx },
      )) ?? [];
      console.log(`    stock.lot kayıtları: ${lots.length}`);
      for (const l of lots) {
        console.log(`      lot#${l.id} name="${l.name}" uts=${l.x_uts_kodu ?? '—'} ref=${l.ref ?? '—'} company=${l.company_id?.[1] ?? '—'}`);
      }

      const quants = (await execute(
        'stock.quant',
        'search_read',
        [[['product_id', '=', p.id]]],
        { fields: ['location_id', 'quantity', 'lot_id', 'company_id'], limit: 20, ...ctx },
      )) ?? [];
      console.log(`    stock.quant kayıtları (tüm lokasyonlar, sıfır dahil): ${quants.length}`);
      for (const q of quants) {
        console.log(`      loc="${q.location_id?.[1]}" qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'} company=${q.company_id?.[1] ?? '—'}`);
      }

      const moveLines = (await execute(
        'stock.move.line',
        'search_read',
        [[['product_id', '=', p.id]]],
        { fields: ['id', 'lot_id', 'state', 'location_id', 'location_dest_id', 'quantity'], limit: 20, order: 'id desc', ...ctx },
      )) ?? [];
      console.log(`    stock.move.line kayıtları: ${moveLines.length}`);
      for (const ml of moveLines) {
        console.log(`      ml#${ml.id} state=${ml.state} lot=${ml.lot_id?.[1] ?? '—'} ${ml.location_id?.[1]} → ${ml.location_dest_id?.[1]} qty=${ml.quantity}`);
      }
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
