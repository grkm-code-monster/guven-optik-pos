/**
 * ULTRA lens lot panel — utsKodu Odoo false → null normalizasyonu
 * npx tsx scripts/test-ultra-lens-lot-uts-fix.ts
 */
import 'dotenv/config';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';

const BARKOD_PRODUCTS = [
  { barkod: '785812139987', id: 5602 },
  { barkod: '785812139970', id: 5601 },
  { barkod: '785811314804', id: 5597 },
];

async function main() {
  console.log('=== ULTRA LENS LOT/UTS FIX TEST ===\n');
  let pass = true;

  for (const p of BARKOD_PRODUCTS) {
    const lots = await searchUrunLotsByProduct(p.id, 'ANADEPO');
    console.log(`${p.barkod} (#${p.id}): ${lots.length} lot`);
    if (!lots.length) {
      console.log('  HATA: lot satırı yok');
      pass = false;
      continue;
    }
    for (const lot of lots) {
      const utsType = lot.utsKodu === null ? 'null' : typeof lot.utsKodu;
      console.log(`  lotNo=${lot.lotNo} utsKodu=${utsType} stok=${lot.stok}`);
      if (lot.utsKodu === false || typeof lot.utsKodu === 'boolean') {
        console.log('  HATA: utsKodu boolean (React .trim() crash)');
        pass = false;
      }
      if (!lot.lotNo?.trim()) {
        console.log('  HATA: lotNo boş');
        pass = false;
      }
    }
  }

  console.log(`\nSonuç: ${pass ? 'OK' : 'HATA'}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
