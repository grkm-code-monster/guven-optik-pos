/**
 * GVNP mutabakat raporu: Excel'deki 177 barkod ile Odoo'daki GVNP (location #66)
 * gerçek stok/lot kayıtlarını karşılaştırır.
 *
 * Her barkod için üç durumdan biri:
 *  - EKSIK: Excel'de var, GVNP'de hiç lot yok  → import edilmeli
 *  - FAZLA: Excel'de 1 adet bekleniyor ama GVNP'de 2+ ayrı lot var (mükerrer
 *    yükleme) → fazla lotlar sıfırlanmalı/silinmeli
 *  - TAMAM: Excel'de 1, GVNP'de tam 1 lot (miktar 1) → dokunma
 *
 * SADECE OKUR, hiçbir şey değiştirmez.
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-stok-mutabakat
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel } from '../src/modules/admin/envanter-import.service';

const GVNP_LOCATION_ID = 66;
const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');

async function main() {
  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);
  console.log(`Excel'deki geçerli satır (barkod) sayısı: ${rows.length}\n`);

  // GVNP'deki TÜM sıfır olmayan quant kayıtlarını çek (lot + ürün barkodu dahil)
  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['location_id', '=', GVNP_LOCATION_ID], ['quantity', '!=', 0]]],
    { fields: ['id', 'product_id', 'lot_id', 'quantity'], limit: 5000 },
  )) as Array<{ id: number; product_id: [number, string]; lot_id: [number, string] | false; quantity: number }>;

  const productIds = [...new Set(quants.map((q) => q.product_id[0]))];
  const products = (await execute(
    'product.product',
    'read',
    [productIds],
    { fields: ['id', 'barcode'] },
  )) as Array<{ id: number; barcode: string | false }>;
  const barcodeByProductId = new Map(products.map((p) => [p.id, (p.barcode || '').trim()]));

  // barkod -> quant listesi
  const quantsByBarcode = new Map<string, typeof quants>();
  for (const q of quants) {
    const bc = barcodeByProductId.get(q.product_id[0]) || '';
    if (!bc) continue;
    const list = quantsByBarcode.get(bc) ?? [];
    list.push(q);
    quantsByBarcode.set(bc, list);
  }

  const eksik: typeof rows = [];
  const fazla: Array<{ barkod: string; urunAdi: string; kayitlar: typeof quants }> = [];
  let tamam = 0;

  for (const row of rows) {
    const bc = row.barkod.trim();
    const kayitlar = quantsByBarcode.get(bc) ?? [];
    const toplamMiktar = kayitlar.reduce((s, q) => s + q.quantity, 0);

    if (kayitlar.length === 0) {
      eksik.push(row);
    } else if (kayitlar.length > 1 || toplamMiktar !== row.adet) {
      fazla.push({ barkod: bc, urunAdi: row.urunAdi, kayitlar });
    } else {
      tamam++;
    }
  }

  console.log('='.repeat(70));
  console.log('MUTABAKAT ÖZETİ');
  console.log('='.repeat(70));
  console.log(`Tamam (doğru, tek lot, doğru miktar) : ${tamam}`);
  console.log(`Eksik (GVNP'de hiç yok, import gerek) : ${eksik.length}`);
  console.log(`Fazla/mükerrer (fazla lot var)        : ${fazla.length}`);

  // Excel'de OLMAYAN ama GVNP'de bulunan barkodlar (yabancı/hatalı kayıt)
  const excelBarkodSet = new Set(rows.map((r) => r.barkod.trim()));
  const yabanci = [...quantsByBarcode.keys()].filter((bc) => !excelBarkodSet.has(bc));
  console.log(`Excel'de olmayan ama GVNP'de bulunan barkod : ${yabanci.length}`);

  if (eksik.length) {
    console.log('\n--- EKSİK (import edilecek) ---');
    for (const r of eksik) console.log(`  ${r.barkod}  ${r.urunAdi} ${r.model}/${r.renk}/${r.olcu}`);
  }

  if (fazla.length) {
    console.log('\n--- FAZLA / MÜKERRER (temizlenecek) ---');
    for (const f of fazla) {
      console.log(`  ${f.barkod}  ${f.urunAdi}  -> ${f.kayitlar.length} lot, toplam miktar ${f.kayitlar.reduce((s, q) => s + q.quantity, 0)}`);
      for (const k of f.kayitlar) {
        console.log(`      quant #${k.id} | lot: ${k.lot_id ? k.lot_id[1] : '-'} (lotId ${k.lot_id ? k.lot_id[0] : '-'}) | miktar: ${k.quantity}`);
      }
    }
  }

  if (yabanci.length) {
    console.log('\n--- YABANCI (Excel dışı, GVNP\'de var) ---');
    for (const bc of yabanci.slice(0, 30)) {
      const kayitlar = quantsByBarcode.get(bc)!;
      console.log(`  ${bc} -> ${kayitlar.length} lot, toplam miktar ${kayitlar.reduce((s, q) => s + q.quantity, 0)}`);
    }
    if (yabanci.length > 30) console.log(`  ... ve ${yabanci.length - 30} tane daha`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
