/**
 * P00013 picking'i düzelt — mevcut lotları sırayla ata ve validate et
 */
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';

const PICKING_ID = 115;
const COMPANY_ID = 2;
const LOT_NAMES = [
  'IZE2026000025572-7n-0-001',
  'IZE2026000025572-7n-1-001',
  'IZE2026000025572-7n-2-001',
  'IZE2026000025572-7n-3-001',
];

async function main() {
  const picking = (await execute('stock.picking', 'read', [[PICKING_ID]], {
    fields: ['name', 'state', 'location_id', 'location_dest_id'],
  }, COMPANY_ID))[0];
  console.log('Picking:', picking.name, picking.state);

  const locationId = picking.location_id[0];
  const locationDestId = LOKASYON_ID_MAP.ANADEPO;

  const lotIds: number[] = [];
  for (const name of LOT_NAMES) {
    const rows = await execute('stock.lot', 'search_read', [[['name', '=', name]]], { fields: ['id'] }, COMPANY_ID);
    if (!rows[0]) throw new Error(`Lot bulunamadı: ${name}`);
    lotIds.push(rows[0].id);
  }

  const moves = await execute('stock.move', 'search_read', [[['picking_id', '=', PICKING_ID]]], {
    fields: ['id', 'product_id', 'product_uom_qty'],
    order: 'id asc',
  }, COMPANY_ID);

  const mls = await execute('stock.move.line', 'search_read', [[['picking_id', '=', PICKING_ID]]], {
    fields: ['id', 'move_id'],
    order: 'id asc',
  }, COMPANY_ID);

  console.log('Move lines:', mls.length, 'Lots:', lotIds.length);
  for (let i = 0; i < mls.length; i++) {
    await execute('stock.move.line', 'write', [[mls[i].id], {
      quantity: 1,
      lot_id: lotIds[i],
      location_id: locationId,
      location_dest_id: locationDestId,
    }], {}, COMPANY_ID);
    console.log(`  ml ${mls[i].id} ← lot ${lotIds[i]}`);
  }

  try {
    await execute('stock.picking', 'button_validate', [[PICKING_ID]], {
      context: {
        skip_backorder: true,
        skip_immediate: true,
        allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
        force_company: COMPANY_ID,
      },
    }, COMPANY_ID);
  } catch (e: any) {
    const msg = String(e?.faultString ?? e?.message ?? '').toLowerCase();
    if (msg.includes('immediate') || msg.includes('wizard')) {
      const wizId = await execute('stock.immediate.transfer', 'create', [{ pick_ids: [[6, 0, [PICKING_ID]]] }], {}, COMPANY_ID);
      await execute('stock.immediate.transfer', 'process', [[wizId]], {}, COMPANY_ID);
    } else throw e;
  }

  const after = await execute('stock.picking', 'read', [[PICKING_ID]], { fields: ['state'] }, COMPANY_ID);
  console.log('Picking state:', after[0].state);

  const poLines = await execute('purchase.order.line', 'search_read', [[['order_id', '=', 13]]], {
    fields: ['product_id', 'product_qty', 'qty_received', 'qty_invoiced'],
    order: 'id asc',
  }, COMPANY_ID);
  for (const l of poLines) {
    console.log(`  ${l.product_id[1]}: qty=${l.product_qty} received=${l.qty_received} invoiced=${l.qty_invoiced}`);
  }
}

main().catch((e) => {
  console.error(e?.faultString ?? e?.message ?? e);
  process.exit(1);
});
