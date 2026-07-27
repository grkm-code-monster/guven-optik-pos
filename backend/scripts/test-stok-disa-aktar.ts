/**
 * Stok dışa aktarma testleri
 * npx ts-node --transpile-only backend/scripts/test-stok-disa-aktar.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  exportStokUrunleri,
  exportStokVaryantlari,
  stokExportExtension,
} from '../src/modules/admin/stok-export.service';

const OUT = path.join(__dirname, '.tmp-stok-export');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const urunIds = [1950]; // OPTELLİ
  const variantIds = [5621, 5623, 5626];

  console.log('=== TEST 1: Tek ürün — PDF/Excel/CSV ===');
  for (const format of ['pdf', 'xlsx', 'csv'] as const) {
    const buf = await exportStokUrunleri(urunIds, format);
    const file = path.join(OUT, `stok-urunleri-test.${stokExportExtension(format)}`);
    fs.writeFileSync(file, buf);
    console.log(`  ${format}: ${buf.length} bytes → ${file}`);
    if (format === 'csv') {
      const text = buf.toString('utf-8');
      console.log('  CSV BOM:', text.charCodeAt(0) === 0xFEFF ? 'OK' : 'HATA');
      console.log('  CSV Türkçe (OPTELLİ):', text.includes('OPTELL') ? 'OK' : 'HATA');
    }
  }

  console.log('\n=== TEST 2: 3 varyant — PDF/Excel/CSV ===');
  for (const format of ['pdf', 'xlsx', 'csv'] as const) {
    const buf = await exportStokVaryantlari(variantIds, format);
    const file = path.join(OUT, `stok-varyantlari-test.${stokExportExtension(format)}`);
    fs.writeFileSync(file, buf);
    console.log(`  ${format}: ${buf.length} bytes, satır sayısı ~${variantIds.length + 1}`);
    if (format === 'csv') {
      const text = buf.toString('utf-8');
      const hasBarcode = ['8682037201630', '8682037200190', '8682037201319']
        .some((b) => text.includes(b));
      console.log('  Barkodlar CSV içinde:', hasBarcode ? 'OK' : 'KONTROL');
    }
  }

  console.log('\n=== TEST 3: CSV UTF-8 BOM + Türkçe ===');
  const csv = await exportStokVaryantlari([5623], 'csv');
  const csvText = csv.toString('utf-8');
  console.log('  BOM:', csvText.charCodeAt(0) === 0xFEFF ? 'OK' : 'HATA');
  console.log('  İçerik önizleme:', csvText.slice(0, 120).replace(/\n/g, ' | '));

  console.log('\n=== TEST 4: Boş id listesi ===');
  const empty = await exportStokUrunleri([], 'csv');
  console.log('  Boş export (sadece header):', empty.length > 10 ? 'OK' : 'HATA');

  console.log(`\nÖrnek dosyalar: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
