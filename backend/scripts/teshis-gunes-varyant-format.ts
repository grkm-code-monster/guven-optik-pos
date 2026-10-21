/**
 * Salt-okunur: canli Odoo'da bir marka icin product.product kayitlarinin
 * gercek alan formatini gosterir (display_name'de model/renk/olcu nasil
 * yaziliyor?) — GUNES envanteri icin canli eslestirme scripti yazmadan once
 * bu formati dogrulamak icin.
 *
 * Kullanim:
 *   npm run teshis-gunes-varyant-format -- --marka="1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ"
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const arg = process.argv.find((a) => a.startsWith('--marka='));
  const marka = arg ? arg.slice('--marka='.length).replace(/^"|"$/g, '') : null;
  return { marka };
}

async function main() {
  const { marka } = parseArgs();
  if (!marka) {
    console.log('Kullanım: npm run teshis-gunes-varyant-format -- --marka="1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ"');
    process.exit(1);
  }

  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id.name', '=', marka]]],
    { fields: ['id', 'name', 'display_name', 'barcode', 'product_template_attribute_value_ids'], limit: 10, context: { active_test: false } },
  )) as Array<{ id: number; name: string; display_name: string; barcode: string | false; product_template_attribute_value_ids: number[] }>;
  console.log(`${variants.length} varyant bulundu (marka: ${marka})`);
  for (const v of variants) {
    console.log(JSON.stringify(v));
  }

  if (variants.length && variants[0].product_template_attribute_value_ids?.length) {
    const attrIds = variants[0].product_template_attribute_value_ids;
    const attrs = await execute(
      'product.template.attribute.value', 'read',
      [attrIds],
      { fields: ['id', 'name', 'attribute_id'], context: { active_test: false } },
    );
    console.log('\nBirinci varyantin nitelik degerleri:', JSON.stringify(attrs));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
