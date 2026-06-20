/**
 * Yetim stock.lot kayıtları ve picking bağlantıları teşhis scripti
 */
import { execute } from '../src/modules/odoo/odoo.service';

const FATURA_NO = process.argv[2] || 'IZE2026000025572';

async function main() {
  console.log('=== STOCK.LOT TEŞHİS ===');
  console.log('Fatura/lot arama:', FATURA_NO);

  const lots = await execute(
    'stock.lot',
    'search_read',
    [[['name', 'ilike', FATURA_NO]]],
    { fields: ['id', 'name', 'product_id', 'company_id', 'create_date'], order: 'id asc' },
  );
  console.log(`\nBulunan lot sayısı: ${lots.length}`);
  for (const lot of lots) {
    console.log(`\n--- Lot ${lot.id}: ${lot.name} ---`);
    console.log(`  product: ${lot.product_id?.[1]}`);
    console.log(`  company: ${lot.company_id?.[1] ?? lot.company_id}`);
    console.log(`  create_date: ${lot.create_date}`);

    // Bu lot hangi move.line'larda kullanılıyor?
    const moveLines = await execute(
      'stock.move.line',
      'search_read',
      [[['lot_id', '=', lot.id]]],
      { fields: ['id', 'picking_id', 'move_id', 'quantity', 'state', 'location_dest_id'], order: 'id asc' },
    );
    console.log(`  move.line kullanımı: ${moveLines.length} kayıt`);
    for (const ml of moveLines) {
      let pickingName = '-';
      let pickingState = '-';
      if (ml.picking_id?.[0]) {
        const p = await execute('stock.picking', 'read', [[ml.picking_id[0]]], { fields: ['name', 'state', 'purchase_id'] });
        pickingName = p[0]?.name ?? '-';
        pickingState = p[0]?.state ?? '-';
        const poId = p[0]?.purchase_id?.[0];
        const poName = poId ? (await execute('purchase.order', 'read', [[poId]], { fields: ['name'] }))[0]?.name : '-';
        console.log(`    ml ${ml.id}: picking=${pickingName} (${pickingState}) PO=${poName} qty=${ml.quantity} ml_state=${ml.state}`);
      } else {
        console.log(`    ml ${ml.id}: picking=YOK qty=${ml.quantity} ml_state=${ml.state}`);
      }
    }

    // stock.quant — fiziksel stokta mı?
    const quants = await execute(
      'stock.quant',
      'search_read',
      [[['lot_id', '=', lot.id]]],
      { fields: ['id', 'quantity', 'location_id', 'reserved_quantity'], limit: 10 },
    );
    if (quants.length) {
      for (const q of quants) {
        console.log(`    quant: loc=${q.location_id?.[1]} qty=${q.quantity} reserved=${q.reserved_quantity}`);
      }
    } else {
      console.log('    quant: YOK (stokta değil)');
    }
  }

  // Bu faturaya ait PO'lar ve picking durumları
  console.log('\n=== İLGİLİ PO / PICKING ===');
  const posByOrigin = await execute(
    'purchase.order',
    'search_read',
    [[['origin', 'ilike', FATURA_NO]]],
    { fields: ['id', 'name', 'state', 'origin', 'create_date'], order: 'id asc' },
  );
  const posByRef = await execute(
    'purchase.order',
    'search_read',
    [[['partner_ref', 'ilike', FATURA_NO]]],
    { fields: ['id', 'name', 'state', 'origin', 'create_date'], order: 'id asc' },
  );
  const pos = [...posByOrigin, ...posByRef].filter(
    (p: any, i: number, arr: any[]) => arr.findIndex((x) => x.id === p.id) === i,
  );
  for (const po of pos) {
    const lines = await execute(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      { fields: ['product_qty', 'qty_received', 'qty_invoiced'], order: 'id asc' },
    );
    const recv = lines.reduce((s: number, l: any) => s + (l.qty_received || 0), 0);
    const inv = lines.reduce((s: number, l: any) => s + (l.qty_invoiced || 0), 0);
    console.log(`\nPO ${po.name} (id=${po.id}) state=${po.state} received=${recv} invoiced=${inv} created=${po.create_date}`);

    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['id', 'name', 'state'], order: 'id asc' },
    );
    for (const p of pickings) {
      const mls = await execute(
        'stock.move.line',
        'search_read',
        [[['picking_id', '=', p.id]]],
        { fields: ['id', 'lot_id', 'quantity', 'state'], order: 'id asc' },
      );
      const withLot = mls.filter((ml: any) => ml.lot_id).length;
      console.log(`  picking ${p.name} state=${p.state} move_lines=${mls.length} with_lot=${withLot}`);
      for (const ml of mls) {
        console.log(`    ml ${ml.id}: lot=${ml.lot_id?.[1] ?? 'YOK'} qty=${ml.quantity} state=${ml.state}`);
      }
    }
  }

  // Tüm Uyumsoft PO'larında picking validate başarı oranı
  console.log('\n=== TÜM PO PICKING DURUMU (son 15) ===');
  const allPos = await execute(
    'purchase.order',
    'search_read',
    [[]],
    { fields: ['id', 'name', 'origin', 'partner_ref', 'create_date'], order: 'id desc', limit: 15 },
  );
  for (const po of allPos) {
    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['name', 'state'], limit: 3 },
    );
    const lines = await execute(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      { fields: ['qty_received'], limit: 50 },
    );
    const recv = lines.reduce((s: number, l: any) => s + (l.qty_received || 0), 0);
    const pickStates = pickings.map((p: any) => `${p.name}:${p.state}`).join(', ') || 'YOK';
    const origin = po.origin || po.partner_ref || '-';
    console.log(`  ${po.name} origin=${origin} received=${recv} pickings=[${pickStates}]`);
  }
}

main().catch((e) => {
  console.error(e?.faultString ?? e?.message ?? e);
  process.exit(1);
});
