/**
 * FAZ C frontend akış testi (API — UI'nin çağırdığı endpoint'ler)
 * Çalıştır: npx tsx scripts/test-envanter-import-faz-c-api.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute } from '../src/modules/odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  buildEnvanterSablonBuffer,
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import * as stokYonetimi from '../src/modules/admin/stok-yonetimi.service';

const TS = Date.now();
const LOKASYON = 'ANADEPO';

async function buildTestExcel(hataliSatir: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);

  const prefix = `FAZ_C_${TS}`;
  const rows = [
    [prefix, 'MarkaA', `${prefix} ÜRÜN 1`, 'M1', 'R1', '54', `BC-C-${TS}-001`, '', 1, 100, 50, 10],
    [prefix, 'MarkaB', `${prefix} ÜRÜN 2`, 'M2', 'R2', '55', `BC-C-${TS}-002`, '', 1, 200, 80, 10],
  ];
  if (hataliSatir) {
    rows.push([prefix, 'MarkaC', `${prefix} ÜRÜN 3`, 'M3', 'R3', '56', '', '', 1, 300, 100, 10]);
  }

  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  let ok = true;
  console.log('=== FAZ C — Frontend API akış testi ===\n');

  // TEST 1: Şablon indir + doldur + önizleme
  console.log('TEST 1: Şablon indir, doldur, önizleme');
  const sablon = await buildEnvanterSablonBuffer();
  const sablonPath = resolve(process.cwd(), `faz-c-sablon-${TS}.xlsx`);
  writeFileSync(sablonPath, sablon);
  const headersOk = sablon.length > 500;
  const ornekBuf = await buildTestExcel(false);
  const parsed = await parseEnvanterExcel(ornekBuf);
  const onizleme = await previewEnvanterImport(parsed);

  if (headersOk && onizleme.ozet.toplamSatir === 2 && onizleme.ozet.hata === 0) {
    console.log(`  ✅ Şablon (${sablon.length} byte) + 2 satır önizleme doğru`);
    console.log(`     yeniSablon=${onizleme.ozet.yeniSablon}, yeniVaryant=${onizleme.ozet.yeniVaryant}`);
  } else {
    console.log('  ❌ Önizleme beklenen sonucu vermedi', onizleme.ozet);
    ok = false;
  }
  try { unlinkSync(sablonPath); } catch { /* ignore */ }

  // TEST 2: Hatalı satır kırmızı/net mesaj (önizleme simülasyonu)
  console.log('\nTEST 2: Hatalı satır önizleme');
  const hataliBuf = await buildTestExcel(true);
  const hataliParsed = await parseEnvanterExcel(hataliBuf);
  const hataliOnizleme = await previewEnvanterImport(hataliParsed);
  const hataSatir = hataliOnizleme.satirlar.find((s) => s.durum === 'HATA');

  if (hataliOnizleme.ozet.hata >= 1 && hataSatir && !hataSatir.barkod) {
    console.log(`  ✅ Hatalı satır: durum=${hataSatir.durum}, mesaj="${hataSatir.mesaj}"`);
  } else {
    console.log('  ❌ Hatalı satır tespit edilemedi');
    ok = false;
  }

  // TEST 3: Onayla → uygula (hatasız satırlar)
  console.log('\nTEST 3: Onayla ve uygula (2 geçerli satır)');
  const uygula = await uygulaEnvanterImport({
    lokasyonKodu: LOKASYON,
    satirlar: parsed,
  });

  console.log(`  Özet: ${uygula.ozet.basarili} başarılı, ${uygula.ozet.basarisiz} başarısız`);
  if (uygula.ozet.basarili === 2 && uygula.ozet.basarisiz === 0) {
    console.log('  ✅ Uygulama sonucu doğru');
  } else {
    console.log('  ❌ Beklenen 2 başarılı satır alınamadı');
    for (const s of uygula.satirlar) console.log(`    satır ${s.satirNo}: ${s.durum} — ${s.mesaj}`);
    ok = false;
  }

  // TEST 4: Stok Kontrol
  console.log('\nTEST 4: Stok Kontrol doğrulama');
  let stokOk = 0;
  for (const row of parsed) {
    const data = await stokYonetimi.listStokKontrol({ q: row.barkod, lokasyon: LOKASYON });
    const bulundu = data.some((d) => d.barkod === row.barkod && (d.toplamStok ?? 0) > 0);
    if (bulundu) {
      stokOk++;
      console.log(`  ✅ ${row.barkod} görünür (stok=${data[0]?.toplamStok})`);
    } else {
      console.log(`  ❌ ${row.barkod} Stok Kontrol'de yok`);
      ok = false;
    }
  }
  if (stokOk === 2) console.log('  ✅ Stok Kontrol doğrulandı');

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
