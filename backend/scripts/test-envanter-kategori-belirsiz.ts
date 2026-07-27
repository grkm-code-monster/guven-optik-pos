/**
 * Envanter import kategori belirsizliği testleri
 * npx ts-node --transpile-only backend/scripts/test-envanter-kategori-belirsiz.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  findExistingCategoryMatch,
  resolveOrCreateCategoryId,
} from '../src/modules/odoo/odoo-category.util';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';

const ZAROSSI_KATEGORI = 'All / OPTİK ÇERÇEVE / ALT GRUP';
const TS = Date.now();

async function test1Candidates() {
  console.log('=== TEST 1: Çakışan kategoriler ===');
  const r = await findExistingCategoryMatch(ZAROSSI_KATEGORI);
  console.log(`Excel kategori: "${ZAROSSI_KATEGORI}"`);
  console.log(`matchType: ${r.matchType}`);
  for (const c of r.candidates) {
    console.log(`  aday #${c.id}: ${c.complete_name}`);
  }

  const zarossi = await execute('product.template', 'read', [[1956]], {
    fields: ['id', 'name', 'categ_id'],
    context: { active_test: false },
  });
  console.log(`Mevcut ZAROSSI şablon kategorisi: #${zarossi?.[0]?.categ_id?.[0]} ${zarossi?.[0]?.categ_id?.[1]}`);
}

async function buildZarossiRow(barkod: string, model: string, renk: string, olcu: string) {
  return [
    ZAROSSI_KATEGORI,
    'ZAROSSI OPTİK ÇERÇEVE',
    model,
    renk,
    olcu,
    barkod,
    '',
    1,
    500,
    200,
    10,
  ];
}

async function test2ZarossiImport() {
  console.log('\n=== TEST 2: ZAROSSI tam kategori yolu ile import ===');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8693283${String(TS).slice(-5)}`.slice(0, 13);
  ws.addRow(await buildZarossiRow(barkod, `ZA${TS}`.slice(0, 8), 'C1', '52'));

  const rows = await parseEnvanterExcel(Buffer.from(await wb.xlsx.writeBuffer()));
  const preview = await previewEnvanterImport(rows);
  console.log('  Önizleme:', preview.satirlar.map((s) => `${s.satirNo}:${s.durum}`).join(', '));

  const resolved = await resolveOrCreateCategoryId(ZAROSSI_KATEGORI);
  console.log(`  resolveOrCreateCategoryId → #${resolved.id} (${resolved.matchType})`);

  const uygula = await uygulaEnvanterImport({ lokasyonKodu: 'ANADEPO', satirlar: rows });
  console.log(`  Uygula: ${uygula.ozet.basarili} başarılı, ${uygula.ozet.basarisiz} başarısız`);
  for (const s of uygula.satirlar) {
    console.log(`    satır ${s.satirNo}: ${s.durum} — ${s.mesaj.slice(0, 120)}`);
    if (s.kategoriAdaylari?.length) {
      console.log('      adaylar:', s.kategoriAdaylari.map((a) => `#${a.id} ${a.completeName}`).join('; '));
    }
  }
}

async function test3AmbiguousShowsCandidates() {
  console.log('\n=== TEST 3: Belirsiz kategori → kategoriAdaylari ===');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8693284${String(TS).slice(-5)}`.slice(0, 13);
  ws.addRow([
    'Alt Grup',
    `BELIRSIZ TEST ${TS}`,
    'M1',
    'R1',
    '54',
    barkod,
    '',
    1,
    100,
    50,
    10,
  ]);

  const rows = await parseEnvanterExcel(Buffer.from(await wb.xlsx.writeBuffer()));
  const uygula = await uygulaEnvanterImport({ lokasyonKodu: 'ANADEPO', satirlar: rows });
  const fail = uygula.satirlar.find((s) => s.durum === 'BASARISIZ');
  console.log(`  mesaj: ${fail?.mesaj?.slice(0, 100)}…`);
  console.log(`  kategoriAdaylari: ${fail?.kategoriAdaylari?.length ?? 0} aday`);
  for (const a of fail?.kategoriAdaylari ?? []) {
    console.log(`    #${a.id} ${a.completeName}`);
  }
  console.log(`  TEST 3: ${fail?.kategoriAdaylari?.length ? 'OK' : 'HATA'}`);
}

async function main() {
  await test1Candidates();
  await test2ZarossiImport();
  await test3AmbiguousShowsCandidates();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
