/**
 * Sablon Excel — Model/Renk/Ölçü varyant + güvenlik testleri
 * npx ts-node --transpile-only backend/scripts/test-sablon-excel-varyant-import.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  aktarSablonExcelImport,
  dogrulaSablonExcelImport,
  parseSablonExcelUpload,
} from '../src/modules/admin/sablon-excel-import.service';
import {
  SABLON_EXCEL_HEADERS,
  VARSAYILAN_SABLON_EXCEL_KOLON_MAP,
} from '../src/modules/admin/sablon-excel-import.constants';

const TS = Date.now();
const SABLON_AD = `TEST SABLON EXCEL VARYANT ${TS}`;
const KATEGORI = 'All / LENS / STANDART';

async function buildWorkbook(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test');
  ws.addRow([...SABLON_EXCEL_HEADERS]);
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function varyantOzeti(tmplId: number) {
  const variants = await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'display_name', 'barcode', 'product_template_attribute_value_ids'], limit: 50 },
  ) as Array<{
    id: number;
    display_name: string;
    barcode: false | string;
    product_template_attribute_value_ids: number[];
  }>;

  const ptavIds = [...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids ?? []))];
  const ptavs = ptavIds.length
    ? await execute(
        'product.template.attribute.value',
        'read',
        [ptavIds],
        { fields: ['id', 'name', 'attribute_id'] },
      ) as Array<{ id: number; name: string; attribute_id: [number, string] }>
    : [];

  const ptavMap = new Map(ptavs.map((p) => [p.id, p]));
  return variants.map((v) => {
    const attrs = (v.product_template_attribute_value_ids ?? [])
      .map((id) => ptavMap.get(id))
      .filter(Boolean)
      .map((p) => `${p!.attribute_id[1]}=${p!.name}`);
    return { id: v.id, name: v.display_name, barkod: v.barcode || '', attrs };
  });
}

async function main() {
  console.log('=== TEST 1: Düz şablon (Model/Renk/Ölçü boş) ===');
  const flatBuf = await buildWorkbook([[
    KATEGORI,
    `${SABLON_AD} FLAT`,
    '', '', '',
    `869${TS}001`,
    '', '10', '100', '50', 'Güven Optik 1959', 'Lot',
  ]]);
  const flatParsed = await parseSablonExcelUpload(flatBuf);
  const flatDog = await dogrulaSablonExcelImport(flatParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  if (!flatDog.aktarilabilir) throw new Error('Flat doğrulama başarısız');
  const flatSonuc = await aktarSablonExcelImport(flatParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  const flatDetay = flatSonuc.detay[0];
  console.log('Flat durum:', flatDetay?.durum, 'tmplId:', flatDetay?.tmplId);
  if (flatDetay?.durum !== 'created') throw new Error('Flat create bekleniyordu');

  console.log('\n=== TEST 2: Varyantlı çok satır (aynı şablon adı) ===');
  const varBuf = await buildWorkbook([
    [KATEGORI, SABLON_AD, 'OP11850', 'Kirmizi', '53', `869${TS}101`, '', '10', '150', '80', 'Güven Optik 1959', 'Lot'],
    [KATEGORI, SABLON_AD, 'OP11850', 'Mavi', '53', `869${TS}102`, '', '10', '150', '80', 'Güven Optik 1959', 'Lot'],
    [KATEGORI, SABLON_AD, 'OP11850', 'Kirmizi', '50', `869${TS}103`, '', '10', '140', '75', 'Güven Optik 1959', 'Lot'],
  ]);
  const varParsed = await parseSablonExcelUpload(varBuf);
  const varDog = await dogrulaSablonExcelImport(varParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  if (!varDog.aktarilabilir) throw new Error('Varyant doğrulama başarısız');
  const varSonuc = await aktarSablonExcelImport(varParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  console.log('Varyant sonuç:', {
    aktarildi: varSonuc.aktarildi,
    atlandi: varSonuc.atlandi,
    hata: varSonuc.hata,
  });
  const tmplId = varSonuc.detay.find((d) => d.tmplId)?.tmplId;
  if (!tmplId) throw new Error('tmplId yok');
  const ozet = await varyantOzeti(tmplId);
  console.log('Odoo varyantları:', JSON.stringify(ozet, null, 2));
  if (ozet.length < 3) throw new Error('En az 3 varyant bekleniyordu');
  const renkli = ozet.some((v) => v.name.includes('Kirmizi') || v.attrs.some((a) => a.includes('RENK=Kirmizi')));
  if (!renkli) throw new Error('Renk bilgisi varyant adında/attrs içinde görünmüyor');

  console.log('\n=== TEST 3: Mevcut varyantlı şablona düz satır → atlanmalı ===');
  const skipBuf = await buildWorkbook([[
    KATEGORI,
    SABLON_AD,
    '', '', '',
    `869${TS}999`,
    '', '10', '99', '40', 'Güven Optik 1959', 'Lot',
  ]]);
  const skipParsed = await parseSablonExcelUpload(skipBuf);
  const skipDog = await dogrulaSablonExcelImport(skipParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  console.log('Güvenlik uyarısı sayısı:', skipDog.varyantGuvenlikAtlamalari.length);
  const skipSonuc = await aktarSablonExcelImport(skipParsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  const skipDetay = skipSonuc.detay[0];
  console.log('Skip durum:', skipDetay?.durum, skipDetay?.sebep?.slice(0, 60));
  if (skipDetay?.durum !== 'skipped-variant-exists') {
    throw new Error('skipped-variant-exists bekleniyordu');
  }

  const tmplCountAfter = await execute(
    'product.template',
    'search_count',
    [[['name', '=', SABLON_AD]]],
  );
  if (Number(tmplCountAfter) !== 1) {
    throw new Error(`Yeni şablon oluşturulmamalı — adet: ${tmplCountAfter}`);
  }

  console.log('\nOK: Tüm sablon-excel varyant testleri geçti');
  console.log('NOT: Mevcut OPTELLİ kayıtları bu test kapsamında düzeltilmedi.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
