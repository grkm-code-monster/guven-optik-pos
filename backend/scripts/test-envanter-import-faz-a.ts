/**
 * FAZ A test: envanter import şablon + önizleme (yazma yok)
 * Çalıştır: npx tsx scripts/test-envanter-import-faz-a.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute } from '../src/modules/odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  buildEnvanterSablonBuffer,
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';

const TS = Date.now();

async function countOdooRecords(): Promise<{ templates: number; products: number }> {
  const templates = Number(await execute('product.template', 'search_count', [[]]));
  const products = Number(await execute('product.product', 'search_count', [[]]));
  return { templates, products };
}

async function buildOrnekExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);

  const prefix = `FAZ_A_${TS}`;
  const rows = [
    // 2 yeni şablon
    [prefix, 'MarkaA', `${prefix} ÜRÜN ALPHA`, 'M1', 'R1', '54', `BC-${TS}-001`, '', 1, 100, 50, 10],
    [prefix, 'MarkaB', `${prefix} ÜRÜN BETA`, 'M2', 'R2', '55', `BC-${TS}-002`, '', 1, 200, 80, 10],
    // Mevcut şablon (RAYBAN) — yeni varyant denemesi
    ['Güneş Gözlüğü', 'Ray-Ban', 'RAYBAN GÜNEŞ GÖZLÜĞÜ', '9999', 'C999', '99', `BC-${TS}-003`, '', 1, 300, 120, 10],
    // Mevcut varyant (RAYBAN bilinen combo — önizleme MEVCUT veya YENI_VARYANT)
    ['Güneş Gözlüğü', 'Ray-Ban', 'RAYBAN GÜNEŞ GÖZLÜĞÜ', '2140', 'C101', '50', `BC-${TS}-004`, '', 1, 400, 150, 10],
    // Hatalı — barkod eksik
    [prefix, 'MarkaC', `${prefix} ÜRÜN GAMMA`, 'M3', 'R3', '56', '', '', 1, 500, 200, 10],
  ];
  for (const r of rows) ws.addRow(r);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function main() {
  let ok = true;
  console.log('=== FAZ A — Envanter import şablon + önizleme ===\n');

  const odooOnce = await countOdooRecords();
  console.log(`Odoo başlangıç: ${odooOnce.templates} şablon, ${odooOnce.products} varyant`);

  // TEST 1
  console.log('\nTEST 1: Boş şablon indirme');
  const sablonBuf = await buildEnvanterSablonBuffer();
  const outPath = resolve(process.cwd(), `envanter-import-sablon-test-${TS}.xlsx`);
  writeFileSync(outPath, sablonBuf);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(sablonBuf);
  const headers = (wb.worksheets[0]?.getRow(1).values as unknown[])
    ?.slice(1)
    .map((v) => String(v ?? '').trim()) ?? [];

  const headersOk = ENVANTER_IMPORT_HEADERS.every((h, i) => headers[i] === h);
  if (headersOk && headers.length === ENVANTER_IMPORT_HEADERS.length) {
    console.log(`  ✅ Şablon doğru (${headers.length} sütun): ${outPath}`);
  } else {
    console.log('  ❌ Şablon sütunları hatalı:', headers);
    ok = false;
  }

  // TEST 2
  console.log('\nTEST 2: 5 satırlık örnek Excel önizleme');
  const ornekBuf = await buildOrnekExcel();
  const parsed = await parseEnvanterExcel(ornekBuf);
  const onizleme = await previewEnvanterImport(parsed);

  console.log(`  Parse: ${parsed.length} satır`);
  console.log(`  Özet:`, onizleme.ozet);
  console.log(`  Şablon grupları: ${onizleme.sablonlar.length}`);
  for (const s of onizleme.sablonlar) {
    console.log(`    - ${s.urunAdi}: ${s.varyantlar.length} varyant, ${s.ozet.toplamSatir} satır`);
  }
  console.log('  Satır durumları:');
  for (const s of onizleme.satirlar) {
    console.log(`    satır ${s.satirNo}: ${s.durum} — ${s.mesaj}`);
  }

  const yeniSablon = onizleme.ozet.yeniSablon;
  const hata = onizleme.ozet.hata;
  const enAzIkiSablon = onizleme.sablonlar.filter((g) =>
    g.urunAdi.includes(`FAZ_A_${TS}`),
  ).length >= 2;
  const hataliSatir = onizleme.satirlar.some((s) => s.durum === 'HATA' && !s.barkod);

  if (yeniSablon >= 2 && hata >= 1 && enAzIkiSablon && hataliSatir) {
    console.log('  ✅ Gruplama ve hata tespiti doğru');
  } else {
    console.log('  ❌ Beklenen önizleme sonucu alınamadı');
    ok = false;
  }

  // TEST 3
  console.log('\nTEST 3: Odoo\'da yeni kayıt oluşmadı');
  const odooSon = await countOdooRecords();
  if (odooSon.templates === odooOnce.templates && odooSon.products === odooOnce.products) {
    console.log(`  ✅ Kayıt sayısı değişmedi (${odooSon.templates} şablon, ${odooSon.products} varyant)`);
  } else {
    console.log(`  ❌ Kayıt sayısı değişti: ${odooOnce.templates}→${odooSon.templates} şablon, ${odooOnce.products}→${odooSon.products} varyant`);
    ok = false;
  }

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
