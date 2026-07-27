/**
 * OSSE ürün girişi stok teşhisi (salt okunur)
 * npx tsx backend/scripts/teşhis-osse-stok-giris.ts
 */
import { execute } from '../src/modules/odoo/odoo.service';
import { getAnaDepoLocationId, LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';

const TEMPLATE_ID = 1907;
const PRODUCT_ID = 5565;
const NG_COMPANY = 2;
const ANADEPO_LOC = getAnaDepoLocationId(NG_COMPANY); // 61

async function main() {
  console.log('=== OSSE stok girişi teşhisi ===\n');
  console.log(`NG ana depo location id (SIRKET_ANADEPO_MAP[2]): ${ANADEPO_LOC}`);
  console.log(`LOKASYON_ID_MAP ANADEPO: ${LOKASYON_ID_MAP.ANADEPO}\n`);

  // Son stock.lot kayıtları (OSSE ürünü)
  const lots = await execute(
    'stock.lot',
    'search_read',
    [[['product_id', '=', PRODUCT_ID]]],
    {
      fields: ['id', 'name', 'product_id', 'company_id', 'create_date'],
      order: 'create_date desc',
      limit: 10,
    },
    NG_COMPANY,
  );
  console.log(`stock.lot (product ${PRODUCT_ID}): ${lots.length} kayıt (son 10)`);
  for (const l of lots) {
    console.log(`  lot #${l.id} "${l.name}" company=${l.company_id?.[1]} created=${l.create_date}`);
  }

  // stock.quant ANADEPO
  const quantsAnadepo = await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', PRODUCT_ID], ['location_id', '=', ANADEPO_LOC], ['quantity', '>', 0]]],
    { fields: ['id', 'location_id', 'quantity', 'lot_id', 'company_id'], limit: 20 },
    NG_COMPANY,
  );
  console.log(`\nstock.quant @ loc ${ANADEPO_LOC} (qty>0): ${quantsAnadepo.length}`);
  for (const q of quantsAnadepo) {
    console.log(
      `  quant #${q.id} qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'} loc=${q.location_id?.[1]}`,
    );
  }

  // Tüm internal lokasyonlarda quant
  const quantsAll = await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', PRODUCT_ID], ['location_id.usage', '=', 'internal'], ['quantity', '>', 0]]],
    { fields: ['id', 'location_id', 'quantity', 'lot_id'], limit: 20 },
    NG_COMPANY,
  );
  console.log(`\nstock.quant tüm internal (qty>0): ${quantsAll.length}`);
  for (const q of quantsAll) {
    console.log(`  loc ${q.location_id?.[0]} (${q.location_id?.[1]}) qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'}`);
  }

  // Son incoming pickings (NG) — origin veya product içeren
  const pickings = await execute(
    'stock.picking',
    'search_read',
    [[['picking_type_code', '=', 'incoming'], ['company_id', '=', NG_COMPANY]]],
    {
      fields: ['id', 'name', 'state', 'origin', 'location_dest_id', 'create_date', 'purchase_id'],
      order: 'create_date desc',
      limit: 15,
    },
    NG_COMPANY,
  );
  console.log(`\nSon incoming pickings (NG): ${pickings.length}`);
  for (const p of pickings) {
    const moves = await execute(
      'stock.move',
      'search_read',
      [[['picking_id', '=', p.id], ['product_id', '=', PRODUCT_ID]]],
      { fields: ['id'], limit: 1 },
      NG_COMPANY,
    );
    if (!moves.length && !String(p.origin ?? '').includes('GRS-2026-07')) continue;
    console.log(
      `  ${p.name} state=${p.state} origin=${p.origin ?? '—'} dest=${p.location_dest_id?.[1]} created=${p.create_date}`,
    );
  }

  // GRS-2026-07-9291 ile ilgili PO
  const pos = await execute(
    'purchase.order',
    'search_read',
    [[['company_id', '=', NG_COMPANY]]],
    { fields: ['id', 'name', 'state', 'origin', 'partner_ref', 'create_date'], order: 'create_date desc', limit: 10 },
    NG_COMPANY,
  );
  console.log('\nSon PO (NG):');
  for (const po of pos) {
    console.log(`  ${po.name} state=${po.state} origin=${po.origin ?? '—'} ref=${po.partner_ref ?? '—'} ${po.create_date}`);
  }

  // Location 61 detay
  const loc = await execute('stock.location', 'read', [[ANADEPO_LOC]], {
    fields: ['id', 'name', 'complete_name', 'usage', 'company_id'],
  });
  console.log('\nANADEPO lokasyon detayı:', JSON.stringify(loc[0], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
