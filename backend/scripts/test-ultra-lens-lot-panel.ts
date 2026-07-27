/**
 * ULTRA lens — searchUrunLotsByProduct test
 * npx tsx scripts/test-ultra-lens-lot-panel.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';

const BARKODLAR = ['785812139987', '785812139970', '785811314804'];
const ctx = { context: { active_test: false } };

async function main() {
  for (const barkod of BARKODLAR) {
    const products = (await execute(
      'product.product',
      'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'display_name'], limit: 1, ...ctx },
    )) ?? [];
    const p = products[0];
    if (!p) {
      console.log(`\n${barkod}: ürün yok`);
      continue;
    }
    console.log(`\n${barkod} → #${p.id} ${p.display_name}`);
    try {
      const lots = await searchUrunLotsByProduct(p.id, 'ANADEPO');
      console.log(`  searchUrunLotsByProduct(ANADEPO): ${lots.length} satır`);
      for (const l of lots) {
        console.log(`    lotNo=${l.lotNo} uts=${l.utsKodu ?? '—'} stok=${l.stok}`);
      }
    } catch (e) {
      console.log(`  HATA: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
