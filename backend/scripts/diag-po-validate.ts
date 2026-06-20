import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  for (const poName of ['P00012', 'P00013', 'P00014']) {
    const pos = await execute('purchase.order', 'search_read', [[['name', '=', poName]]], {
      fields: ['id', 'name', 'state', 'origin'],
      limit: 1,
    });
    if (!pos[0]) continue;
    const po = pos[0];
    const lines = await execute(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      { fields: ['qty_received', 'qty_invoiced', 'product_id'], order: 'id asc' },
      2,
    );
    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['id', 'name', 'state'] },
      2,
    );
    console.log(`\n--- ${poName} state=${po.state} lines=${lines.length} ---`);
    for (const l of lines) {
      console.log(`  ${l.product_id[1]?.slice(0, 50)} recv=${l.qty_received} inv=${l.qty_invoiced}`);
    }
    for (const p of pickings) {
      const mls = await execute(
        'stock.move.line',
        'search_read',
        [[['picking_id', '=', p.id]]],
        { fields: ['id', 'lot_id', 'state', 'quantity'], order: 'id asc' },
        2,
      );
      console.log(`  picking ${p.name} state=${p.state}`);
      for (const ml of mls) {
        console.log(`    ml ${ml.id} lot=${ml.lot_id?.[1] ?? 'YOK'} state=${ml.state}`);
      }
      if (p.state !== 'done') {
        try {
          await execute(
            'stock.picking',
            'button_validate',
            [[p.id]],
            { context: { skip_backorder: true, skip_immediate: true, force_company: 2 } },
            2,
          );
          console.log('  → validate OK');
        } catch (e: any) {
          console.log('  → validate ERROR:', String(e?.faultString ?? e?.message ?? e).slice(0, 300));
        }
      }
    }
  }
}

main().catch(console.error);
