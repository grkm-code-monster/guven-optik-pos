/**
 * #5572 sahte UTS temizliği (test scriptlerinin bıraktığı değerler)
 * npx tsx backend/scripts/temizlik-ultra-5572-sahte-uts.ts [--dry-run]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const DRY_RUN = process.argv.includes('--dry-run');
const PRODUCT_ID = 5572;
const ctx = { context: { active_test: false } };

const FAKE_PREFIXES = ['0868LOTA', '0868LOTB', '0868TEST'];
const FAKE_EXACT = new Set(['08689999999999']);

export function isSahteTestUts(uts: unknown): boolean {
  if (uts === false || uts == null) return false;
  const s = String(uts).trim();
  if (!s) return false;
  if (FAKE_EXACT.has(s)) return true;
  return FAKE_PREFIXES.some((p) => s.startsWith(p));
}

function formatUts(uts: unknown): string {
  if (uts === false || uts == null || uts === '') return '(boş)';
  return String(uts);
}

async function main() {
  console.log(`=== #5572 sahte UTS temizliği ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`);

  const lots = (await execute('stock.lot', 'search_read', [[['product_id', '=', PRODUCT_ID]]], {
    fields: ['id', 'name', 'x_uts_kodu'],
    order: 'id asc',
    limit: 500,
    ...ctx,
  })) as Array<{ id: number; name: string; x_uts_kodu?: string | false }>;

  const sahte = lots.filter((l) => isSahteTestUts(l.x_uts_kodu));
  if (!sahte.length) {
    console.log('Sahte UTS bulunamadı — temizlik gerekmedi.');
  } else {
    console.log(`Sahte UTS tespit: ${sahte.length} lot\n`);
    for (const lot of sahte) {
      const eski = formatUts(lot.x_uts_kodu);
      console.log(`  lot #${lot.id} "${lot.name}": ${eski} → (boş)`);
      if (!DRY_RUN) {
        await execute('stock.lot', 'write', [[lot.id], { x_uts_kodu: false }], {}, undefined);
      }
    }
  }

  // Stoklu lotlar quant üzerinden
  const quants = (await execute('stock.quant', 'search_read', [[
    ['product_id', '=', PRODUCT_ID],
    ['lot_id', '!=', false],
    ['location_id.usage', '=', 'internal'],
    ['quantity', '>', 0],
  ]], {
    fields: ['lot_id'],
    limit: 500,
    ...ctx,
  })) as Array<{ lot_id: [number, string] }>;

  const stokluLotIds = [...new Set(quants.map((q) => q.lot_id[0]))].sort((a, b) => a - b);
  const stokluLots = (await execute('stock.lot', 'read', [stokluLotIds], {
    fields: ['id', 'name', 'x_uts_kodu'],
    ...ctx,
  })) as Array<{ id: number; name: string; x_uts_kodu?: string | false }>;

  console.log(`\nStoklu lot listesi (${stokluLots.length} adet):`);
  let kirlilik = 0;
  for (const lot of stokluLots.sort((a, b) => a.id - b.id)) {
    const uts = formatUts(lot.x_uts_kodu);
    const fake = isSahteTestUts(lot.x_uts_kodu);
    if (fake) kirlilik++;
    console.log(`  #${lot.id} | ${lot.name} | UTS=${uts}${fake ? ' ← SAHTE!' : ''}`);
  }

  const ok = kirlilik === 0;
  console.log(`\n${ok ? '✅ Test kaynaklı UTS kalmadı' : `❌ ${kirlilik} sahte UTS hâlâ var`}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
