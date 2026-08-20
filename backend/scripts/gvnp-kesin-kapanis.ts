/**
 * TEK SEFERLİK kesin kapanış — GVNP güneş gözlüğü mutabakatı.
 *
 * Önceki scriptlerin (gvnp-son-duzelt, gvnp-son-duzelt-2) bıraktığı 2 açığı
 * kapatır:
 *  1) Bu scriptler stok/lot'u doğru yazdı ama product.product.barcode
 *     alanını HİÇ damgalamadı (guncelleVaryantFiyatlari çağrılmadı) — bu da
 *     mağazada barkod okutunca ürünün bulunmasını etkileyebilir. Excel'deki
 *     177 satırın HER birinin barkodunu, doğru varyanta (MODEL/RENK/ÖLÇÜ ile
 *     bulunan) şimdi yazıyor.
 *  2) gvnp-stok-mutabakat.ts'in "eksik" tespiti barcode alanına dayandığı
 *     için barkod damgalanmayan ürünleri yanlışlıkla "eksik" gösteriyordu.
 *     Bu script MODEL/RENK/ÖLÇÜ ile gerçek durumu tekrar kontrol eder.
 *
 * Ayrıca önceki "eksik" denemesinden kalma 3 gerçek mükerrer lotu
 * (barkod ...0003, ...0031/0032, ...0077/0078) 0'a çeker.
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-kesin-kapanis              (dry-run)
 *   npm run gvnp-kesin-kapanis -- --execute
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { parseEnvanterExcel, type ParsedEnvanterRow } from '../src/modules/admin/envanter-import.service';
import { findVariantProductId } from '../src/modules/admin/odoo-varyant-import.service';
import { applyStockAdjustment, applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { getOrCreateStockLot } from '../src/modules/admin/stock-lot.service';
import { getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';

const GVNP_LOCATION_ID = 66;
const LOKASYON_KODU = 'GVNP';
const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

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
  const { executeMode } = parseArgs();
  console.log('='.repeat(70));
  console.log('GVNP kesin kapanış (barkod damgalama + mükerrer temizlik)');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);
  const companyId = getCompanyIdFromLokasyon(LOKASYON_KODU) ?? undefined;

  const tmplCache = new Map<string, number | null>();
  async function tmplIdCached(urunAdi: string): Promise<number | null> {
    if (!tmplCache.has(urunAdi)) tmplCache.set(urunAdi, await findTemplateId(urunAdi));
    return tmplCache.get(urunAdi)!;
  }

  type Durum = { row: ParsedEnvanterRow; productId: number; quants: Array<{ id: number; quantity: number }>; barcodeAlaniBos: boolean };
  const durumlar: Durum[] = [];
  const bulunamayan: ParsedEnvanterRow[] = [];

  for (const row of rows) {
    const tmplId = await tmplIdCached(row.urunAdi);
    if (!tmplId) { bulunamayan.push(row); continue; }
    const productId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
    if (!productId) { bulunamayan.push(row); continue; }

    const [prod] = (await execute(
      'product.product', 'read', [[productId]],
      { fields: ['id', 'barcode'], context: { active_test: false } },
    )) as Array<{ id: number; barcode: string | false }>;

    const quants = (await execute(
      'stock.quant', 'search_read',
      [[['product_id', '=', productId], ['location_id', '=', GVNP_LOCATION_ID], ['quantity', '!=', 0]]],
      { fields: ['id', 'quantity'], context: { active_test: false }, limit: 20 },
    )) as Array<{ id: number; quantity: number }>;

    durumlar.push({ row, productId, quants, barcodeAlaniBos: !prod?.barcode });
  }

  const barkodDamgalanacak = durumlar.filter((d) => d.barcodeAlaniBos);
  const gercekEksik = durumlar.filter((d) => d.quants.length === 0 || d.quants.reduce((s, q) => s + q.quantity, 0) !== d.row.adet);
  const dogruDurumda = durumlar.filter((d) => d.quants.length > 0 && d.quants.reduce((s, q) => s + q.quantity, 0) === d.row.adet);
  const mukerrer = durumlar.filter((d) => d.quants.length > 1 && d.quants.reduce((s, q) => s + q.quantity, 0) === d.row.adet);

  console.log(`Toplam satır: ${rows.length}`);
  console.log(`Şablon/varyant bulunamayan: ${bulunamayan.length}`);
  console.log(`Barkod alanı boş (damgalanacak): ${barkodDamgalanacak.length}`);
  console.log(`Miktar doğru olan: ${dogruDurumda.length}`);
  console.log(`Miktar YANLIŞ olan (gerçek sorun): ${gercekEksik.length}`);
  console.log(`Miktar doğru ama birden fazla lota bölünmüş (mükerrer, temizlenecek): ${mukerrer.length}\n`);

  if (bulunamayan.length) {
    console.log('--- Bulunamayan ---');
    for (const r of bulunamayan) console.log(`  Satır ${r.satirNo}: ${r.urunAdi} (${r.model}/${r.renk}/${r.olcu})`);
  }
  if (gercekEksik.length) {
    console.log('\n--- Miktar YANLIŞ (elle bakılmalı) ---');
    for (const d of gercekEksik) {
      const toplam = d.quants.reduce((s, q) => s + q.quantity, 0);
      console.log(`  Satır ${d.row.satirNo}: ${d.row.urunAdi} (${d.row.model}/${d.row.renk}/${d.row.olcu}) — beklenen ${d.row.adet}, mevcut ${toplam} (${d.quants.length} lot)`);
    }
  }
  if (mukerrer.length) {
    console.log('\n--- Mükerrer (temizlenecek fazla lotlar) ---');
    for (const d of mukerrer) {
      const sirali = [...d.quants].sort((a, b) => a.id - b.id);
      console.log(`  Satır ${d.row.satirNo}: ${d.row.urunAdi} — ${d.quants.length} lot, ilk ${d.row.adet} tanesi kalacak, ${d.quants.length - d.row.adet} tanesi sıfırlanacak`);
      void sirali;
    }
  }

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey yazılmadı. Uygulamak için: npm run gvnp-kesin-kapanis -- --execute');
    return;
  }

  console.log('\n--- Uygulanıyor ---');

  // 1) Barkod damgalama (fiyat alanlarına dokunmadan sadece barcode yaz)
  let damgalanan = 0;
  for (const d of barkodDamgalanacak) {
    try {
      await execute('product.product', 'write', [[d.productId], { barcode: d.row.barkod.trim() }]);
      damgalanan++;
    } catch (e: unknown) {
      console.log(`  Barkod damgalama HATA satır ${d.row.satirNo}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Barkod damgalanan: ${damgalanan}/${barkodDamgalanacak.length}`);

  // 2) Mükerrer temizlik — miktar zaten doğru olduğu için, en eski N tanesi
  //    (N = row.adet) kalır, fazlalar sıfırlanır.
  let temizlenen = 0;
  for (const d of mukerrer) {
    const sirali = [...d.quants].sort((a, b) => a.id - b.id);
    const fazlalar = sirali.slice(d.row.adet);
    for (const f of fazlalar) {
      try {
        await applyStockAdjustment({
          productId: d.productId,
          locationCode: LOKASYON_KODU,
          qty: 0,
          quantId: f.id,
        });
        temizlenen++;
      } catch (e: unknown) {
        console.log(`  Mükerrer temizlik HATA satır ${d.row.satirNo} quant #${f.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`Mükerrer temizlenen quant: ${temizlenen}`);

  // 3) Gerçek eksikler — mevcut lotları 1'e çek, kalanı için yeni seri no aç
  let eksikTamamlanan = 0;
  for (const d of gercekEksik) {
    try {
      const sirali = [...d.quants].sort((a, b) => a.id - b.id);
      let unit = 1;
      for (const q of sirali) {
        if (q.quantity !== 1) {
          await applyStockAdjustment({ productId: d.productId, locationCode: LOKASYON_KODU, qty: 1, quantId: q.id });
        }
        unit++;
      }
      for (; unit <= d.row.adet; unit++) {
        const now = new Date();
        const tarih = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
        const lotNo = `GRS-${tarih}-EXCGVNP-KESINKAPANIS-${d.row.satirNo}-U${unit}`;
        const lotResult = await getOrCreateStockLot(lotNo, d.productId, companyId, d.row.barkod, d.row.utsKodu || undefined);
        await applyStockAdjustmentForLot({ productId: d.productId, locationCode: LOKASYON_KODU, lotId: lotResult.lotId, qty: 1 });
      }
      eksikTamamlanan++;
    } catch (e: unknown) {
      console.log(`  Eksik tamamlama HATA satır ${d.row.satirNo}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Eksik tamamlanan satır: ${eksikTamamlanan}/${gercekEksik.length}`);

  console.log('\nBitti. Doğrulamak için: npm run gvnp-stok-mutabakat');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
