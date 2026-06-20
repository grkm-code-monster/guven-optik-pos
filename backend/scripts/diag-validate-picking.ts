import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const lots = await execute(
    'stock.lot',
    'search_read',
    [[['name', 'ilike', 'IZE2026000025572']]],
    { fields: ['id', 'name', 'product_id', 'company_id'], order: 'id desc', limit: 20 },
    2,
  );
  console.log('Lots:', lots.length);
  for (const l of lots) {
    console.log(`  ${l.id} ${l.name} product=${l.product_id?.[1]}`);
  }

  const pickingId = 115;
  try {
    const { ODOO_ALL_COMPANY_IDS } = await import('../src/modules/odoo/odoo.service');
    await execute('stock.picking', 'button_validate', [[pickingId]], {
      context: {
        skip_backorder: true,
        skip_immediate: true,
        allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
        force_company: 2,
      },
    }, 2);
    console.log('validate OK');
  } catch (e: any) {
    console.log('validate ERROR:', (e?.faultString ?? e?.message ?? e).slice(0, 500));
  }
}

main().catch(console.error);
