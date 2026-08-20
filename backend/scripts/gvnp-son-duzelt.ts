/**
 * TEK SEFERLİK son düzeltme — 16 satırlık "eksik" listesi için.
 *
 * Kök neden bulundu: bu 16 ürünün her biri GVNP'de zaten 3 lot/quant'a
 * sahipti (önceki 3 denemeden, hepsi mutabakat script'iyle 0'a çekildi).
 * "Eksik" sanılmalarının sebebi: product.barcode alanı SADECE bir satır
 * TAM başarıyla tamamlanınca yazılıyor (guncelleVaryantFiyatlari) — bu 16
 * satır hiçbir denemede tam başarılı olmadığı için barkod hiç yazılmadı ve
 * önceki mutabakat script'i (barkod eşleştirmeli) onları göremedi.
 *
 * Bu script YENİ lot/varyant OLUŞTURMUYOR — MODEL/RENK/ÖLÇÜ ile doğru
 * varyantı buluyor, GVNP'deki mevcut lotlarından en eskisini seçip miktarını
 * 1'e çekiyor (Odoo'nun standart sayım mekanizmasıyla). Diğer (fazladan
 * boşta duran, 0 miktarlı) lotlara dokunmuyor.
 *
 * SADECE bu 16 satır ve SADECE GVNP için, tek seferlik kullanım.
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-son-duzelt              (dry-run)
 *   npm run gvnp-son-duzelt -- --execute
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel, type ParsedEnvanterRow } from '../src/modules/admin/envanter-import.service';
import { findVariantProductId } from '../src/modules/admin/odoo-varyant-import.service';
import { applyStockAdjustment } from '../src/modules/admin/stock-adjustment.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';

const GVNP_LOCATION_ID = 66;
const LOKASYON_KODU = 'GVNP';
const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');

// Önceki "eksik" denemesinde BAŞARISIZ olan 13 satırın orijinal Excel satır no'ları
// (barkod 3/31/77 zaten o denemede başarıyla import edildiği için buraya dahil değil)
const EKSIK_SATIR_NOLARI = [51, 57, 61, 98, 99, 100, 102, 105, 106, 107, 112, 116, 141];

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
  console.log('GVNP son düzeltme (16 satır, tek seferlik)');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);

  const gercekYeni: ParsedEnvanterRow[] = [];
  const guncellenecek: Array<{ row: ParsedEnvanterRow; quantId: number; mevcutMiktar: number }> = [];

  for (const satirNo of EKSIK_SATIR_NOLARI) {
    const row = rows.find((r) => r.satirNo === satirNo);
    if (!row) {
      console.log(`Satır ${satirNo}: Excel'de bulunamadı, atlanıyor.`);
      continue;
    }

    const tmplId = await findTemplateId(row.urunAdi);
    if (!tmplId) {
      console.log(`Satır ${satirNo} (${row.urunAdi}): şablon bulunamadı — atlanıyor.`);
      continue;
    }
    const productId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
    if (!productId) {
      console.log(`Satır ${satirNo} (${row.urunAdi}): varyant bulunamadı — gerçekten yeni, normal import gerekiyor.`);
      gercekYeni.push(row);
      continue;
    }

    const quants = (await execute(
      'stock.quant', 'search_read',
      [[['product_id', '=', productId], ['location_id', '=', GVNP_LOCATION_ID]]],
      { fields: ['id', 'quantity'], context: { active_test: false }, limit: 20 },
    )) as Array<{ id: number; quantity: number }>;

    if (!quants.length) {
      console.log(`Satır ${satirNo} (${row.urunAdi}): GVNP'de hiç quant yok — gerçekten yeni, normal import gerekiyor.`);
      gercekYeni.push(row);
      continue;
    }

    const zatenDoluOlan = quants.find((q) => q.quantity === row.adet);
    if (zatenDoluOlan) {
      console.log(`Satır ${satirNo} (${row.urunAdi}): zaten doğru miktarda (quant #${zatenDoluOlan.id}, ${zatenDoluOlan.quantity}) — dokunulmuyor.`);
      continue;
    }

    const enEski = [...quants].sort((a, b) => a.id - b.id)[0];
    guncellenecek.push({ row, quantId: enEski.id, mevcutMiktar: enEski.quantity });
  }

  console.log(`\nGüncellenecek (mevcut lot, miktar ${'->'} ${'adet'}): ${guncellenecek.length}`);
  for (const g of guncellenecek) {
    console.log(`  Satır ${g.row.satirNo} (${g.row.urunAdi} ${g.row.model}/${g.row.renk}/${g.row.olcu}) quant #${g.quantId}: ${g.mevcutMiktar} -> ${g.row.adet}`);
  }
  console.log(`\nGerçekten yeni (normal import gerekli): ${gercekYeni.length}`);
  for (const r of gercekYeni) console.log(`  Satır ${r.satirNo} (${r.urunAdi} ${r.model}/${r.renk}/${r.olcu})`);

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey yazılmadı. Uygulamak için: npm run gvnp-son-duzelt -- --execute');
    return;
  }

  console.log('\n--- Uygulanıyor ---');
  let basarili = 0;
  let hata = 0;
  for (const g of guncellenecek) {
    try {
      const tmplId = await findTemplateId(g.row.urunAdi);
      const productId = await findVariantProductId(tmplId!, g.row.model, g.row.renk, g.row.olcu);
      await applyStockAdjustment({
        productId: productId!,
        locationCode: LOKASYON_KODU,
        qty: g.row.adet,
        quantId: g.quantId,
      });
      console.log(`  OK satır ${g.row.satirNo}: quant #${g.quantId} -> ${g.row.adet}`);
      basarili++;
    } catch (e: unknown) {
      console.log(`  HATA satır ${g.row.satirNo}: ${e instanceof Error ? e.message : e}`);
      hata++;
    }
  }
  console.log(`Güncelleme: ${basarili} başarılı, ${hata} hata`);

  if (gercekYeni.length) {
    console.log('\n--- Gerçekten yeni satırlar import ediliyor ---');
    const sonuc = await uygulaEnvanterImport({
      lokasyonKodu: LOKASYON_KODU,
      satirlar: gercekYeni,
      aktarimKimligi: `GVNP-SONDUZELT-${Date.now()}`,
    });
    console.log(`Başarılı: ${sonuc.ozet.basarili}, Başarısız: ${sonuc.ozet.basarisiz}`);
    for (const s of sonuc.satirlar.filter((s) => s.durum === 'BASARISIZ')) {
      console.log(`  Satır ${s.satirNo}: ${s.mesaj}`);
    }
  }

  console.log('\nBitti. Doğrulamak için: npm run gvnp-stok-mutabakat');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
