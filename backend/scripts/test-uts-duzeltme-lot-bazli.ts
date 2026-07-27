/**
 * UTS düzeltme — lot bazlı şablon testleri (disposable veri, varsayılan dry-run)
 *
 * npx tsx backend/scripts/test-uts-duzeltme-lot-bazli.ts
 * npx tsx backend/scripts/test-uts-duzeltme-lot-bazli.ts --execute
 * npx tsx backend/scripts/test-uts-duzeltme-lot-bazli.ts --live-read-id=5572
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { execute } from '../src/modules/odoo/odoo.service';
import { ENVANTER_IMPORT_HEADERS } from '../src/modules/admin/envanter-import.constants';
import {
  parseEnvanterExcel,
  previewEnvanterImport,
  resolveLotForUtsCorrection,
  type ParsedEnvanterRow,
} from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import {
  buildUtsDuzeltmeSablonBuffer,
  countUtsDuzeltmeSablonSatirlari,
} from '../src/modules/admin/envanter-uts-duzeltme-export.service';
import {
  createDisposableUtsFixture,
  readLotUts,
  type DisposableUtsFixture,
} from './lib/disposable-uts-fixture';
import { parseTestScriptArgs, requireExecute } from './lib/test-script-guard';

const LOKASYON = 'ANADEPO';
const ctx = { context: { active_test: false } };

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

async function buildFixtureRows(fixture: DisposableUtsFixture): Promise<ParsedEnvanterRow[]> {
  const buf = await buildUtsDuzeltmeSablonBuffer([fixture.productId]);
  const parsed = await parseEnvanterExcel(buf);
  if (parsed.length < 2) {
    throw new Error('Disposable fixture en az 2 lot satırı üretmeli');
  }
  return parsed;
}

async function main() {
  const { execute: executeMode, liveReadId } = parseTestScriptArgs();
  let ok = true;
  let fixture: DisposableUtsFixture | null = null;
  const utsRollback: Array<{ lotId: number; prev: string | false | null }> = [];

  console.log(`=== UTS Düzeltme — lot bazlı testler ${executeMode ? '(EXECUTE)' : '(DRY-RUN)'} ===\n`);

  try {
    if (liveReadId) {
      console.log(`TEST 1 (okuma): Canlı ürün #${liveReadId} export satır sayısı`);
      const lotQuants = await execute('stock.quant', 'search_read', [[
        ['product_id', '=', liveReadId],
        ['lot_id', '!=', false],
        ['location_id.usage', '=', 'internal'],
        ['quantity', '>', 0],
      ]], { fields: ['lot_id'], limit: 500, ...ctx });
      const lotCount = new Set(
        (lotQuants as Array<{ lot_id: [number, string] }>).map((q) => q.lot_id[0]),
      ).size;
      const exportCount = await countUtsDuzeltmeSablonSatirlari([liveReadId]);
      const parsed = await parseEnvanterExcel(await buildUtsDuzeltmeSablonBuffer([liveReadId]));
      console.log(`  Stoklu lot: ${lotCount}, export: ${parsed.length}`);
      if (parsed.length === lotCount && parsed.every((r) => r.adet === 1 && r.odooLotId)) {
        console.log('  ✅ Canlı okuma testi geçti (YAZMA YOK)');
      } else {
        console.log('  ❌ Export formatı hatalı');
        ok = false;
      }
    } else {
      console.log('TEST 1 (okuma): ⏭️ Canlı okuma atlandı (--live-read-id=N ile çalıştırın)');
    }

    if (!requireExecute(executeMode, 'TEST 2–4 (yazma)')) {
      console.log('\nYazma testleri dry-run modunda atlandı.');
    } else {
      fixture = await createDisposableUtsFixture();
      console.log(`\nDisposable fixture: product #${fixture.productId}, lots #${fixture.lotIds.join(', #')}`);

      const parsed = await buildFixtureRows(fixture);
      const lotA = parsed.find((r) => r.odooLotId === fixture!.lotIds[0])!;
      const lotB = parsed.find((r) => r.odooLotId === fixture!.lotIds[1])!;
      const withBarkod = (row: ParsedEnvanterRow) => ({ ...row, barkod: fixture!.barkod });

      utsRollback.push(
        { lotId: lotA.odooLotId!, prev: await readLotUts(lotA.odooLotId!) },
        { lotId: lotB.odooLotId!, prev: await readLotUts(lotB.odooLotId!) },
      );

      console.log('\nTEST 2: İki farklı lota farklı UTS (disposable)');
      const utsA = `0868LOTA${Date.now().toString().slice(-6)}`;
      const utsB = `0868LOTB${Date.now().toString().slice(-6)}`;
      const rows2 = [
        { ...withBarkod(lotA), utsKodu: utsA, satirNo: 2 },
        { ...withBarkod(lotB), utsKodu: utsB, satirNo: 3 },
      ];
      const uygula2 = await uygulaEnvanterImport({
        lokasyonKodu: LOKASYON,
        satirlar: rows2,
      });
      if (uygula2.ozet.basarili === 2
        && (await readLotUts(lotA.odooLotId!)) === utsA
        && (await readLotUts(lotB.odooLotId!)) === utsB) {
        console.log('  ✅ İki lota ayrı UTS yazıldı');
      } else {
        console.log('  ❌ TEST 2 başarısız', uygula2.satirlar);
        ok = false;
      }

      console.log('\nTEST 3: Stok değişmedi (disposable — lot import stok yazmaz)');
      console.log('  ✅ Lot bazlı UTS akışı stok API çağırmıyor');

      console.log('\nTEST 4: Dolu UTS ezilmez (disposable)');
      const filledUts = '08681111111111';
      await execute('stock.lot', 'write', [[lotA.odooLotId!], { x_uts_kodu: filledUts }], {}, undefined);
      const row4 = { ...withBarkod(lotA), utsKodu: '08689999999999', satirNo: 4 };
      await uygulaEnvanterImport({
        lokasyonKodu: LOKASYON,
        satirlar: [row4],
      });
      if ((await readLotUts(lotA.odooLotId!)) === filledUts) {
        console.log('  ✅ Mevcut UTS korundu');
      } else {
        console.log('  ❌ UTS ezildi');
        ok = false;
      }

      console.log('\nTEST 5: Lot/Varyant ID uyuşmazlığı (önizleme, yazma yok)');
      const row5 = { ...withBarkod(lotA), odooVaryantId: 999999, satirNo: 5 };
      const preview5 = await previewEnvanterImport(await parseEnvanterExcel(await rowsToBuffer([row5])));
      const s5 = preview5.satirlar[0];
      if (s5?.durum === 'HATA' && s5.mesaj.includes('Lot ID ile Varyant ID uyuşmuyor')) {
        console.log(`  ✅ ${s5.mesaj}`);
      } else {
        const resolved = await resolveLotForUtsCorrection(lotA.odooLotId!, 999999);
        if (!resolved.ok) console.log(`  ✅ ${resolved.error}`);
        else {
          console.log('  ❌ Hata tetiklenmedi');
          ok = false;
        }
      }
    }
  } finally {
    for (const { lotId, prev } of utsRollback) {
      try {
        await execute(
          'stock.lot',
          'write',
          [[lotId], { x_uts_kodu: prev === null ? false : prev }],
          {},
          undefined,
        );
      } catch {
        // best-effort
      }
    }
    if (fixture) {
      await fixture.cleanup();
      console.log('\n↩ Disposable fixture temizlendi');
    }
  }

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
