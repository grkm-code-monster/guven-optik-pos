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

async function findTemplateId(urunAdi: string, model: string): Promise<number | null> {
  const templates = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', urunAdi.trim()]]],
    { fields: ['id', 'name'], limit: 200, context: { active_test: false } },
  )) as { id: number; name: string }[];

  const urunAdiUpper = urunAdi.trim().toUpperCase();
  const exact = templates.filter((t) => t.name.trim().toUpperCase() === urunAdiUpper);
  if (exact.length) return exact[0].id;

  // Varyant patlaması koruması: "{Ürün Adı} {MODEL}" şeklinde bölünmüş
  // şablon oluşturulmuş olabilir (bkz. odoo-varyant-import.service.ts /
  // importVaryantlarSplitByModel) — model adını da eşleştirerek ara.
  const modelUpper = model.trim().toUpperCase();
  const split = templates.filter((t) => {
    const n = t.name.trim().toUpperCase();
    return n === `${urunAdiUpper} ${modelUpper}` || (n.startsWith(urunAdiUpper) && n.includes(modelUpper));
  });
  return split.length ? split[0].id : null;
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
  async function tmplIdCached(urunAdi: string, model: string): Promise<number | null> {
    const key = `${urunAdi}::${model}`;
    if (!tmplCache.has(key)) tmplCache.set(key, await findTemplateId(urunAdi, model));
    return tmplCache.get(key)!;
  }

  type Durum = { row: ParsedEnvanterRow; productId: number; barcodeAlaniBos: boolean };
  const durumlar: Durum[] = [];
  const bulunamayan: ParsedEnvanterRow[] = [];

  for (const row of rows) {
    const tmplId = await tmplIdCached(row.urunAdi, row.model);
    if (!tmplId) { bulunamayan.push(row); continue; }
    const productId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
    if (!productId) { bulunamayan.push(row); continue; }

    const [prod] = (await execute(
      'product.product', 'read', [[productId]],
      { fields: ['id', 'barcode'], context: { active_test: false } },
    )) as Array<{ id: number; barcode: string | false }>;

    durumlar.push({ row, productId, barcodeAlaniBos: !prod?.barcode });
  }

  // AYNI productId'ye birden fazla Excel satırı denk gelebilir (aynı model/
  // renk/ölçü, farklı barkodlu 2 ayrı fiziksel birim) — bu yüzden mükerrer/
  // eksik tespiti SATIR bazlı değil, productId bazlı toplanarak yapılıyor.
  type ProductGrup = { productId: number; rows: ParsedEnvanterRow[]; beklenen: number; quants: Array<{ id: number; quantity: number }> };
  const gruplar = new Map<number, ProductGrup>();
  for (const d of durumlar) {
    const g = gruplar.get(d.productId) ?? { productId: d.productId, rows: [], beklenen: 0, quants: [] };
    g.rows.push(d.row);
    g.beklenen += d.row.adet;
    gruplar.set(d.productId, g);
  }
  for (const g of gruplar.values()) {
    g.quants = (await execute(
      'stock.quant', 'search_read',
      [[['product_id', '=', g.productId], ['location_id', '=', GVNP_LOCATION_ID], ['quantity', '!=', 0]]],
      { fields: ['id', 'quantity'], context: { active_test: false }, limit: 20 },
    )) as Array<{ id: number; quantity: number }>;
  }

  const barkodDamgalanacak = durumlar.filter((d) => d.barcodeAlaniBos);
  const tumGruplar = [...gruplar.values()];
  const gercekEksik = tumGruplar.filter((g) => g.quants.reduce((s, q) => s + q.quantity, 0) < g.beklenen);
  const mukerrer = tumGruplar.filter((g) => g.quants.reduce((s, q) => s + q.quantity, 0) > g.beklenen);
  const dogruDurumda = tumGruplar.filter((g) => g.quants.reduce((s, q) => s + q.quantity, 0) === g.beklenen);

  console.log(`Toplam satır: ${rows.length}, benzersiz ürün (varyant): ${tumGruplar.length}`);
  console.log(`Şablon/varyant bulunamayan satır: ${bulunamayan.length}`);
  console.log(`Barkod alanı boş (damgalanacak) satır: ${barkodDamgalanacak.length}`);
  console.log(`Miktar doğru ürün: ${dogruDurumda.length}`);
  console.log(`Miktar EKSİK ürün: ${gercekEksik.length}`);
  console.log(`Miktar FAZLA (mükerrer) ürün: ${mukerrer.length}\n`);

  if (bulunamayan.length) {
    console.log('--- Bulunamayan (şablon/varyant, muhtemelen bölünmüş şablon farklı isimde) ---');
    for (const r of bulunamayan) console.log(`  Satır ${r.satirNo}: ${r.urunAdi} (${r.model}/${r.renk}/${r.olcu})`);
  }
  if (gercekEksik.length) {
    console.log('\n--- Miktar EKSİK (tamamlanacak) ---');
    for (const g of gercekEksik) {
      const toplam = g.quants.reduce((s, q) => s + q.quantity, 0);
      console.log(`  productId ${g.productId} (satır ${g.rows.map((r) => r.satirNo).join(',')}) — beklenen ${g.beklenen}, mevcut ${toplam}`);
    }
  }
  if (mukerrer.length) {
    console.log('\n--- Miktar FAZLA (mükerrer, temizlenecek) ---');
    for (const g of mukerrer) {
      const toplam = g.quants.reduce((s, q) => s + q.quantity, 0);
      console.log(`  productId ${g.productId} (satır ${g.rows.map((r) => r.satirNo).join(',')}) — beklenen ${g.beklenen}, mevcut ${toplam}, ${g.quants.length} lot`);
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

  // 2) Mükerrer temizlik — miktar zaten (grup toplamında) fazla olduğu için,
  //    en eski lotlar toplam "beklenen" miktarına ulaşana kadar korunur,
  //    fazlalar sıfırlanır.
  let temizlenen = 0;
  for (const g of mukerrer) {
    const sirali = [...g.quants].sort((a, b) => a.id - b.id);
    let kalanBeklenen = g.beklenen;
    for (const q of sirali) {
      if (kalanBeklenen >= q.quantity) {
        kalanBeklenen -= q.quantity;
        continue;
      }
      const hedef = Math.max(0, kalanBeklenen);
      try {
        await applyStockAdjustment({ productId: g.productId, locationCode: LOKASYON_KODU, qty: hedef, quantId: q.id });
        temizlenen++;
      } catch (e: unknown) {
        console.log(`  Mükerrer temizlik HATA productId ${g.productId} quant #${q.id}: ${e instanceof Error ? e.message : e}`);
      }
      kalanBeklenen = 0;
    }
  }
  console.log(`Mükerrer temizlenen quant: ${temizlenen}`);

  // 3) Gerçek eksikler — mevcut lotları 1'e çek, kalanı için yeni seri no aç
  let eksikTamamlanan = 0;
  for (const g of gercekEksik) {
    try {
      const sirali = [...g.quants].sort((a, b) => a.id - b.id);
      let unit = 1;
      for (const q of sirali) {
        if (q.quantity !== 1) {
          await applyStockAdjustment({ productId: g.productId, locationCode: LOKASYON_KODU, qty: 1, quantId: q.id });
        }
        unit++;
      }
      const referansSatir = g.rows[0];
      for (; unit <= g.beklenen; unit++) {
        const now = new Date();
        const tarih = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
        const lotNo = `GRS-${tarih}-EXCGVNP-KESINKAPANIS-${g.productId}-U${unit}`;
        const lotResult = await getOrCreateStockLot(lotNo, g.productId, companyId, referansSatir.barkod, referansSatir.utsKodu || undefined);
        await applyStockAdjustmentForLot({ productId: g.productId, locationCode: LOKASYON_KODU, lotId: lotResult.lotId, qty: 1 });
      }
      eksikTamamlanan++;
    } catch (e: unknown) {
      console.log(`  Eksik tamamlama HATA productId ${g.productId}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Eksik tamamlanan ürün: ${eksikTamamlanan}/${gercekEksik.length}`);

  console.log('\nBitti. Doğrulamak için: npm run gvnp-stok-mutabakat');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
