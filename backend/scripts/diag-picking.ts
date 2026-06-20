/**
 * PO picking durumu teşhis scripti
 * Kullanım: npx ts-node scripts/diag-picking.ts P00012
 */
import { execute } from '../src/modules/odoo/odoo.service';

const poName = process.argv[2] || 'P00012';

async function main() {
  const pos = await execute(
    'purchase.order',
    'search_read',
    [[['name', '=', poName]]],
    { fields: ['id', 'name', 'state', 'company_id'], limit: 1 },
  );
  if (!pos?.length) {
    console.log('PO bulunamadı:', poName);
    return;
  }
  const po = pos[0];
  const companyId = Array.isArray(po.company_id) ? po.company_id[0] : po.company_id;
  console.log('PO:', po.name, 'id:', po.id, 'state:', po.state, 'company:', companyId);

  const lines = await execute(
    'purchase.order.line',
    'search_read',
    [[['order_id', '=', po.id]]],
    { fields: ['id', 'product_id', 'product_qty', 'qty_received', 'qty_invoiced'], order: 'id asc' },
    companyId,
  );
  console.log('\nPO satırları:');
  for (const l of lines) {
    console.log(
      `  line ${l.id}: product=${l.product_id?.[1]} qty=${l.product_qty} received=${l.qty_received} invoiced=${l.qty_invoiced}`,
    );
  }

  const pickings = await execute(
    'stock.picking',
    'search_read',
    [[['purchase_id', '=', po.id]]],
    { fields: ['id', 'name', 'state', 'location_id', 'location_dest_id', 'picking_type_id'], limit: 10 },
    companyId,
  );
  console.log('\nPickings:', pickings.length);
  for (const p of pickings) {
    console.log(`  ${p.name} id=${p.id} state=${p.state} loc=${p.location_id?.[1]} → ${p.location_dest_id?.[1]}`);

    const moves = await execute(
      'stock.move',
      'search_read',
      [[['picking_id', '=', p.id]]],
      { fields: ['id', 'product_id', 'product_uom_qty', 'quantity', 'state'], order: 'id asc' },
      companyId,
    );
    for (const m of moves) {
      const prod = await execute(
        'product.product',
        'read',
        [[m.product_id[0]]],
        { fields: ['tracking', 'default_code'] },
        companyId,
      );
      console.log(
        `    move ${m.id}: ${prod[0]?.default_code} tracking=${prod[0]?.tracking} qty=${m.product_uom_qty} state=${m.state}`,
      );

      const mls = await execute(
        'stock.move.line',
        'search_read',
        [[['move_id', '=', m.id]]],
        { fields: ['id', 'quantity', 'lot_id', 'lot_name', 'state'], order: 'id asc' },
        companyId,
      );
      for (const ml of mls) {
        console.log(
          `      ml ${ml.id}: qty=${ml.quantity} lot=${ml.lot_id?.[1] ?? ml.lot_name ?? '-'} state=${ml.state}`,
        );
      }
      if (!mls.length) console.log('      (move line yok)');
    }
  }
}

main().catch((e) => {
  console.error(e?.faultString ?? e?.message ?? e);
  process.exit(1);
});
