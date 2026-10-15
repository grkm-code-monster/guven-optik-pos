/**
 * Temizlik — ALYSON SASSO OPTİK ÇERÇEVE MSSP8307MO/C63/51 artık ANA şablonda
 * (#11800, varyant #37994) temiz şekilde açıldı (bkz. alyson-sasso-ghost-arsivle.ts
 * ile hayalet engeller kaldırıldıktan sonra alyson-sasso-acil-varyant-ac).
 *
 * Önceki (başarısız/fallback) denemede, güvenlik ağı bu varyantı YANLIŞ yere —
 * ayrı bir izole şablona (#13624 "ALYSON SASSO OPTİK ÇERÇEVE MSSP8307MO",
 * varyant #37993) açmıştı. Bu script o yanlış kaydı arşivler (hem varyantı
 * hem de — başka varyantı yoksa — şablonun kendisini), katalogda çift/karışık
 * görünmesin.
 *
 * Kullanım:
 *   npm run alyson-sasso-izole-temizle
 *   npm run alyson-sasso-izole-temizle -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const YANLIS_VARYANT_ID = 37993;
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [v] = (await execute(
    'product.product', 'read', [[YANLIS_VARYANT_ID]],
    { fields: ['id', 'active', 'product_tmpl_id', 'display_name'], context: { active_test: false } },
  )) as { id: number; active: boolean; product_tmpl_id: [number, string]; display_name: string }[];

  if (!v) {
    console.log(`Varyant #${YANLIS_VARYANT_ID} bulunamadı — zaten temizlenmiş olabilir.`);
    return;
  }

  const tmplId = v.product_tmpl_id[0];
  console.log(`Varyant #${v.id} — "${v.display_name}" — şablon #${tmplId} "${v.product_tmpl_id[1]}" — aktif: ${v.active}`);

  const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', v.id]]]);
  const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', v.id]]]);
  console.log(`satış: ${sale}, stok hareketi: ${quant}`);

  if (sale > 0 || quant > 0) {
    console.log('\n⚠️  Bu varyantta satış/stok hareketi var — otomatik arşivlemiyorum, elle kontrol edin.');
    return;
  }

  const kardeşVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId], ['id', '!=', v.id]]],
    { fields: ['id'], context: { active_test: false } },
  )) as { id: number }[];
  console.log(`Aynı izole şablonda başka varyant sayısı: ${kardeşVaryantlar.length}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — --execute ile yapılacaklar:');
    console.log(`  1) Varyant #${v.id} arşivlenecek (active=false).`);
    if (kardeşVaryantlar.length === 0) {
      console.log(`  2) Başka varyantı olmadığı için şablon #${tmplId} de arşivlenecek (active=false).`);
    }
    console.log('\nGerçek çalıştırma için: npm run alyson-sasso-izole-temizle -- --execute');
    return;
  }

  await execute('product.product', 'write', [[v.id], { active: false }]);
  console.log(`✓ Varyant #${v.id} arşivlendi.`);

  if (kardeşVaryantlar.length === 0) {
    await execute('product.template', 'write', [[tmplId], { active: false }]);
    console.log(`✓ Şablon #${tmplId} arşivlendi (başka varyantı yoktu).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
