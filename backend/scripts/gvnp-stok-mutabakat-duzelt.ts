/**
 * TEK SEFERLİK düzeltme scripti — GVNP güneş gözlüğü mutabakatı.
 *
 * gvnp-stok-mutabakat.ts'in bulduğu iki sorunu çözer:
 *  1) FAZLA/mükerrer barkodlar: aynı barkod için birden fazla lot/quant
 *     varsa, en eski olanı (en düşük quant id) bırakılır, geri kalanlar
 *     Odoo'nun standart "sayım" (inventory_quantity=0 + action_apply_inventory)
 *     mekanizmasıyla sıfırlanır — ham silme değil, normal stok düzeltmesi.
 *  2) EKSİK barkodlar: GVNP'de hiç lotu olmayan satırlar, normal Excel
 *     Envanter akışıyla (uygulaEnvanterImport) tek seferde içeri alınır.
 *
 * Bu script SADECE bu dosya (gvnp-gunes-gozlugu-import.xlsx) ve SADECE GVNP
 * için bir kerelik kullanım amaçlıdır — otomatik/tekrarlayan bir görev DEĞİLDİR.
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-stok-mutabakat-duzelt              (dry-run — sadece plan)
 *   npm run gvnp-stok-mutabakat-duzelt -- --execute  (gerçekten uygular)
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel, type ParsedEnvanterRow } from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';
import { applyStockAdjustment } from '../src/modules/admin/stock-adjustment.service';

const GVNP_LOCATION_ID = 66;
const LOKASYON_KODU = 'GVNP';
const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();

  console.log('='.repeat(70));
  console.log('GVNP mutabakat düzeltmesi (tek seferlik, sadece bu dosya)');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE (Odoo\'ya yazılacak)' : 'DRY-RUN (sadece plan)'}\n`);

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);

  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['location_id', '=', GVNP_LOCATION_ID], ['quantity', '!=', 0]]],
    { fields: ['id', 'product_id', 'lot_id', 'quantity'], limit: 5000 },
  )) as Array<{ id: number; product_id: [number, string]; lot_id: [number, string] | false; quantity: number }>;

  const productIds = [...new Set(quants.map((q) => q.product_id[0]))];
  const products = (await execute(
    'product.product', 'read', [productIds], { fields: ['id', 'barcode'] },
  )) as Array<{ id: number; barcode: string | false }>;
  const barcodeByProductId = new Map(products.map((p) => [p.id, (p.barcode || '').trim()]));

  const quantsByBarcode = new Map<string, typeof quants>();
  for (const q of quants) {
    const bc = barcodeByProductId.get(q.product_id[0]) || '';
    if (!bc) continue;
    const list = quantsByBarcode.get(bc) ?? [];
    list.push(q);
    quantsByBarcode.set(bc, list);
  }

  const eksikRows: ParsedEnvanterRow[] = [];
  const fazlaGruplari: Array<{ barkod: string; kayitlar: typeof quants }> = [];

  for (const row of rows) {
    const bc = row.barkod.trim();
    const kayitlar = quantsByBarcode.get(bc) ?? [];
    const toplamMiktar = kayitlar.reduce((s, q) => s + q.quantity, 0);

    if (kayitlar.length === 0) {
      eksikRows.push(row);
    } else if (kayitlar.length > 1 || toplamMiktar !== row.adet) {
      fazlaGruplari.push({ barkod: bc, kayitlar });
    }
  }

  console.log(`Eksik (import edilecek)      : ${eksikRows.length} satır`);
  console.log(`Fazla/mükerrer (temizlenecek): ${fazlaGruplari.length} barkod`);

  let toplamSilinecekQuant = 0;
  for (const g of fazlaGruplari) toplamSilinecekQuant += g.kayitlar.length - 1;
  console.log(`Sıfırlanacak toplam quant satırı: ${toplamSilinecekQuant}\n`);

  if (!executeMode) {
    console.log('Bu bir dry-run — hiçbir şey Odoo\'ya yazılmadı.');
    console.log('Plan:');
    console.log(`  1) ${fazlaGruplari.length} barkod için en eski lot bırakılıp geri kalan ${toplamSilinecekQuant} quant sıfırlanacak.`);
    console.log(`  2) ${eksikRows.length} eksik satır normal Excel akışıyla GVNP'ye import edilecek.`);
    console.log('\nGerçek uygulama için: npm run gvnp-stok-mutabakat-duzelt -- --execute');
    return;
  }

  // ── 1) Fazla/mükerrer temizlik ──────────────────────────────
  console.log('--- Fazla/mükerrer temizlik başlıyor ---');
  let temizlenen = 0;
  let temizlemeHata = 0;
  for (const g of fazlaGruplari) {
    const siraliKayitlar = [...g.kayitlar].sort((a, b) => a.id - b.id);
    const [birak, ...fazlalar] = siraliKayitlar;
    for (const f of fazlalar) {
      try {
        await applyStockAdjustment({
          productId: f.product_id[0],
          locationCode: LOKASYON_KODU,
          qty: 0,
          quantId: f.id,
        });
        temizlenen++;
      } catch (e: unknown) {
        temizlemeHata++;
        console.log(`  HATA (barkod ${g.barkod}, quant #${f.id}): ${e instanceof Error ? e.message : e}`);
      }
    }
    void birak; // bırakılan kayda dokunulmadı
  }
  console.log(`Temizlenen quant: ${temizlenen}, hata: ${temizlemeHata}\n`);

  // ── 2) Eksik satırları import et ────────────────────────────
  console.log('--- Eksik satırlar import ediliyor ---');
  if (eksikRows.length) {
    const aktarimKimligi = `GVNP-MUTABAKAT-${Date.now()}`;
    const sonuc = await uygulaEnvanterImport({
      lokasyonKodu: LOKASYON_KODU,
      satirlar: eksikRows,
      aktarimKimligi,
    });
    console.log(`Başarılı: ${sonuc.ozet.basarili}, Başarısız: ${sonuc.ozet.basarisiz}`);
    for (const s of sonuc.satirlar.filter((s) => s.durum === 'BASARISIZ')) {
      const kaynak = eksikRows.find((r) => r.satirNo === s.satirNo);
      console.log(`  Satır ${s.satirNo} (${kaynak?.urunAdi ?? '?'} / ${kaynak?.barkod ?? '?'}): ${s.mesaj}`);
    }
  } else {
    console.log('Eksik satır yok.');
  }

  console.log('\nBitti. Doğrulamak için: npm run gvnp-stok-mutabakat');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
