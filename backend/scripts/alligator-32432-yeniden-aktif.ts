/**
 * Kök neden bulundu: ALLIGATOR OPTİK ÇERÇEVE (#1984) şablonuna ALL146AO/C4/50
 * veya ALL146AO/C112/50 kombinasyonlarından biri açılmaya çalışılınca Odoo
 * "duplicate key ... product_product_combination_unique" hatası veriyor —
 * çünkü o kombinasyon zaten var ama ARŞİVLİ (varyant #32432, active=false,
 * 1 sale.order.line referansı var, bu yüzden tamamen silinememiş). Postgres
 * UNIQUE kısıtlaması arşivli kayıtları da saydığı için Odoo aynı kombinasyonla
 * yeni bir aktif varyant oluşturamıyor.
 *
 * Bu script #32432'nin gerçek nitelik kombinasyonunu okur, hangi istenen
 * satıra karşılık geldiğini gösterir ve (--execute ile) sadece active=true
 * yaparak YENİDEN AKTİF EDER (yeni kayıt oluşturmaz, mevcut satış geçmişini
 * korur). Ardından KALAN satır(lar) normal dinamik import ile denenebilir.
 *
 * Kullanım:
 *   npm run alligator-32432-yeniden-aktif
 *   npm run alligator-32432-yeniden-aktif -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const VARYANT_ID = 32432;
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [v] = (await execute(
    'product.product', 'read', [[VARYANT_ID]],
    { fields: ['id', 'active', 'barcode', 'product_template_attribute_value_ids'], context: { active_test: false } },
  )) as { id: number; active: boolean; barcode: string | false; product_template_attribute_value_ids: number[] }[];

  if (!v) throw new Error(`Varyant #${VARYANT_ID} bulunamadı`);

  const ptavlar = (await execute(
    'product.template.attribute.value', 'read',
    [v.product_template_attribute_value_ids],
    { fields: ['id', 'name', 'attribute_id'] },
  )) as { id: number; name: string; attribute_id: [number, string] }[];

  console.log(`Varyant #${VARYANT_ID} — aktif: ${v.active} — barkod: ${v.barcode || '-'}`);
  console.log('Nitelik kombinasyonu:');
  for (const p of ptavlar) console.log(`  ${p.attribute_id[1]}: ${p.name}`);

  const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', VARYANT_ID]]]);
  const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', VARYANT_ID]]]);
  console.log(`\nsale.order.line=${sale} stock.quant=${quant}`);

  if (v.active) {
    console.log('\nZaten aktif — yapılacak bir şey yok.');
    return;
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN: --execute ile bu varyant active=true yapılacak (yeni kayıt OLUŞTURULMAYACAK, mevcut satır yeniden aktif edilecek).');
    return;
  }

  await execute('product.product', 'write', [[VARYANT_ID], { active: true }]);
  console.log('\n✓ Varyant yeniden aktif edildi.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
