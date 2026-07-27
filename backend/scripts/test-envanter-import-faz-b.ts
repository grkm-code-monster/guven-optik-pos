/**
 * FAZ B test: envanter import gerçek yazma (şablon+varyant+lot+stok)
 * Çalıştır: npx tsx scripts/test-envanter-import-faz-b.ts
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  parseEnvanterExcel,
  previewEnvanterImport,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import * as stokYonetimi from '../src/modules/admin/stok-yonetimi.service';

const TS = Date.now();
const LOKASYON = 'ANADEPO';

async function buildGecerliSatirlar(): Promise<ReturnType<typeof parseEnvanterExcel>> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);

  const prefix = `FAZ_B_${TS}`;
  const rows = [
    [prefix, 'MarkaA', `${prefix} ÜRÜN ALPHA`, 'M1', 'R1', '54', `BC-${TS}-001`, '', 1, 100, 50, 10],
    [prefix, 'MarkaB', `${prefix} ÜRÜN BETA`, 'M2', 'R2', '55', `BC-${TS}-002`, '', 1, 200, 80, 10],
    ['Güneş Gözlüğü', 'Ray-Ban', 'RAYBAN GÜNEŞ GÖZLÜĞÜ', '9999', 'C999', '99', `BC-${TS}-003`, '', 1, 300, 120, 10],
    ['Güneş Gözlüğü', 'Ray-Ban', 'RAYBAN GÜNEŞ GÖZLÜĞÜ', '2140', 'C101', '50', `BC-${TS}-004`, '', 1, 400, 150, 10],
  ];
  for (const r of rows) ws.addRow(r);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return parseEnvanterExcel(buf);
}

async function lotExists(lotId: number): Promise<boolean> {
  const count = Number(await execute('stock.lot', 'search_count', [[['id', '=', lotId]]]));
  return count > 0;
}

async function quantForLotAtLocation(
  lotId: number,
  locationId: number,
): Promise<number> {
  const quants = await execute(
    'stock.quant', 'search_read',
    [[['lot_id', '=', lotId], ['location_id', '=', locationId]]],
    { fields: ['quantity'], limit: 5 },
  ) as { quantity: number }[];
  return quants.reduce((s, q) => s + Number(q.quantity), 0);
}

async function main() {
  let ok = true;
  console.log('=== FAZ B — Envanter import gerçek yazma ===\n');

  const satirlar = await buildGecerliSatirlar();
  const onizleme = await previewEnvanterImport(satirlar);
  console.log(`Önizleme: ${satirlar.length} satır, hata=${onizleme.ozet.hata}`);
  if (onizleme.ozet.hata > 0) {
    console.log('  ❌ Geçerli satırlarda hata var:', onizleme.satirlar.filter((s) => s.durum === 'HATA'));
    ok = false;
  }

  // TEST 1 — 4 geçerli satır uygula
  console.log('\nTEST 1: 4 geçerli satır GERÇEK uygulama (ANADEPO)');
  const uygula1 = await uygulaEnvanterImport({ lokasyonKodu: LOKASYON, satirlar });
  console.log(`  Özet: ${uygula1.ozet.basarili} başarılı, ${uygula1.ozet.basarisiz} başarısız`);
  for (const s of uygula1.satirlar) {
    console.log(`    satır ${s.satirNo}: ${s.durum} — ${s.mesaj}${s.olusturulanLotId ? ` (lot #${s.olusturulanLotId})` : ''}`);
  }

  if (uygula1.ozet.basarili !== 4 || uygula1.ozet.basarisiz !== 0) {
    console.log('  ❌ 4 satır BAŞARILI olmalıydı');
    ok = false;
  } else {
    console.log('  ✅ 4 satır BAŞARILI');
  }

  const locationId = LOKASYON_ID_MAP[LOKASYON];
  for (const s of uygula1.satirlar.filter((x) => x.durum === 'BASARILI')) {
    if (!s.olusturulanLotId) continue;
    const qty = await quantForLotAtLocation(s.olusturulanLotId, locationId);
    if (qty < 1) {
      console.log(`  ❌ Lot #${s.olusturulanLotId} ANADEPO'da stok yok (qty=${qty})`);
      ok = false;
    }
  }

  // TEST 2 — geçersiz lokasyon ile tek satır, yetim lot olmamalı
  console.log('\nTEST 2: Geçersiz lokasyon — satır BAŞARISIZ, yetim lot yok');
  const tekSatir = satirlar.slice(0, 1).map((s) => ({
    ...s,
    barkod: `BC-${TS}-FAIL`,
    satirNo: 9000 + s.satirNo,
  }));
  const onizleme2 = await previewEnvanterImport(tekSatir);
  if (onizleme2.ozet.hata > 0) {
    console.log('  ⚠ Tek satır önizlemede hata — yeni barkod ile devam');
  }

  const uygula2 = await uygulaEnvanterImport({
    lokasyonKodu: 'GECERSIZ_LOKASYON_XXX',
    satirlar: tekSatir,
  });

  const failSatir = uygula2.satirlar[0];
  console.log(`  Sonuç: ${failSatir?.durum} — ${failSatir?.mesaj}`);

  if (failSatir?.durum !== 'BASARISIZ') {
    console.log('  ❌ Satır BAŞARISIZ olmalıydı');
    ok = false;
  } else {
    console.log('  ✅ Satır BAŞARISIZ döndü');
  }

  if (failSatir?.olusturulanLotId) {
    const exists = await lotExists(failSatir.olusturulanLotId);
    if (exists) {
      console.log(`  ❌ Yetim lot kaldı: #${failSatir.olusturulanLotId}`);
      ok = false;
    } else {
      console.log('  ✅ Yetim lot yok (rollback)');
    }
  } else {
    console.log('  ✅ Lot ID dönmedi veya rollback sonrası silindi');
  }

  // TEST 3 — Stok Kontrol ekranı verisi
  console.log('\nTEST 3: Stok Kontrol listesinde oluşan stok görünür');
  const barkodlar = uygula1.satirlar
    .filter((s) => s.durum === 'BASARILI')
    .map((s) => satirlar.find((r) => r.satirNo === s.satirNo)?.barkod)
    .filter(Boolean) as string[];

  let stokGorulen = 0;
  for (const bc of barkodlar) {
    const data = await stokYonetimi.listStokKontrol({
      q: bc,
      lokasyon: LOKASYON,
    });
    const bulundu = data.some((d) =>
      d.barkod === bc || (d.toplamStok ?? 0) > 0,
    );
    if (bulundu) {
      stokGorulen++;
      console.log(`  ✅ ${bc} stok kontrolde bulundu`);
    } else {
      console.log(`  ❌ ${bc} stok kontrolde bulunamadı`);
      ok = false;
    }
  }

  if (stokGorulen === barkodlar.length && barkodlar.length === 4) {
    console.log('  ✅ Tüm barkodlar Stok Kontrol\'de görünür');
  }

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
