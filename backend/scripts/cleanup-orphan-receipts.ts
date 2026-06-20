/**
 * Yarım kalan ürün kabul kayıtlarını temizler.
 *
 * Kullanım:
 *   npx ts-node scripts/cleanup-orphan-receipts.ts              # dry-run (varsayılan)
 *   npx ts-node scripts/cleanup-orphan-receipts.ts --execute     # gerçek temizlik
 *   npx ts-node scripts/cleanup-orphan-receipts.ts P00012 P00014 --execute
 */
import { execute } from '../src/modules/odoo/odoo.service';

const DEFAULT_POS = ['P00012', 'P00014'];
const COMPANY_ID = 2;

const args = process.argv.slice(2);
const executeMode = args.includes('--execute');
const poNames = args.filter((a) => !a.startsWith('--'));

const targets = poNames.length ? poNames : DEFAULT_POS;

function odooErr(e: unknown): string {
  const err = e as { faultString?: string; message?: string };
  return String(err?.faultString ?? err?.message ?? e);
}

async function isLotSafeToDelete(lotId: number, companyId: number): Promise<{ safe: boolean; reason: string }> {
  const doneMls = await execute(
    'stock.move.line',
    'search_read',
    [[['lot_id', '=', lotId], ['state', '=', 'done']]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  if (doneMls?.length) return { safe: false, reason: 'done move.line var' };

  const openMls = await execute(
    'stock.move.line',
    'search_read',
    [[['lot_id', '=', lotId], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'picking_id'], limit: 3 },
    companyId,
  );
  if (openMls?.length) {
    return { safe: false, reason: `aktif move.line: ${openMls.map((m: any) => m.id).join(',')}` };
  }

  const quants = await execute(
    'stock.quant',
    'search_read',
    [[['lot_id', '=', lotId], ['quantity', '!=', 0]]],
    { fields: ['quantity', 'location_id'], limit: 5 },
    companyId,
  );
  for (const q of quants ?? []) {
    const loc = String(q.location_id?.[1] ?? '').toLowerCase();
    if (!loc.includes('vendor') && Math.abs(Number(q.quantity)) > 0.0001) {
      return { safe: false, reason: `stok quant: ${q.location_id?.[1]} qty=${q.quantity}` };
    }
  }

  return { safe: true, reason: 'yetim — silinebilir' };
}

async function main() {
  console.log(`Mod: ${executeMode ? 'EXECUTE (gerçek silme/iptal)' : 'DRY-RUN (sadece rapor)'}`);
  console.log(`Hedef PO'lar: ${targets.join(', ')}\n`);

  const lotsToDelete = new Set<number>();

  for (const poName of targets) {
    const pos = await execute(
      'purchase.order',
      'search_read',
      [[['name', '=', poName]]],
      { fields: ['id', 'name', 'state', 'origin', 'company_id'], limit: 1 },
      COMPANY_ID,
    );
    if (!pos?.[0]) {
      console.log(`[${poName}] PO bulunamadı — atlanıyor`);
      continue;
    }
    const po = pos[0];
    const companyId = Array.isArray(po.company_id) ? po.company_id[0] : po.company_id ?? COMPANY_ID;
    console.log(`\n=== ${poName} (id=${po.id}, state=${po.state}) ===`);

    // Taslak faturaları temizle (PO cancel olsa bile)
    const poInv = await execute('purchase.order', 'read', [[po.id]], { fields: ['invoice_ids'] }, companyId);
    for (const invId of poInv?.[0]?.invoice_ids ?? []) {
      const invRows = await execute('account.move', 'read', [[invId]], { fields: ['name', 'state'] }, companyId);
      const inv = invRows?.[0];
      if (!inv || inv.state !== 'draft') continue;
      if (executeMode) {
        try {
          await execute('account.move', 'button_cancel', [[invId]], {}, companyId);
          console.log(`  ✓ taslak fatura iptal: ${inv.name || invId}`);
        } catch (e) {
          const after = await execute('account.move', 'read', [[invId]], { fields: ['state'] }, companyId);
          if (after?.[0]?.state === 'cancel') {
            console.log(`  ✓ taslak fatura iptal (state=cancel): ${inv.name || invId}`);
          } else {
            console.log(`  ✗ fatura iptal: ${odooErr(e).slice(0, 120)}`);
          }
        }
      } else {
        console.log(`  [dry-run] taslak fatura iptal: ${inv.name || invId}`);
      }
    }

    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['id', 'name', 'state'], order: 'id asc' },
      companyId,
    );

    for (const picking of pickings) {
      console.log(`  picking ${picking.name} id=${picking.id} state=${picking.state}`);
      if (picking.state === 'done') {
        console.log('    → ATLA (done — iptal edilemez)');
        continue;
      }
      if (picking.state === 'cancel') {
        console.log('    → zaten cancel');
        continue;
      }

      const mls = await execute(
        'stock.move.line',
        'search_read',
        [[['picking_id', '=', picking.id]]],
        { fields: ['id', 'lot_id', 'state'], limit: 50 },
        companyId,
      );
      for (const ml of mls) {
        const lotId = ml.lot_id?.[0];
        if (lotId) lotsToDelete.add(lotId);
        console.log(`    ml ${ml.id} lot=${ml.lot_id?.[1] ?? 'YOK'} state=${ml.state}`);
      }

      if (executeMode) {
        try {
          await execute('stock.picking', 'action_cancel', [[picking.id]], {}, companyId);
          console.log(`    ✓ picking iptal edildi`);
        } catch (e) {
          console.log(`    ✗ picking iptal HATA: ${odooErr(e).slice(0, 200)}`);
        }
      } else {
        console.log(`    [dry-run] action_cancel çağrılacak`);
      }
    }

    if (po.state !== 'cancel') {
      if (executeMode) {
        try {
          await execute('purchase.order', 'button_cancel', [[po.id]], {}, companyId);
          const after = await execute('purchase.order', 'read', [[po.id]], { fields: ['state'] }, companyId);
          console.log(`  ✓ PO iptal edildi (state=${after?.[0]?.state})`);
        } catch (e) {
          const after = await execute('purchase.order', 'read', [[po.id]], { fields: ['state'] }, companyId);
          if (after?.[0]?.state === 'cancel') {
            console.log(`  ✓ PO zaten cancel durumda`);
          } else {
            console.log(`  ✗ PO iptal HATA: ${odooErr(e).slice(0, 200)}`);
          }
        }
      } else {
        console.log(`  [dry-run] button_cancel çağrılacak`);
      }
    } else {
      console.log(`  PO zaten cancel`);
    }
  }

  console.log(`\n=== YETİM LOT TARAMASI (${lotsToDelete.size} aday) ===`);
  for (const lotId of lotsToDelete) {
    const lots = await execute('stock.lot', 'read', [[lotId]], { fields: ['name', 'product_id'] }, COMPANY_ID);
    const lot = lots?.[0];
    if (!lot) continue;
    const check = await isLotSafeToDelete(lotId, COMPANY_ID);
    console.log(`  lot ${lotId} ${lot.name}: ${check.reason}`);
    if (check.safe) {
      if (executeMode) {
        try {
          await execute('stock.lot', 'unlink', [[lotId]], {}, COMPANY_ID);
          console.log(`    ✓ silindi`);
        } catch (e) {
          console.log(`    ✗ silme HATA: ${odooErr(e).slice(0, 200)}`);
        }
      } else {
        console.log(`    [dry-run] unlink çağrılacak`);
      }
    }
  }

  console.log('\nBitti.');
}

main().catch((e) => {
  console.error(odooErr(e));
  process.exit(1);
});
