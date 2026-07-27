/**
 * UTS düzeltme — eski entegrasyon testleri (DEPRECATED — lot-bazli testi kullanın)
 *
 * Varsayılan: dry-run (sadece önizleme/resolve testleri)
 * npx tsx backend/scripts/test-uts-duzeltme-dis-ice-aktar.ts
 * npx tsx backend/scripts/test-uts-duzeltme-dis-ice-aktar.ts --execute
 */
import 'dotenv/config';
import {
  previewEnvanterImport,
  resolveLotForUtsCorrection,
  resolveVariantByOdooId,
} from '../src/modules/admin/envanter-import.service';
import { parseTestScriptArgs, requireExecute } from './lib/test-script-guard';
import {
  createDisposableUtsFixture,
  readLotUts,
  type DisposableUtsFixture,
} from './lib/disposable-uts-fixture';
import { parseEnvanterExcel } from '../src/modules/admin/envanter-import.service';
import { buildUtsDuzeltmeSablonBuffer } from '../src/modules/admin/envanter-uts-duzeltme-export.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import ExcelJS from 'exceljs';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import type { ParsedEnvanterRow } from '../src/modules/admin/envanter-import.service';

const LOKASYON = 'ANADEPO';

async function rowsToBuffer(rows: ParsedEnvanterRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');
  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  for (const row of rows) {
    const vals: Record<string, string | number> = {
      Kategori: row.kategori,
      'Ürün Adı': row.urunAdi,
      Model: row.model,
      Renk: row.renk,
      Ölçü: row.olcu,
      Barkod: row.barkod,
      'UTS Kodu': row.utsKodu,
      Adet: row.adet,
      'Satış Fiyatı': row.satisFiyati,
      'Maliyet Fiyatı': row.maliyetFiyati,
      'KDV Oranı': row.kdvOrani,
      'Odoo Varyant ID': row.odooVaryantId ?? '',
      'Lot No': row.lotNo ?? '',
      'Odoo Lot ID': row.odooLotId ?? '',
    };
    ws.addRow(ENVANTER_IMPORT_HEADERS.map((h) => vals[h] ?? ''));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  const { execute: executeMode } = parseTestScriptArgs();
  let ok = true;
  let fixture: DisposableUtsFixture | null = null;
  const rollback: Array<{ lotId: number; prev: string | false | null }> = [];

  console.log('=== UTS düzeltme dis-ice (disposable, dry-run varsayılan) ===\n');

  try {
    fixture = await createDisposableUtsFixture();
    const parsed = await parseEnvanterExcel(await buildUtsDuzeltmeSablonBuffer([fixture.productId]));
    const lotRow = parsed[0];
    if (!lotRow?.odooLotId) throw new Error('Fixture export satırı yok');

    console.log('TEST 0: resolveVariantByOdooId + resolveLotForUtsCorrection (okuma)');
    const v = await resolveVariantByOdooId(fixture.productId, fixture.barkod);
    const l = await resolveLotForUtsCorrection(lotRow.odooLotId, fixture.productId);
    if (v.ok && l.ok) console.log('  ✅ ID çözümlemeleri OK');
    else {
      console.log('  ❌ ID çözümleme hatası');
      ok = false;
    }

    const bad = await resolveVariantByOdooId(fixture.productId, '0000000000000');
    if (!bad.ok && bad.error.includes('ID ile barkod eşleşmiyor')) {
      console.log('  ✅ Barkod uyuşmazlığı hatası OK');
    } else ok = false;

    if (!requireExecute(executeMode, 'UTS yazma')) {
      console.log('\nYazma testleri atlandı.');
    } else {
      rollback.push({ lotId: lotRow.odooLotId, prev: await readLotUts(lotRow.odooLotId) });
      const testUts = `0868TEST${Date.now().toString().slice(-8)}`;
      const row = { ...lotRow, utsKodu: testUts, satirNo: 2 };
      const preview = await previewEnvanterImport([row]);
      if (preview.satirlar[0]?.durum !== 'MEVCUT_VARYANT') ok = false;

      await uygulaEnvanterImport({
        lokasyonKodu: LOKASYON,
        satirlar: await parseEnvanterExcel(await rowsToBuffer([row])),
      });
      if ((await readLotUts(lotRow.odooLotId)) === testUts) {
        console.log('  ✅ Disposable lot UTS yazıldı ve doğrulandı');
      } else {
        console.log('  ❌ UTS yazılamadı');
        ok = false;
      }
    }
  } finally {
    for (const { lotId, prev } of rollback) {
      try {
        const { execute } = await import('../src/modules/odoo/odoo.service');
        await execute(
          'stock.lot',
          'write',
          [[lotId], { x_uts_kodu: prev === null ? false : prev }],
          {},
          undefined,
        );
      } catch { /* best-effort */ }
    }
    if (fixture) await fixture.cleanup();
    console.log('\n↩ Disposable fixture + UTS rollback tamamlandı');
  }

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
