/**
 * Transfer urun-ara — GS1 ham string süre ölçümü
 * npx ts-node scripts/bench-transfer-urun-ara.ts
 */
import 'dotenv/config';
import { searchUrun } from '../src/modules/transfer/transfer.service';

const GS1 = '01007858113145901730010210R42015835';
const LOKASYON = 'ANADEPO';
const YONTEMLER = ['ad', 'lot', 'ref', 'uts', 'barkod'] as const;

async function main() {
  console.log(`GS1 test string (${GS1.length} char), lokasyon=${LOKASYON}\n`);
  for (const yontem of YONTEMLER) {
    const t0 = Date.now();
    try {
      const rows = await searchUrun(GS1, yontem, LOKASYON, { katalog: false });
      console.log(`  ✓ yontem=${yontem.padEnd(6)} ${Date.now() - t0}ms  results=${rows.length}`);
    } catch (e) {
      console.log(`  ✗ yontem=${yontem.padEnd(6)} ${Date.now() - t0}ms  ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
