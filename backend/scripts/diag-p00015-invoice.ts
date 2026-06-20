import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  for (const poName of ['P00015']) {
    const pos = await execute('purchase.order', 'search_read', [[['name', '=', poName]]], {
      fields: ['id', 'name', 'state', 'origin', 'invoice_ids'],
      limit: 1,
    }, 2);
    if (!pos[0]) { console.log('PO yok:', poName); continue; }
    const po = pos[0];
    console.log('PO', po.name, 'state=', po.state, 'invoice_ids=', po.invoice_ids);

    const pickings = await execute('stock.picking', 'search_read', [[['purchase_id', '=', po.id]]], {
      fields: ['id', 'name', 'state'],
    }, 2);
    for (const p of pickings) console.log('  picking', p.name, p.state);

    if (po.invoice_ids?.length) {
      const invs = await execute('account.move', 'read', [po.invoice_ids], {
        fields: ['id', 'name', 'state', 'move_type', 'ref', 'payment_state'],
      }, 2);
      for (const inv of invs) console.log('  invoice', inv.name, 'state=', inv.state, 'type=', inv.move_type, 'ref=', inv.ref);
    }

    // Search vendor bills by origin/ref
    const byOrigin = await execute('account.move', 'search_read', [[['invoice_origin', 'ilike', po.name]]], {
      fields: ['id', 'name', 'state', 'move_type', 'ref'],
      limit: 5,
    }, 2);
    console.log('  by origin:', byOrigin.map((i: any) => `${i.name}:${i.state}`));

    const byRef = await execute('account.move', 'search_read', [[['ref', 'ilike', po.origin || 'NONE']]], {
      fields: ['id', 'name', 'state', 'ref'],
      limit: 5,
    }, 2);
    console.log('  by ref:', byRef.map((i: any) => `${i.name}:${i.state}`));
  }
}

main().catch(console.error);
