/**
 * Teşhis: "Stok Yönetimi" ekranında VİVALDİ OPTİK ÇERÇEVE (#1983) neden
 * görünmüyor, oysa aynı yöntemle açılan diğer 39 marka görünüyor?
 * #1983'ü yeni oluşturulan bir şablonla (örn. #12516 QUANTUM) alan alan
 * karşılaştırır. Hiçbir şey değiştirmez.
 *
 * Kullanım: npm run vivaldi-tanisi
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const ALANLAR = [
  'id', 'name', 'active', 'sale_ok', 'purchase_ok', 'type',
  'categ_id', 'company_id', 'list_price', 'standard_price',
  'taxes_id', 'tracking', 'product_variant_count',
];

async function main() {
  const tmpls = (await execute(
    'product.template', 'read',
    [[1983, 12516]],
    { fields: ALANLAR, context: { active_test: false } },
  )) as any[];

  for (const t of tmpls) {
    console.log(`\n--- product.template #${t.id} (${t.name}) ---`);
    for (const k of ALANLAR) console.log(`  ${k}:`, JSON.stringify(t[k]));
  }

  // Varyant seviyesinde de bak
  for (const tid of [1983, 12516]) {
    const variants = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', tid]]],
      { fields: ['id', 'active', 'default_code', 'barcode'], context: { active_test: false }, limit: 5 },
    )) as any[];
    console.log(`\n--- #${tid} ilk 5 varyant (active_test:false) ---`);
    for (const v of variants) console.log(' ', v);

    const activeOnly = (await execute(
      'product.product', 'search_count',
      [[['product_tmpl_id', '=', tid]]],
    )) as number;
    console.log(`  Sadece AKTİF varyant sayısı: ${activeOnly}`);
  }

  // Şube/stok lokasyonu ile ilişkisi var mı? (branch alanı varsa)
  try {
    const branches = (await execute(
      'stock.quant', 'search_read',
      [[['product_tmpl_id', 'in', [1983, 12516]]]],
      { fields: ['id', 'product_id', 'location_id', 'company_id'], limit: 10 },
    )) as any[];
    console.log('\n--- stock.quant kayıtları (ilk 10) ---');
    for (const q of branches) console.log(' ', q);
  } catch (e: any) {
    console.log('\nstock.quant sorgusu hata verdi (önemli değil):', e?.message ?? e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
