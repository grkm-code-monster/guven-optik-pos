/**
 * "Seri numarası kullanılmaktadır" hatasının kök nedenini teşhis eder.
 * Uygulamanın GERÇEKTE kullandığı varyant eşleştirmeyi (şablon adı + MODEL/
 * RENK/ÖLÇÜ) tekrarlar — barkod alanı ürün eşleştirmede kullanılmıyor,
 * sadece lot/stok ekleme BAŞARILI olduktan SONRA ürüne yazılıyor.
 *
 * Kullanım (satirNo'lar Excel'deki orijinal satır numaraları):
 *   cd backend
 *   npm run check-lot-collision -- 51,57,61
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel } from '../src/modules/admin/envanter-import.service';
import { findVariantProductId } from '../src/modules/admin/odoo-varyant-import.service';

const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');

async function findTemplateId(urunAdi: string): Promise<number | null> {
  const templates = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', urunAdi.trim()]]],
    { fields: ['id', 'name'], limit: 20, context: { active_test: false } },
  )) as { id: number; name: string }[];
  const exact = templates.filter((t) => t.name.trim().toUpperCase() === urunAdi.trim().toUpperCase());
  return exact.length ? exact[0].id : null;
}

async function main() {
  const satirNolar = (process.argv[2] || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  if (!satirNolar.length) {
    console.log('Kullanım: npm run check-lot-collision -- 51,57,61');
    return;
  }

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);

  for (const satirNo of satirNolar) {
    const row = rows.find((r) => r.satirNo === satirNo);
    console.log('='.repeat(70));
    if (!row) {
      console.log(`Satır ${satirNo} bulunamadı.`);
      continue;
    }
    console.log(`Satır ${satirNo}: ${row.urunAdi} (${row.model}/${row.renk}/${row.olcu}) barkod:${row.barkod}`);
    console.log('='.repeat(70));

    const tmplId = await findTemplateId(row.urunAdi);
    if (!tmplId) {
      console.log('  Şablon bulunamadı.');
      continue;
    }
    console.log(`  Şablon id: ${tmplId}`);

    const productId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
    if (!productId) {
      console.log('  Varyant (product.product) bulunamadı — bu satır YENİ_VARYANT olmalıydı.');
      continue;
    }
    console.log(`  Varyant (product.product) id: ${productId}`);

    const prod = (await execute(
      'product.product', 'read', [[productId]],
      { fields: ['id', 'name', 'barcode', 'tracking'], context: { active_test: false } },
    )) as Array<{ id: number; name: string; barcode: string | false; tracking: string }>;
    console.log(`  Ürün: ${prod[0]?.name} | barcode alanı: ${prod[0]?.barcode || '(boş)'} | tracking: ${prod[0]?.tracking}`);

    const lots = (await execute(
      'stock.lot', 'search_read',
      [[['product_id', '=', productId]]],
      { fields: ['id', 'name', 'product_qty'], context: { active_test: false }, limit: 50 },
    )) as Array<{ id: number; name: string; product_qty: number }>;
    console.log(`  Bu varyanta ait lot sayısı: ${lots.length}`);
    for (const l of lots) console.log(`    lot #${l.id} "${l.name}" qty:${l.product_qty}`);

    const quants = (await execute(
      'stock.quant', 'search_read',
      [[['product_id', '=', productId]]],
      { fields: ['id', 'location_id', 'lot_id', 'quantity'], context: { active_test: false }, limit: 50 },
    )) as Array<{ id: number; location_id: [number, string]; lot_id: [number, string] | false; quantity: number }>;
    console.log(`  Bu varyanta ait quant sayısı: ${quants.length}`);
    for (const q of quants) console.log(`    quant #${q.id} lokasyon:${q.location_id?.[1]} lot:${q.lot_id ? q.lot_id[1] : '-'} miktar:${q.quantity}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
