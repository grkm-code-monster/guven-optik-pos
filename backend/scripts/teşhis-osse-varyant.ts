/**
 * OSSE OPTİK ÇERÇEVE varyant teşhisi
 * npx tsx backend/scripts/teşhis-osse-varyant.ts
 */
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  console.log('=== OSSE varyant teşhisi ===\n');

  const templates = await execute(
    'product.template',
    'search_read',
    [[['name', 'ilike', 'OSSE'], ['active', '=', true]]],
    {
      fields: ['id', 'name', 'default_code', 'attribute_line_ids', 'product_variant_count'],
      limit: 20,
    },
  );

  console.log(`product.template (OSSE ilike): ${templates.length} kayıt\n`);
  for (const t of templates) {
    console.log(`--- Template #${t.id}: ${t.name} ---`);
    console.log(`  default_code: ${t.default_code ?? '—'}`);
    console.log(`  product_variant_count (Odoo alanı): ${t.product_variant_count ?? '—'}`);
    console.log(`  attribute_line_ids: ${JSON.stringify(t.attribute_line_ids ?? [])}`);

    if (t.attribute_line_ids?.length) {
      const lines = await execute(
        'product.template.attribute.line',
        'read',
        [t.attribute_line_ids],
        { fields: ['id', 'attribute_id', 'value_ids', 'product_template_value_ids'] },
      );
      for (const line of lines) {
        console.log(
          `  attr line ${line.id}: ${line.attribute_id?.[1]} → value_ids=${(line.value_ids ?? []).length}`,
        );
      }
    }

    const variants = await execute(
      'product.product',
      'search_read',
      [[['product_tmpl_id', '=', t.id], ['active', '=', true]]],
      {
        fields: [
          'id',
          'name',
          'default_code',
          'barcode',
          'combination_indices',
          'product_template_attribute_value_ids',
        ],
        limit: 100,
      },
    );

    console.log(`  product.product (active): ${variants.length} varyant`);
    for (const v of variants.slice(0, 15)) {
      const attrCount = v.product_template_attribute_value_ids?.length ?? 0;
      console.log(
        `    #${v.id} ${v.name} | kod=${v.default_code ?? '—'} | attr_vals=${attrCount}`,
      );
    }
    if (variants.length > 15) console.log(`    ... +${variants.length - 15} daha`);

    // urun-varyanlar endpoint mantığı
    const sonuclar = [];
    for (const v of variants) {
      const attrVals =
        v.product_template_attribute_value_ids?.length > 0
          ? await execute(
              'product.template.attribute.value',
              'read',
              [v.product_template_attribute_value_ids],
              { fields: ['id', 'name', 'attribute_id'] },
            )
          : [];
      sonuclar.push({
        id: v.id,
        name: v.name,
        nitelikler: attrVals.map((a: { attribute_id?: [number, string]; name?: string }) => ({
          nitelikAdi: a.attribute_id?.[1],
          degerAdi: a.name,
        })),
      });
    }
    console.log(`  /admin/urun-varyanlar/${t.id} simülasyonu: ${sonuclar.length} kayıt döner`);
    if (sonuclar.length <= 5) {
      console.log(JSON.stringify(sonuclar, null, 2));
    }
    console.log('');
  }

  // OS132 araması
  console.log('--- urun-ara benzeri arama: OS132 ---');
  const os132 = await execute(
    'product.template',
    'search_read',
    [[['|', ['name', 'ilike', 'OS132'], ['default_code', 'ilike', 'OS132']], ['active', '=', true]]],
    { fields: ['id', 'name', 'default_code'], limit: 10 },
  );
  console.log(JSON.stringify(os132, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
