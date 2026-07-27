/**
 * UTS bildirimi GS1 parse + seri/lot validasyon testleri
 * npx ts-node --transpile-only backend/scripts/test-gs1-uts-bildirim-parse.ts
 */
import {
  isGs1DataMatrix,
  parseGs1DataMatrix,
  isUtsSeriLotEksik,
} from '../src/modules/odoo/gs1-parser.util';
import { validateUtsKalemlerSeriLot } from '../src/modules/uts/uts.service';
import { utsAlanUzunlukHatasi, isUtsAlanCokUzun } from '../src/modules/odoo/gs1-parser.util';

const GORKEM_GS1 = '0108680273473668211010210112026-04-24101';
const FNC1_GS1 = '010869328390049921S1001901*11260611*10BATCH1';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

console.log('=== TEST 1: Görkem GS1 string (FNC1 yok) ===');
console.log('isGs1DataMatrix:', isGs1DataMatrix(GORKEM_GS1));
const parsed = parseGs1DataMatrix(GORKEM_GS1);
console.log('parseGs1DataMatrix:', JSON.stringify(parsed, null, 2));

assert(isGs1DataMatrix(GORKEM_GS1), 'GS1 olarak tanınmalı');
assert(parsed !== null, 'parse null dönmemeli');
assert(parsed!.gtin14 === '08680273473668', 'GTIN-14 doğru');
assert(parsed!.serial === '1010210112026-04-24', 'Seri doğru ayrışmalı');
assert(parsed!.lot === '101', 'Lot doğru ayrışmalı');
assert(!isUtsSeriLotEksik(parsed!.serial, parsed!.lot), 'Seri/lot ikisi boş olmamalı');

console.log('\n=== TEST 2: FNC1 ayraçlı GS1 (regresyon) ===');
const fnc1 = parseGs1DataMatrix(FNC1_GS1);
console.log('parseGs1DataMatrix:', JSON.stringify(fnc1, null, 2));
assert(fnc1?.serial === 'S1001901', 'FNC1 seri korunmalı');
assert(fnc1?.lot === 'BATCH1', 'FNC1 lot korunmalı');

console.log('\n=== TEST 3: validateUtsKalemlerSeriLot ===');
const hata = validateUtsKalemlerSeriLot([
  { barkod: '08680273473668', seriNo: '', lotNo: '' },
]);
assert(hata !== null, 'Boş seri+lot hata üretmeli');
assert(
  validateUtsKalemlerSeriLot([{ barkod: 'x', seriNo: 'S1', lotNo: '' }]) === null,
  'Sadece seri dolu geçmeli',
);

console.log('\n=== TEST 4: Eski yanlış parse (serial=10, lot=210) olmamalı ===');
assert(parsed!.serial !== '10', 'Sahte kısa serial kalmamalı');
assert(parsed!.lot !== '210', 'Sahte lot kalmamalı');

console.log('\n=== TEST 5: 20 karakter lot sınırı ===');
const uzunLotHata = validateUtsKalemlerSeriLot([{ barkod: '08680273473668', seriNo: 'S1', lotNo: 'A'.repeat(21) }]);
assert(uzunLotHata !== null, '21 karakter lot engellenmeli');
assert(isUtsAlanCokUzun('S1', 'A'.repeat(21)), 'isUtsAlanCokUzun true olmalı');
assert(utsAlanUzunlukHatasi('S1', 'A'.repeat(21))?.includes('Lot/Batch') ?? false, 'Lot mesajı');

if (process.exitCode) {
  console.error('\nBazı testler başarısız.');
} else {
  console.log('\nTüm testler geçti.');
}
