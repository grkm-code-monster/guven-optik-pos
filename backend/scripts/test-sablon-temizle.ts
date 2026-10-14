/**
 * test-izole-fallback.ts'in oluşturduğu test şablonunu ("ALLIGATOR OPTİK
 * ÇERÇEVE TESTMODEL999", #13613) arşivler — satış/stok referansı yok,
 * güvenle arşivlenebilir. SALT OKUNUR DEĞİL ama sadece active=false yapar,
 * hiçbir şey silmez.
 *
 * Kullanım:
 *   npm run test-sablon-temizle -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [tmpl] = (await execute(
    'product.template', 'search_read',
    [[['name', '=', 'ALLIGATOR OPTİK ÇERÇEVE TESTMODEL999']]],
    { fields: ['id', 'name', 'active'], limit: 1, context: { active_test: false } },
  )) as { id: number; name: string; active: boolean }[];

  if (!tmpl) {
    console.log('Test şablonu bulunamadı — zaten temizlenmiş olabilir.');
    return;
  }

  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmpl.id]]],
    { fields: ['id'], context: { active_test: false } },
  )) as { id: number }[];

  for (const v of variants) {
    const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', v.id]]]);
    const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', v.id]]]);
    console.log(`Varyant #${v.id}: sale.order.line=${sale} stock.quant=${quant}`);
    if (Number(sale) > 0 || Number(quant) > 0) {
      console.log('⚠️  Referansı var — güvenlik için DURDURULDU, elle kontrol et.');
      return;
    }
  }

  console.log(`Şablon #${tmpl.id} "${tmpl.name}" arşivlenecek (${variants.length} varyant).`);
  if (!EXECUTE) {
    console.log('DRY RUN — gerçek arşivleme için --execute ekleyin.');
    return;
  }
  await execute('product.template', 'write', [[tmpl.id], { active: false }]);
  console.log('✓ Arşivlendi.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
