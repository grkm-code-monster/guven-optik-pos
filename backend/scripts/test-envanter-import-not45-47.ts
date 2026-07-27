/**
 * Not #45 + #46 + #47 test
 * Çalıştır: npx tsx scripts/test-envanter-import-not45-47.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  buildEnvanterSablonBuffer,
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';

const TS = Date.now();
const LOKASYON = 'ANADEPO';
const PREFIX = `NOT47_${TS}`;

async function buildUtsExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8690000${TS}`.slice(0, 13);
  const rows = [
    [PREFIX, `${PREFIX} ÜRÜN`, 'M1', 'R1', '54', barkod, `UTS-A-${TS}`, 1, 100, 50, 10],
    [PREFIX, `${PREFIX} ÜRÜN`, 'M1', 'R1', '54', barkod, `UTS-B-${TS}`, 1, 100, 50, 10],
    [PREFIX, `${PREFIX} ÜRÜN`, 'M1', 'R1', '54', barkod, `UTS-C-${TS}`, 1, 100, 50, 10],
  ];
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildDuplicateExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8690001${TS}`.slice(0, 13);
  const uts = `UTS-DUP-${TS}`;
  ws.addRow([PREFIX, `${PREFIX} ÜRÜN2`, 'M2', 'R2', '55', barkod, uts, 1, 100, 50, 10]);
  ws.addRow([PREFIX, `${PREFIX} ÜRÜN2`, 'M2', 'R2', '55', barkod, uts, 1, 100, 50, 10]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  let ok = true;
  console.log('=== Not #45 + #46 + #47 ===\n');

  // TEST 1
  console.log('TEST 1: Şablon — Marka yok, Barkod/UTS Metin formatı');
  const sablonBuf = await buildEnvanterSablonBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(sablonBuf as unknown as ExcelJS.Buffer);
  const headers = (wb.worksheets[0]?.getRow(1).values as unknown[])?.slice(1).map(String) ?? [];
  const markaYok = !headers.includes('Marka');
  const barkodCol = ENVANTER_IMPORT_HEADERS.indexOf('Barkod') + 1;
  const utsCol = ENVANTER_IMPORT_HEADERS.indexOf('UTS Kodu') + 1;
  const barkodFmt = wb.worksheets[0]?.getCell(2, barkodCol).numFmt;
  const utsFmt = wb.worksheets[0]?.getCell(2, utsCol).numFmt;
  const fmtOk = barkodFmt === '@' && utsFmt === '@';

  if (markaYok && headers.length === ENVANTER_IMPORT_HEADERS.length && fmtOk) {
    console.log(`  ✅ ${headers.length} sütun, Marka yok, Barkod/UTS numFmt='@'`);
  } else {
    console.log('  ❌', { markaYok, headers, barkodFmt, utsFmt });
    ok = false;
  }

  // TEST 2
  console.log('\nTEST 2: Aynı barkod + farklı UTS → 3 geçerli satır');
  const utsBuf = await buildUtsExcel();
  const utsParsed = await parseEnvanterExcel(utsBuf);
  const utsOnizleme = await previewEnvanterImport(utsParsed);
  const gecerli = utsOnizleme.satirlar.filter((s) => s.durum !== 'HATA');
  const mukerrerYok = !utsOnizleme.satirlar.some((s) => s.mesaj.includes('Mükerrer'));

  if (gecerli.length === 3 && utsOnizleme.ozet.hata === 0 && mukerrerYok) {
    console.log('  ✅ 3 satır geçerli, mükerrer barkod hatası yok');
  } else {
    console.log('  ❌', utsOnizleme.satirlar.map((s) => ({ satir: s.satirNo, durum: s.durum, mesaj: s.mesaj })));
    ok = false;
  }

  // TEST 3
  console.log('\nTEST 3: Aynı barkod + aynı UTS → hata');
  const dupBuf = await buildDuplicateExcel();
  const dupParsed = await parseEnvanterExcel(dupBuf);
  const dupOnizleme = await previewEnvanterImport(dupParsed);
  const dupHata = dupOnizleme.satirlar.filter((s) => s.mesaj.includes('Mükerrer barkod+UTS'));

  if (dupHata.length >= 1 && dupOnizleme.ozet.hata >= 1) {
    console.log(`  ✅ Mükerrer tespit edildi (${dupHata.length} satır)`);
  } else {
    console.log('  ❌ Mükerrer bekleniyordu', dupOnizleme.satirlar);
    ok = false;
  }

  // TEST 4
  console.log('\nTEST 4: Uygula → 3 ayrı lot (farklı UTS)');
  const uygula = await uygulaEnvanterImport({ lokasyonKodu: LOKASYON, satirlar: utsParsed });
  console.log(`  Özet: ${uygula.ozet.basarili} başarılı, ${uygula.ozet.basarisiz} başarısız`);

  const lotIds = uygula.satirlar
    .filter((s) => s.durum === 'BASARILI')
    .map((s) => s.olusturulanLotId)
    .filter(Boolean) as number[];

  const uniqueLots = new Set(lotIds);
  let utsDogrulandi = 0;
  for (const row of utsParsed) {
    const lotName = row.utsKodu.trim();
    const lots = await execute(
      'stock.lot', 'search_read',
      [[['name', '=', lotName], ['x_uts_kodu', '=', lotName]]],
      { fields: ['id', 'name', 'x_uts_kodu', 'product_id'], limit: 1 },
    ) as { id: number; name: string; x_uts_kodu: string }[];
    if (lots.length) {
      utsDogrulandi++;
      console.log(`  ✅ Lot #${lots[0].id} name=${lots[0].name} uts=${lots[0].x_uts_kodu}`);
    }
  }

  if (uygula.ozet.basarili === 3 && uniqueLots.size === 3 && utsDogrulandi === 3) {
    console.log('  ✅ 3 ayrı lot Odoo\'da oluştu');
  } else {
    console.log('  ❌ Lot doğrulama başarısız', { lotIds, uniqueLots: uniqueLots.size, utsDogrulandi });
    for (const s of uygula.satirlar) console.log(`    satır ${s.satirNo}: ${s.durum} — ${s.mesaj}`);
    ok = false;
  }

  // Odoo sınırlama raporu
  console.log('\n[Odoo sınırlama] product.product.barcode tekil (varyant bazında);');
  console.log('  aynı barkodlu birden fazla lot stock.lot.name (UTS) ile ayrıştırılabilir.');

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
