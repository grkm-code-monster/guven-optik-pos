import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const pos = await execute(
    'purchase.order',
    'search_read',
    [[]],
    { fields: ['id', 'name', 'state', 'origin', 'partner_ref', 'create_date'], order: 'id desc', limit: 8 },
  );
  for (const po of pos) {
    const lines = await execute(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      { fields: ['product_qty', 'qty_received', 'qty_invoiced'] },
    );
    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['name', 'state'], limit: 3 },
    );
    const lineCount = lines.length;
    const recv = lines.reduce((s: number, l: any) => s + (l.qty_received || 0), 0);
    const pickState = pickings.map((p: any) => `${p.name}:${p.state}`).join(', ') || 'YOK';
    console.log(
      `${po.name} origin=${po.origin || po.partner_ref || '-'} lines=${lineCount} received=${recv} pickings=[${pickState}]`,
    );
  }
}

main().catch(console.error);
