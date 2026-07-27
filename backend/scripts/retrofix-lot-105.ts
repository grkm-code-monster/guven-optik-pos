/**
 * Lot #105 (GRS-2026-07-9291) — B PLANI
 * Odoo, lot #105'in company_id'sini (1 → NG/2) değiştirmeyi reddetti (çoklu şirket kuralı).
 * Bu yüzden: lot #105'e DOKUNMADAN, aynı seri no ile NG (company_id=2) altında YENİ bir lot
 * oluşturup stok girişini o yeni lotla tamamlıyoruz. Stok doğrulandıktan SONRA eski lot #105
 * silinmiyor; stock.lot.active yok → isim ARCHIVED- önekiyle arşivleniyor (audit izi kalsın, isim çakışmasın).
 *
 * İdempotent: zaten NG lotu + ANADEPO quant'ı varsa oluşturma adımlarını atlar.
 *
 * npx tsx backend/scripts/retrofix-lot-105.ts
 */
import 'dotenv/config';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { getAnaDepoLocationId } from '../src/modules/odoo/odooLocations';

const OLD_LOT_ID = 105;
const LOT_NAME = 'GRS-2026-07-9291-S01-001';
const PRODUCT_ID = 5565;
const NG_COMPANY = 2;
const ANADEPO = getAnaDepoLocationId(NG_COMPANY);
const ORIGIN = 'GRS-2026-07-9291|retrofix-v2';

const ALL_COMPANIES_CTX = { context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] } };

async function resolveSupplierLocationId(companyId: number): Promise<number> {
  let rows = await execute(
    'stock.location',
    'search_read',
    [[['usage', '=', 'supplier'], ['company_id', '=', companyId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  if (!rows.length) {
    rows = await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'supplier']]],
      { fields: ['id'], limit: 1 },
    );
  }
  const locId = rows[0]?.id;
  if (!locId) throw new Error('Tedarikçi lokasyonu bulunamadı');
  return locId;
}

async function main() {
  console.log('=== Lot #105 retrofix — B PLANI (yeni NG lotu) ===\n');

  // 0) Eski lot #105 hâlâ beklenen kayıt mı — güvenlik kontrolü (tüm şirketler bağlamında oku)
  const oldLotRows = await execute(
    'stock.lot',
    'read',
    [[OLD_LOT_ID]],
    { fields: ['id', 'name', 'product_id', 'company_id', 'ref', 'note'], ...ALL_COMPANIES_CTX },
  );
  const oldLot = oldLotRows[0];
  if (!oldLot || oldLot.name !== LOT_NAME) {
    throw new Error(`Lot #${OLD_LOT_ID} beklenen kayıt değil, işlem durduruldu.`);
  }
  console.log(`Eski lot #${OLD_LOT_ID} doğrulandı — company_id=${oldLot.company_id?.[0]} (${oldLot.company_id?.[1]})`);

  // 1) Zaten NG altında aynı isimde bir lot var mı (idempotency)
  const ngLotRows = await execute(
    'stock.lot',
    'search_read',
    [[['name', '=', LOT_NAME], ['product_id', '=', PRODUCT_ID], ['company_id', '=', NG_COMPANY]]],
    { fields: ['id', 'name', 'company_id'] },
    NG_COMPANY,
  );
  let newLotId: number;
  if (ngLotRows.length) {
    newLotId = ngLotRows[0].id;
    console.log(`NG lotu zaten var: #${newLotId} — oluşturma adımı atlandı`);
  } else {
    newLotId = await execute(
      'stock.lot',
      'create',
      [{
        name: LOT_NAME,
        product_id: PRODUCT_ID,
        company_id: NG_COMPANY,
      }],
      {},
      NG_COMPANY,
    );
    console.log(`NG lotu oluşturuldu: #${newLotId}`);
  }

  // 2) Bu yeni lot için ANADEPO'da zaten pozitif quant var mı (idempotency)
  const existingQuants = await execute(
    'stock.quant',
    'search_read',
    [[['lot_id', '=', newLotId], ['location_id', '=', ANADEPO], ['quantity', '>', 0]]],
    { fields: ['id', 'quantity', 'location_id'] },
    NG_COMPANY,
  );
  if (existingQuants.length) {
    console.log('Zaten ANADEPO stoğu var — picking adımları atlandı:', existingQuants[0]);
  } else {
    // 3) Var olan (yarım kalmış) retrofix picking'i var mı
    const existingPickings = await execute(
      'stock.picking',
      'search_read',
      [[['origin', '=', ORIGIN], ['state', '!=', 'cancel']]],
      { fields: ['id', 'name', 'state'], limit: 1 },
      NG_COMPANY,
    );

    let pickingId = existingPickings[0]?.id as number | undefined;
    if (pickingId && existingPickings[0].state === 'done') {
      console.log(`Retrofix picking zaten done: ${existingPickings[0].name} — quant kontrolüne geçiliyor`);
    } else {
      const supplierLoc = await resolveSupplierLocationId(NG_COMPANY);
      const ptRows = await execute(
        'stock.picking.type',
        'search_read',
        [[['code', '=', 'incoming'], ['active', '=', true], ['company_id', '=', NG_COMPANY]]],
        { fields: ['id'], limit: 1 },
        NG_COMPANY,
      );
      if (!ptRows.length) throw new Error('NG incoming picking type bulunamadı');

      if (!pickingId) {
        pickingId = await execute(
          'stock.picking',
          'create',
          [{
            picking_type_id: ptRows[0].id,
            location_id: supplierLoc,
            location_dest_id: ANADEPO,
            company_id: NG_COMPANY,
            origin: ORIGIN,
            scheduled_date: new Date().toISOString().slice(0, 10),
            note: `Retrofix — ${LOT_NAME} faturasız giriş tamamlama (B planı, yeni NG lotu #${newLotId})`,
          }],
          {},
          NG_COMPANY,
        );
        await execute(
          'stock.move',
          'create',
          [{
            picking_id: pickingId,
            product_id: PRODUCT_ID,
            product_uom_qty: 1,
            product_uom: 1,
            location_id: supplierLoc,
            location_dest_id: ANADEPO,
            name: LOT_NAME,
          }],
          {},
          NG_COMPANY,
        );
        console.log(`Picking oluşturuldu: #${pickingId}`);
      } else {
        console.log(`Mevcut yarım kalmış picking kullanılıyor: #${pickingId} (${existingPickings[0].name})`);
      }

      await execute('stock.picking', 'action_confirm', [[pickingId]], {}, NG_COMPANY);
      try {
        await execute('stock.picking', 'action_assign', [[pickingId]], {}, NG_COMPANY);
      } catch {
        /* incoming için assign opsiyonel */
      }

      const moves = await execute(
        'stock.move',
        'search_read',
        [[['picking_id', '=', pickingId]]],
        { fields: ['id'], limit: 5 },
        NG_COMPANY,
      );
      const moveId = moves[0]?.id;
      if (!moveId) throw new Error('Move bulunamadı');

      const existingMl = await execute(
        'stock.move.line',
        'search_read',
        [[['move_id', '=', moveId]]],
        { fields: ['id'], limit: 1 },
        NG_COMPANY,
      );
      // ÖNEMLİ: lot_id artık YENİ (NG şirketli) lot — eski #105 DEĞİL
      const mlVals = {
        quantity: 1,
        lot_id: newLotId,
        location_id: supplierLoc,
        location_dest_id: ANADEPO,
        product_id: PRODUCT_ID,
        product_uom_id: 1,
      };
      if (existingMl[0]?.id) {
        await execute('stock.move.line', 'write', [[existingMl[0].id], mlVals], {}, NG_COMPANY);
      } else {
        await execute(
          'stock.move.line',
          'create',
          [{ picking_id: pickingId, move_id: moveId, ...mlVals }],
          {},
          NG_COMPANY,
        );
      }

      try {
        await execute(
          'stock.picking',
          'button_validate',
          [[pickingId]],
          {
            context: {
              skip_backorder: true,
              skip_immediate: true,
            },
          },
          NG_COMPANY,
        );
      } catch (err: unknown) {
        const msg = String((err as Error)?.message ?? err).toLowerCase();
        if (msg.includes('immediate') || msg.includes('wizard')) {
          const wizId = await execute(
            'stock.immediate.transfer',
            'create',
            [{ pick_ids: [[6, 0, [pickingId]]] }],
            {},
            NG_COMPANY,
          );
          await execute('stock.immediate.transfer', 'process', [[wizId]], {}, NG_COMPANY);
        } else {
          throw err;
        }
      }

      const afterPicking = await execute(
        'stock.picking',
        'read',
        [[pickingId]],
        { fields: ['name', 'state'] },
        NG_COMPANY,
      );
      console.log(`Picking sonucu: ${afterPicking[0]?.name} state=${afterPicking[0]?.state}`);
    }
  }

  // 4) Son doğrulama — yeni lot için ANADEPO quant'ı
  const afterQuant = await execute(
    'stock.quant',
    'search_read',
    [[['lot_id', '=', newLotId], ['location_id', '=', ANADEPO], ['quantity', '>', 0]]],
    { fields: ['id', 'quantity', 'lot_id', 'location_id'] },
    NG_COMPANY,
  );
  console.log(`\nYeni lot #${newLotId} quant @ ANADEPO: ${JSON.stringify(afterQuant[0] ?? null)}`);

  if (!afterQuant.length) {
    console.error('\nStok doğrulanamadı — eski lot #105 ARŞİVLENMEYECEK, işlem durduruldu.');
    process.exitCode = 1;
    return;
  }

  // 5) Stok doğrulandı — eski lot #105'i SİLMEDEN arşivle.
  // stock.lot.active bu kurulumda yok; isim çakışmasını önlemek için ARCHIVED- öneki kullanıyoruz.
  const archivedName = `ARCHIVED-${LOT_NAME}`;
  if (oldLot.name === LOT_NAME) {
    const noteLine = `[ARCHIVED ${new Date().toISOString().slice(0, 10)}] Yanlış company_id ile oluşturulmuş; yerine NG lot #${newLotId} kullanılıyor.`;
    const prevNote = oldLot.note ? String(oldLot.note) + '\n' : '';
    await execute(
      'stock.lot',
      'write',
      [[OLD_LOT_ID], { name: archivedName, note: prevNote + noteLine }],
      { context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] } },
      oldLot.company_id?.[0] ?? undefined,
    );
    console.log(`Eski lot #${OLD_LOT_ID} arşivlendi (isim → ${archivedName}) — silinmedi, audit izi korunuyor.`);
  } else if (String(oldLot.name).startsWith('ARCHIVED-')) {
    console.log(`Eski lot #${OLD_LOT_ID} zaten arşivlenmiş: ${oldLot.name}`);
  } else {
    console.warn(`Eski lot #${OLD_LOT_ID} beklenmeyen isimde: ${oldLot.name} — dokunulmadı`);
  }

  console.log('\n✅ Retrofit tamamlandı.');
  console.log(`   Yeni aktif lot: #${newLotId} (${LOT_NAME}), company=NG, ANADEPO stoğu: ${afterQuant[0].quantity}`);
  console.log(`   Eski lot: #${OLD_LOT_ID}, arşivlendi (isim değiştirildi, silinmedi).`);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
