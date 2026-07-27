/**
 * Envanter import GS1 UTS + lot testleri + ZAROSSI teşhis
 * npx ts-node --transpile-only backend/scripts/test-envanter-import-gs1-uts-lot.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import { parseEnvanterExcel } from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import {
  isGs1DataMatrix,
  parseGs1DataMatrix,
  resolveEnvanterLotFields,
} from '../src/modules/odoo/gs1-parser.util';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';

const LOKASYON = 'ANADEPO';
const TS = Date.now();
const PREFIX = `GS1IMP_${TS}`;

// GTIN 08693283900499 + seri S1001901 + üretim 260611 + lot BATCH1 (FNC1 ayraçlı — gerçek tarama formatı)
const GS1_HAM = '010869328390049921S1001901*11260611*10BATCH1';

async function buildGs1Excel(): Promise<{ buffer: Buffer; barkod: string }> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8693283${String(TS).slice(-5)}`.slice(0, 13);
  ws.addRow([
    PREFIX, `${PREFIX} GS1 TEST`, 'M-GS1', 'R1', '54', barkod, GS1_HAM, 1, 500, 200, 10,
  ]);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), barkod };
}

async function buildPlainUtsExcel(): Promise<{ buffer: Buffer; uts: string; barkod: string }> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  const barkod = `8693284${String(TS).slice(-5)}`.slice(0, 13);
  const uts = `12345-${TS}`;
  ws.addRow([
    PREFIX, `${PREFIX} PLAIN UTS`, 'M-PLN', 'R2', '55', barkod, uts, 1, 300, 100, 10,
  ]);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), uts, barkod };
}

async function diagnoseZarossi() {
  console.log('\n=== TEST 4: ZAROSSI ZA10019/ZA10020/ZA10026 teşhisi ===');
  const cases = [
    { model: 'ZA10019', productId: 5655, barcode: '22442529', lotId: 536 },
    { model: 'ZA10020', productId: 5687, barcode: '22442680', lotId: 539 },
    { model: 'ZA10026', productId: 5671, barcode: '22442697', lotId: 537 },
  ];

  for (const c of cases) {
    console.log(`\n  --- ${c.model} productId=${c.productId} barkod=${c.barcode} ---`);

    const product = (await execute(
      'product.product',
      'read',
      [[c.productId]],
      { fields: ['id', 'display_name', 'barcode', 'active'], context: { active_test: false } },
    ))?.[0];
    console.log(`  active=${product?.active} display=${product?.display_name ?? '—'}`);

    const lots = (await execute(
      'stock.lot',
      'read',
      [[c.lotId]],
      { fields: ['id', 'name', 'x_uts_kodu', 'ref'], context: { active_test: false } },
    )) ?? [];
    for (const lot of lots) {
      const name = String(lot.name ?? '');
      console.log(`  lot#${lot.id} nameLen=${name.length} name="${name.slice(0, 55)}${name.length > 55 ? '…' : ''}"`);
      console.log(`    x_uts_kodu="${String(lot.x_uts_kodu ?? '').slice(0, 55)}" (ham GS1 — eski import)`);
      const parsed = parseGs1DataMatrix(name);
      console.log(`    GS1 ayrıştırma (FNC1 yok):`, parsed);
    }

    const quants = (await execute(
      'stock.quant',
      'search_read',
      [[['product_id', '=', c.productId], ['quantity', '!=', 0]]],
      { fields: ['location_id', 'quantity', 'lot_id'], limit: 10 },
    )) ?? [];
    console.log(`  stock.quant (qty≠0): ${quants.length}`, quants.map((q: { location_id?: [number, string]; quantity: number; lot_id?: [number, string] }) =>
      `${q.location_id?.[1]} qty=${q.quantity} lot=${String(q.lot_id?.[1] ?? '').slice(0, 20)}`,
    ));

    try {
      await searchUrunLotsByProduct(c.productId, LOKASYON);
      console.log('  searchUrunLotsByProduct: OK');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  searchUrunLotsByProduct: HATA — ${msg}`);
      if (product?.active === false) {
        console.log('  TEŞHİS: Varyant arşivde (active=false) → transfer lot API ürünü bulamıyor; Stok Kontrol paneli boş görünür');
      }
    }

    if (lots.length) {
      console.log('  TEŞHİS: Lot OLUŞMUŞ (import başarılı) ama name/x_uts_kodu ham 41-char GS1 string — yeni import düzeltmesi bunu temizler');
    } else {
      console.log('  TEŞHİS: Lot hiç oluşmamış');
    }
  }
}

async function main() {
  console.log('=== TEST 0: GS1 ayrıştırma ===');
  console.log('  isGs1:', isGs1DataMatrix(GS1_HAM));
  const parsed = parseGs1DataMatrix(GS1_HAM);
  console.log('  parsed:', parsed);
  const fields = resolveEnvanterLotFields(GS1_HAM, '22442529');
  console.log('  resolveEnvanterLotFields:', fields);
  const plain = resolveEnvanterLotFields('12345', '99999');
  console.log('  plain UTS resolve:', plain);

  console.log('\n=== TEST 1-2: GS1 envanter import → lot + UTS ===');
  const { buffer: gs1Buf, barkod: gs1Barkod } = await buildGs1Excel();
  const gs1Rows = await parseEnvanterExcel(gs1Buf);
  const gs1Uygula = await uygulaEnvanterImport({ lokasyonKodu: LOKASYON, satirlar: gs1Rows });
  const gs1Satir = gs1Uygula.satirlar[0];
  console.log(`  Uygula: ${gs1Satir?.durum} — ${gs1Satir?.mesaj}`);
  if (gs1Satir?.olusturulanLotId) {
    const lots = await execute(
      'stock.lot',
      'read',
      [[gs1Satir.olusturulanLotId]],
      { fields: ['name', 'x_uts_kodu', 'product_id'] },
    );
    const lot = lots?.[0];
    console.log(`  Odoo lot.name="${lot?.name}" (len=${String(lot?.name ?? '').length})`);
    console.log(`  Odoo x_uts_kodu="${lot?.x_uts_kodu}"`);
    const nameOk = String(lot?.name) === 'S1001901' && String(lot?.name).length < 30;
    const utsOk = lot?.x_uts_kodu === '08693283900499';
    console.log(`  Lot name temiz: ${nameOk ? 'OK' : 'HATA'}`);
    console.log(`  x_uts_kodu GTIN-14: ${utsOk ? 'OK' : 'HATA'}`);

    const pid = lot?.product_id?.[0] ?? gs1Satir.olusturulanVaryantId;
    if (pid) {
      const panel = await searchUrunLotsByProduct(pid, LOKASYON);
      const found = panel.some((p) => p.lotNo === lot?.name && p.utsKodu === lot?.x_uts_kodu);
      console.log(`  Stok Kontrol/POS lot paneli: ${found ? 'OK' : 'HATA'} (${panel.length} lot)`);
    }
  } else {
    console.log('  HATA: lot oluşturulmadı');
  }

  console.log('\n=== TEST 3: Düz UTS kodu (GS1 olmayan) ===');
  const { buffer: plainBuf, uts, barkod: plainBarkod } = await buildPlainUtsExcel();
  const plainRows = await parseEnvanterExcel(plainBuf);
  const plainUygula = await uygulaEnvanterImport({ lokasyonKodu: LOKASYON, satirlar: plainRows });
  const plainSatir = plainUygula.satirlar[0];
  console.log(`  Uygula: ${plainSatir?.durum} — ${plainSatir?.mesaj}`);
  if (plainSatir?.olusturulanLotId) {
    const lots = await execute(
      'stock.lot',
      'read',
      [[plainSatir.olusturulanLotId]],
      { fields: ['name', 'x_uts_kodu'] },
    );
    const lot = lots?.[0];
    const legacyOk = lot?.name === uts && lot?.x_uts_kodu === uts;
    console.log(`  name="${lot?.name}" uts="${lot?.x_uts_kodu}" — ${legacyOk ? 'OK (eski davranış)' : 'HATA'}`);
  }

  await diagnoseZarossi();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
