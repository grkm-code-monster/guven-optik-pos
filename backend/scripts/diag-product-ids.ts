import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const pickingId = 115;
  const moves = await execute(
    'stock.move',
    'search_read',
    [[['picking_id', '=', pickingId]]],
    { fields: ['id', 'product_id'], order: 'id asc' },
    2,
  );
  console.log('Moves:');
  for (const m of moves) {
    console.log(`  move ${m.id}: product_id=${m.product_id[0]} name=${m.product_id[1]}`);
  }

  const lotNames = [
    'IZE2026000025572-7n-0-001',
    'IZE2026000025572-7n-1-001',
    'IZE2026000025572-7n-2-001',
    'IZE2026000025572-7n-3-001',
  ];
  console.log('\nLots:');
  for (const name of lotNames) {
    const lots = await execute(
      'stock.lot',
      'search_read',
      [[['name', '=', name]]],
      { fields: ['id', 'product_id'] },
      2,
    );
    const l = lots[0];
    console.log(`  ${name}: lotId=${l?.id} product_id=${l?.product_id?.[0]}`);
  }

  // Check template vs variant for fotokromik products
  const templates = await execute(
    'product.template',
    'search_read',
    [[['default_code', 'ilike', 'ST.N.110']]],
    { fields: ['id', 'name', 'default_code', 'product_variant_ids'], limit: 5 },
    2,
  );
  console.log('\nTemplates ST.N.110:');
  for (const t of templates) {
    const variants = await execute(
      'product.product',
      'search_read',
      [[['product_tmpl_id', '=', t.id]]],
      { fields: ['id', 'default_code', 'display_name'] },
      2,
    );
    console.log(`  tmpl ${t.id} ${t.default_code}: variants`, variants.map((v: any) => `${v.id}:${v.default_code}`));
  }
}

main().catch(console.error);
