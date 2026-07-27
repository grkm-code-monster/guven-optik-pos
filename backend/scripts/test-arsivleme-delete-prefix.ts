/**
 * Arşivleme DELETE_ öneki testleri
 * npx ts-node --transpile-only backend/scripts/test-arsivleme-delete-prefix.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  applyArchivePrefixToVariant,
  ARCHIVE_DELETE_PREFIX,
  restoreArchivePrefixFromVariant,
} from '../src/modules/admin/archive-barcode.util';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import {
  topluVaryantArsivdenCikar,
  topluVaryantArsivle,
} from '../src/modules/admin/stok-yonetimi.service';

const ctx = { context: { active_test: false } };
const TS = Date.now();

const ZAROSSI = [
  { id: 5655, barkod: '22442529', model: 'ZA10019', renk: 'C1', olcu: '52' },
  { id: 5687, barkod: '22442680', model: 'ZA10020', renk: 'C2', olcu: '55' },
  { id: 5671, barkod: '22442697', model: 'ZA10026', renk: 'C3', olcu: '48' },
  { id: 5673, barkod: '86932839003381', model: 'ZS1001201', renk: 'C1', olcu: '52' },
];

async function readVariant(id: number) {
  return (await execute('product.product', 'read', [[id]], {
    fields: ['id', 'barcode', 'active'],
    ...ctx,
  }))?.[0] as { id: number; barcode: string; active: boolean };
}

async function readLots(productId: number) {
  return (await execute('stock.lot', 'search_read', [[['product_id', '=', productId]]], {
    fields: ['id', 'name', 'x_uts_kodu', 'ref'],
    limit: 5,
    ...ctx,
  })) ?? [];
}

async function createTestVariant(barkod: string, tmplName: string) {
  const tmplId = Number(await execute('product.template', 'create', [{
    name: tmplName,
    type: 'product',
    list_price: 100,
    tracking: 'serial',
  }], ctx));
  const variants = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', tmplId]]], {
    fields: ['id'],
    limit: 1,
    ...ctx,
  })) as Array<{ id: number }>;
  const variantId = variants[0]?.id;
  if (!variantId) throw new Error('Varyant oluşmadı');
  await execute('product.product', 'write', [[variantId], { barcode: barkod }], ctx);
  return { tmplId, variantId };
}

async function barkodKayitli(barkod: string): Promise<boolean> {
  const rows = await execute('product.product', 'search_read', [[['barcode', '=', barkod]]], {
    fields: ['id'],
    limit: 1,
    ...ctx,
  });
  return (rows?.length ?? 0) > 0;
}

async function test1ArchivePrefix() {
  console.log('=== TEST 1: Arşivle → DELETE_ öneki ===');
  const testBarkod = `8699001${String(TS).slice(-6)}`.slice(0, 13);
  const { tmplId, variantId } = await createTestVariant(testBarkod, `DELETE_PREFIX_TEST_${TS}`);
  const lotId = Number(await execute('stock.lot', 'create', [{
    name: `LOT-${TS}`,
    product_id: variantId,
    x_uts_kodu: `UTS-${TS}`,
    ref: testBarkod,
  }], ctx));

  await topluVaryantArsivle([variantId]);
  const v = await readVariant(variantId);
  const lots = await readLots(variantId);
  const lot = lots.find((l: { id: number }) => l.id === lotId);

  const ok = v.barcode === `${ARCHIVE_DELETE_PREFIX}${testBarkod}`
    && lot?.x_uts_kodu === `${ARCHIVE_DELETE_PREFIX}UTS-${TS}`
    && lot?.ref === `${ARCHIVE_DELETE_PREFIX}${testBarkod}`;
  console.log(`  barcode: ${v.barcode} — ${ok ? 'OK' : 'HATA'}`);
  console.log(`  lot uts: ${lot?.x_uts_kodu}, ref: ${lot?.ref}`);

  await topluVaryantArsivdenCikar([variantId]);
  await execute('stock.lot', 'unlink', [[lotId]], ctx);
  await execute('product.template', 'unlink', [[tmplId]], ctx);
  return ok;
}

async function test2EnvanterAfterPrefix() {
  console.log('\n=== TEST 2: Önek sonrası envanter import (barkod serbest) ===');
  const barkod = `8699002${String(TS).slice(-6)}`.slice(0, 13);
  const { tmplId, variantId } = await createTestVariant(barkod, `ENV_AFTER_ARCH_${TS}`);

  await topluVaryantArsivle([variantId]);
  const kayitliOrijinal = await barkodKayitli(barkod);
  console.log(`  Orijinal barkod hâlâ kayıtlı mı (aktif/pasif): ${kayitliOrijinal}`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  ws.addRow([
    'All / OPTİK ÇERÇEVE',
    `YENI_${TS}`,
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
  const preview = await previewEnvanterImport(rows);
  const hata = preview.satirlar.some((s) => s.mesaj.includes('Barkod Odoo'));
  console.log(`  Önizleme barkod hatası: ${hata ? 'HATA' : 'OK (yok)'}`);

  const uygula = await uygulaEnvanterImport({ lokasyonKodu: 'ANADEPO', satirlar: rows });
  console.log(`  Uygula: ${uygula.ozet.basarili} başarılı — ${uygula.satirlar[0]?.mesaj}`);

  await execute('product.template', 'unlink', [[tmplId]], ctx);
  const ok = !hata && uygula.ozet.basarili === 1;
  return ok;
}

async function test3RestoreOriginal() {
  console.log('\n=== TEST 3: Arşivden çıkar → orijinal barkod ===');
  const barkod = `8699003${String(TS).slice(-6)}`.slice(0, 13);
  const { tmplId, variantId } = await createTestVariant(barkod, `RESTORE_TEST_${TS}`);

  await topluVaryantArsivle([variantId]);
  await topluVaryantArsivdenCikar([variantId]);
  const v = await readVariant(variantId);
  const ok = v.barcode === barkod && v.active === true;
  console.log(`  barcode=${v.barcode} active=${v.active} — ${ok ? 'OK' : 'HATA'}`);

  await execute('product.template', 'unlink', [[tmplId]], ctx);
  return ok;
}

async function test4CollisionWarning() {
  console.log('\n=== TEST 4: Çakışma — restore sessiz yazmaz ===');
  const barkod = `8699004${String(TS).slice(-6)}`.slice(0, 13);
  const { tmplId: tmplA, variantId: varA } = await createTestVariant(barkod, `COL_A_${TS}`);
  const { tmplId: tmplB, variantId: varB } = await createTestVariant(`8699999${String(TS).slice(-6)}`.slice(0, 13), `COL_B_${TS}`);

  await topluVaryantArsivle([varA]);
  await execute('product.product', 'write', [[varB], { barcode: barkod, active: true }], ctx);

  const restore = await restoreArchivePrefixFromVariant(varA, ctx);
  console.log(`  restore ok=${restore.ok} reason=${'reason' in restore ? restore.reason : '—'}`);
  const vA = await readVariant(varA);
  const stillPrefixed = vA.barcode === `${ARCHIVE_DELETE_PREFIX}${barkod}`;
  console.log(`  Arşivli kayıt hâlâ DELETE_ ile: ${stillPrefixed} — ${!restore.ok && stillPrefixed ? 'OK' : 'HATA'}`);

  await execute('product.template', 'unlink', [[tmplA, tmplB]], ctx);
  return !restore.ok && stillPrefixed;
}

async function test5Zarossi() {
  console.log('\n=== TEST 5: ZAROSSI barkodları — önek + envanter ===');
  let ok = true;

  for (const z of ZAROSSI) {
    const before = await readVariant(z.id);
    if (!before.barcode?.startsWith(ARCHIVE_DELETE_PREFIX)) {
      await applyArchivePrefixToVariant(z.id, ctx);
    }
    const after = await readVariant(z.id);
    console.log(`  ${z.barkod}: ${before.barcode} → ${after.barcode}`);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Envanter');
    ws.addRow([...ENVANTER_IMPORT_HEADERS]);
    ws.addRow([
      'All / OPTİK ÇERÇEVE / ALT GRUP',
      'ZAROSSI OPTİK ÇERÇEVE',
      z.model,
      z.renk,
      z.olcu,
      z.barkod,
      '',
      1,
      500,
      200,
      10,
    ]);
    const rows = await parseEnvanterExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const preview = await previewEnvanterImport(rows);
    const barkodHata = preview.satirlar.some((s) => s.mesaj.includes('Barkod Odoo'));
    if (barkodHata) {
      console.log(`    Önizleme HATA: ${preview.satirlar[0]?.mesaj}`);
      ok = false;
      continue;
    }
    const uygula = await uygulaEnvanterImport({ lokasyonKodu: 'ANADEPO', satirlar: rows });
    const basarili = uygula.satirlar[0]?.durum === 'BASARILI';
    console.log(`    Import: ${uygula.satirlar[0]?.durum} — ${uygula.satirlar[0]?.mesaj?.slice(0, 60)}`);
    if (!basarili) ok = false;
  }
  return ok;
}

async function main() {
  const r1 = await test1ArchivePrefix();
  const r2 = await test2EnvanterAfterPrefix();
  const r3 = await test3RestoreOriginal();
  const r4 = await test4CollisionWarning();
  const r5 = await test5Zarossi();
  console.log('\n=== ÖZET ===');
  console.log(`TEST 1: ${r1 ? 'OK' : 'HATA'}`);
  console.log(`TEST 2: ${r2 ? 'OK' : 'HATA'}`);
  console.log(`TEST 3: ${r3 ? 'OK' : 'HATA'}`);
  console.log(`TEST 4: ${r4 ? 'OK' : 'HATA'}`);
  console.log(`TEST 5: ${r5 ? 'OK' : 'HATA'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
