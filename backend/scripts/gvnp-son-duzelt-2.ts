/**
 * TEK SEFERLİK son-son düzeltme.
 *
 * Kök neden: bu 13 satırın Excel'deki Adet'i 2 veya 3 — ama ürünler
 * tracking='serial' (seri numaralı), Odoo'da TEK bir seri numarasının
 * miktarı asla 1'i geçemez (her fiziksel birim kendine özgü tekil bir seri
 * numarası taşımalı). gvnp-son-duzelt.ts tek lota N yazmaya çalıştığı için
 * "Seri numarası kullanılmaktadır" hatası aldı.
 *
 * Bu script: mevcut (zaten oluşmuş, 0 miktarlı) lotu 1'e çekiyor, kalan
 * (Adet-1) birim için YENİ, benzersiz seri numaralı lotlar açıp her birine
 * miktar 1 yazıyor. Toplamda Excel'deki Adet ile birebir eşleşiyor.
 *
 * SADECE bu 13 satır ve SADECE GVNP için, tek seferlik.
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-son-duzelt-2              (dry-run)
 *   npm run gvnp-son-duzelt-2 -- --execute
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel } from '../src/modules/admin/envanter-import.service';
import { findVariantProductId } from '../src/modules/admin/odoo-varyant-import.service';
import { applyStockAdjustment, applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { getOrCreateStockLot } from '../src/modules/admin/stock-lot.service';
import { getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';

const GVNP_LOCATION_ID = 66;
const LOKASYON_KODU = 'GVNP';
const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');
const SATIR_NOLARI = [51, 57, 61, 98, 99, 100, 102, 105, 106, 107, 112, 116, 141];

async function findTemplateId(urunAdi: string): Promise<number | null> {
  const templates = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', urunAdi.trim()]]],
    { fields: ['id', 'name'], limit: 20, context: { active_test: false } },
  )) as { id: number; name: string }[];
  const exact = templates.filter((t) => t.name.trim().toUpperCase() === urunAdi.trim().toUpperCase());
  return exact.length ? exact[0].id : null;
}

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();
  console.log('='.repeat(70));
  console.log('GVNP son-son düzeltme (seri no başına 1 birim, 13 satır)');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);
  const companyId = getCompanyIdFromLokasyon(LOKASYON_KODU) ?? undefined;

  const plan: Array<{ satirNo: number; urunAdi: string; productId: number; mevcutQuantId: number; adet: number }> = [];

  for (const satirNo of SATIR_NOLARI) {
    const row = rows.find((r) => r.satirNo === satirNo);
    if (!row) { console.log(`Satır ${satirNo}: bulunamadı, atlanıyor.`); continue; }
    const tmplId = await findTemplateId(row.urunAdi);
    if (!tmplId) { console.log(`Satır ${satirNo}: şablon bulunamadı.`); continue; }
    const productId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
    if (!productId) { console.log(`Satır ${satirNo}: varyant bulunamadı.`); continue; }

    const quants = (await execute(
      'stock.quant', 'search_read',
      [[['product_id', '=', productId], ['location_id', '=', GVNP_LOCATION_ID]]],
      { fields: ['id', 'quantity'], context: { active_test: false }, limit: 20 },
    )) as Array<{ id: number; quantity: number }>;
    const enEski = [...quants].sort((a, b) => a.id - b.id)[0];
    if (!enEski) { console.log(`Satır ${satirNo}: mevcut quant yok — beklenmiyordu, atlanıyor.`); continue; }

    plan.push({ satirNo, urunAdi: row.urunAdi, productId, mevcutQuantId: enEski.id, adet: row.adet });
  }

  console.log('Plan:');
  for (const p of plan) {
    console.log(`  Satır ${p.satirNo} (${p.urunAdi}) productId ${p.productId}: quant #${p.mevcutQuantId} -> 1, + ${p.adet - 1} yeni lot (her biri 1 adet)`);
  }

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey yazılmadı. Uygulamak için: npm run gvnp-son-duzelt-2 -- --execute');
    return;
  }

  console.log('\n--- Uygulanıyor ---');
  let basarili = 0;
  let hata = 0;

  for (const p of plan) {
    try {
      // 1) Mevcut lotu 1'e çek
      await applyStockAdjustment({
        productId: p.productId,
        locationCode: LOKASYON_KODU,
        qty: 1,
        quantId: p.mevcutQuantId,
      });
      console.log(`  OK satır ${p.satirNo}: quant #${p.mevcutQuantId} -> 1`);

      // 2) Kalan birimler için yeni, benzersiz seri no'lu lotlar
      const row = rows.find((r) => r.satirNo === p.satirNo)!;
      for (let unit = 2; unit <= p.adet; unit++) {
        const now = new Date();
        const tarih = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
        const lotNo = `GRS-${tarih}-EXCGVNP-SONDUZELT2-${p.satirNo}-U${unit}`;
        const lotResult = await getOrCreateStockLot(lotNo, p.productId, companyId, row.barkod, row.utsKodu || undefined);
        await applyStockAdjustmentForLot({
          productId: p.productId,
          locationCode: LOKASYON_KODU,
          lotId: lotResult.lotId,
          qty: 1,
        });
        console.log(`    + birim ${unit}: lot "${lotNo}" (id ${lotResult.lotId}) miktar 1 yazıldı`);
      }

      basarili++;
    } catch (e: unknown) {
      hata++;
      console.log(`  HATA satır ${p.satirNo}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nSonuç: ${basarili} satır işlendi, ${hata} hata`);
  console.log('Doğrulamak için: npm run gvnp-stok-mutabakat');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
