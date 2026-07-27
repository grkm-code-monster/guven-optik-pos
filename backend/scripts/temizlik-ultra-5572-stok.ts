/**
 * ACİL — #5572 (ULTRA KONTAKT LENS -0125) test bozulması stok düzeltmesi
 * npx tsx backend/scripts/temizlik-ultra-5572-stok.ts [--dry-run]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';

const DRY_RUN = process.argv.includes('--dry-run');
const PRODUCT_ID = 5572;
const ctx = { context: { active_test: false } };

const LOCATION_ID_TO_CODE = Object.fromEntries(
  Object.entries(LOKASYON_ID_MAP).map(([code, id]) => [id, code]),
);

/** Teşhis raporlarındaki bilinen doğru dağılım (13 birim) */
const HEDEF_LOT_LOKASYON: Record<number, Record<string, number>> = {
  // GRS lotları — lot id → lokasyon → qty (çoğu ANADEPO×1)
};

type QuantRow = {
  id: number;
  quantity: number;
  location_id: [number, string];
  lot_id: [number, string] | false;
  product_id: [number, string];
};

function locCode(loc: [number, string] | false): string {
  if (!loc) return '?';
  return LOCATION_ID_TO_CODE[loc[0]] ?? loc[1];
}

async function main() {
  console.log(`=== #5572 stok teşhis + düzeltme ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`);

  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', '=', PRODUCT_ID],
    ['location_id.usage', '=', 'internal'],
  ]], {
    fields: ['id', 'quantity', 'location_id', 'lot_id', 'product_id'],
    limit: 500,
    ...ctx,
  })) as QuantRow[];

  let toplam = 0;
  const byLot = new Map<number, { name: string; rows: Array<{ loc: string; qty: number; quantId: number }> }>();

  console.log('Mevcut quant kayıtları:');
  for (const q of quants) {
    const qty = Number(q.quantity) || 0;
    toplam += qty;
    const lotId = q.lot_id ? q.lot_id[0] : 0;
    const lotName = q.lot_id ? q.lot_id[1] : '(lotsuz)';
    const loc = locCode(q.location_id);
    console.log(`  quant#${q.id} lot#${lotId} "${lotName}" @ ${loc} qty=${qty}`);
    if (lotId) {
      const entry = byLot.get(lotId) ?? { name: lotName, rows: [] };
      entry.rows.push({ loc, qty, quantId: q.id });
      byLot.set(lotId, entry);
    }
  }
  console.log(`\nToplam stok: ${toplam}\n`);

  const anormal: Array<{ lotId: number; lotName: string; loc: string; qty: number }> = [];
  for (const [lotId, info] of byLot) {
    const lotTotal = info.rows.reduce((s, r) => s + r.qty, 0);
    if (lotTotal > 10 || info.name === '785811314552') {
      for (const r of info.rows) {
        if (r.qty > 1 || lotTotal > 10) {
          anormal.push({ lotId, lotName: info.name, loc: r.loc, qty: r.qty });
        }
      }
    }
  }

  // Test sırasında oluşturulan barkod-adlı lot veya 99999/1 anomalileri
  const lots = (await execute('stock.lot', 'search_read', [[['product_id', '=', PRODUCT_ID]]], {
    fields: ['id', 'name', 'x_uts_kodu', 'ref'],
    limit: 200,
    ...ctx,
  })) as Array<{ id: number; name: string; x_uts_kodu?: string | false; ref?: string | false }>;

  const testLotIds = new Set<number>();
  for (const lot of lots) {
    const uts = typeof lot.x_uts_kodu === 'string' ? lot.x_uts_kodu : '';
    if (lot.name === '785811314552' || uts.startsWith('0868TEST')) {
      testLotIds.add(lot.id);
      console.log(`Test lotu tespit: #${lot.id} name="${lot.name}" uts="${uts}"`);
    }
  }

  let duzeltme = 0;

  for (const q of quants) {
    const lotId = q.lot_id ? q.lot_id[0] : 0;
    const qty = Number(q.quantity) || 0;
    const loc = locCode(q.location_id);

    if (testLotIds.has(lotId) && qty !== 0) {
      console.log(`\n→ Test lot #${lotId} @ ${loc}: ${qty} → 0`);
      if (!DRY_RUN) {
        await applyStockAdjustmentForLot({
          productId: PRODUCT_ID,
          locationCode: loc,
          lotId,
          qty: 0,
        });
      }
      duzeltme++;
    } else if (lotId === 555 && qty > 1) {
      console.log(`\n→ Anormal lot #555 @ ${loc}: ${qty} → 1`);
      if (!DRY_RUN) {
        await applyStockAdjustmentForLot({
          productId: PRODUCT_ID,
          locationCode: loc,
          lotId: 555,
          qty: 1,
        });
      }
      duzeltme++;
    }
  }

  if (!duzeltme) {
    console.log('\nOtomatik düzeltme gerektiren anormal quant bulunamadı.');
  }

  const quantsAfter = (await execute('stock.quant', 'search_read', [[
    ['product_id', '=', PRODUCT_ID],
    ['location_id.usage', '=', 'internal'],
    ['quantity', '>', 0],
  ]], {
    fields: ['quantity', 'location_id', 'lot_id'],
    limit: 500,
    ...ctx,
  })) as QuantRow[];

  let toplamAfter = 0;
  const locTotals = new Map<string, number>();
  for (const q of quantsAfter) {
    const qty = Number(q.quantity) || 0;
    toplamAfter += qty;
    const loc = locCode(q.location_id);
    locTotals.set(loc, (locTotals.get(loc) ?? 0) + qty);
  }

  console.log('\nDüzeltme sonrası:');
  console.log(`  Toplam stok: ${toplamAfter}`);
  for (const [loc, qty] of [...locTotals.entries()].sort()) {
    console.log(`  ${loc}: ${qty}`);
  }
  console.log(`  Lot sayısı (qty>0): ${new Set(quantsAfter.map((q) => q.lot_id?.[0]).filter(Boolean)).size}`);

  const ok = toplamAfter === 13;
  console.log(`\n${ok ? '✅ Hedef 13 birime ulaşıldı' : `⚠️ Hedef 13 değil (${toplamAfter}) — manuel kontrol gerekebilir`}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
