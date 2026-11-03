/**
 * 02.11.2026 — Yanlış numaraya (yanlış cam ürününe) girilmiş TEK BİR cam
 * birimini, UTS kodundan bulup doğru cam ürününe taşır.
 *
 * Örnek: CLEX 08680286015794 (UTS ...2118811511220624101) GVN2'ye
 * "Org Et 1.56 0250 -0050" olarak girilmiş; kutu "+3,25 -1,00" diyor.
 *
 * VARSAYILAN KURU ÇALIŞMA: sadece ne yapılacağını yazar. --confirm ile uygular.
 *
 * Uygulama adımları (aynı lokasyonda):
 *   1) Eski ürünün bu lottaki stoğu sayımla 0'a çekilir.
 *   2) Eski lotun x_uts_kodu / ref alanlarının başına "DELETE_" eklenir
 *      (UTS mükerrer kontrolüne takılmasın, iz kalsın).
 *   3) Doğru ürüne AYNI lot adı, ref, UTS ile yeni lot açılır, stok 1 yapılır.
 *   4) Doğru ürünün satış fiyatı 0 ise eski ürünün satış/maliyet fiyatı kopyalanır.
 *   Adım 3'te hata olursa eski stok ve lot alanları geri yüklenir.
 *
 * Kullanım:
 *   npx ts-node --transpile-only scripts/cam-lot-urun-degistir.ts \
 *     --uts=01086802860157942118811511220624101 --hedef="Org Et 1.56 0325 -0100" \
 *     [--hedef-id=<aynı adlı birden fazla ürün varsa>] [--tedarikci="CLEX CLEAR VISION 1,56 HMC +3.25-1.00 SUDE OPTİK"] [--confirm]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { LOKASYON_ID_MAP, getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';
import { applyStockAdjustment, applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { getOrCreateStockLot } from '../src/modules/admin/stock-lot.service';

function arg(ad: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return p ? p.slice(ad.length + 3) : undefined;
}

async function main() {
  const uts = (arg('uts') ?? '').trim();
  const hedef = (arg('hedef') ?? '').trim();
  const tedarikci = arg('tedarikci')?.trim();
  const uygula = process.argv.includes('--confirm');
  if (!uts || !hedef) throw new Error('--uts ve --hedef zorunlu');

  const lots = await execute('stock.lot', 'search_read', [[['x_uts_kodu', '=', uts]]], {
    fields: ['id', 'name', 'ref', 'x_uts_kodu', 'x_tedarikci_urun_adi', 'product_id', 'company_id'],
  }) as any[];
  if (lots.length !== 1) throw new Error(`Bu UTS ile ${lots.length} lot bulundu (1 olmalı)`);
  const lot = lots[0];
  const companyId = lot.company_id ? lot.company_id[0] : undefined;
  const eskiUrunId = lot.product_id[0];

  const quants = (await execute('stock.quant', 'search_read',
    [[['lot_id', '=', lot.id], ['quantity', '>', 0], ['location_id.usage', '=', 'internal']]],
    { fields: ['id', 'quantity', 'location_id', 'product_id'] }, companyId)) as any[];
  if (quants.length !== 1 || Number(quants[0].quantity) !== 1) {
    throw new Error(`Lotun stoğu beklenen gibi değil: ${JSON.stringify(quants.map((q) => [q.location_id?.[1], q.quantity]))}`);
  }
  const q = quants[0];
  const lokasyonKodu = Object.keys(LOKASYON_ID_MAP).find((k) => LOKASYON_ID_MAP[k] === q.location_id[0]);
  if (!lokasyonKodu) throw new Error(`Lokasyon kodu bulunamadı: ${q.location_id[1]}`);
  if (getCompanyIdFromLokasyon(lokasyonKodu) !== companyId) throw new Error('Lot şirketi ile lokasyon şirketi farklı');

  const hedefId = Number(arg('hedef-id') ?? 0);
  const hedefler = (await execute('product.product', 'search_read', [[['name', '=', hedef]]], {
    fields: ['id', 'display_name', 'tracking', 'type', 'list_price', 'standard_price', 'categ_id', 'product_tmpl_id', 'qty_available', 'barcode'],
  }, companyId)) as any[];
  if (hedefler.length !== 1 && !hedefId) {
    console.log(`"${hedef}" adıyla ${hedefler.length} ürün var:`);
    for (const h of hedefler) console.log(`  ürün #${h.id}  şablon #${h.product_tmpl_id?.[0]}  tip=${h.type}  takip=${h.tracking}  stok=${h.qty_available}  satış=${h.list_price}  barkod=${h.barcode || '-'}  ${h.categ_id?.[1]}`);
    throw new Error('Doğru olanı --hedef-id=<ürün no> ile belirtin');
  }
  const hedefUrun = hedefId ? hedefler.find((h) => h.id === hedefId) : hedefler[0];
  if (!hedefUrun) throw new Error(`--hedef-id=${hedefId} bu adla eşleşmiyor`);
  if (hedefUrun.id === eskiUrunId) throw new Error('Lot zaten hedef üründe');
  const eski = ((await execute('product.product', 'read', [[eskiUrunId]], {
    fields: ['id', 'display_name', 'tracking', 'list_price', 'standard_price'],
  }, companyId)) as any[])[0];
  if (eski.tracking !== hedefUrun.tracking) throw new Error(`Takip tipi farklı: ${eski.tracking} / ${hedefUrun.tracking}`);
  const cakisan = await execute('stock.lot', 'search_count',
    [[['name', '=', lot.name], ['product_id', '=', hedefUrun.id]]], {}, companyId);
  if (Number(cakisan) > 0) throw new Error(`Hedef üründe "${lot.name}" adlı lot zaten var`);

  console.log('PLAN');
  console.log(`  Lot        : #${lot.id} ${lot.name}  ref=${lot.ref}  uts=${lot.x_uts_kodu}`);
  console.log(`  Lokasyon   : ${lokasyonKodu} (${q.location_id[1]})`);
  console.log(`  Eski ürün  : #${eski.id} ${eski.display_name}  satış=${eski.list_price} maliyet=${eski.standard_price}`);
  console.log(`  Yeni ürün  : #${hedefUrun.id} ${hedefUrun.display_name}  satış=${hedefUrun.list_price} maliyet=${hedefUrun.standard_price}`);
  console.log(`  Tedarikçi  : ${lot.x_tedarikci_urun_adi || '-'}  ->  ${tedarikci ?? lot.x_tedarikci_urun_adi ?? '-'}`);
  if (!uygula) { console.log('\nKURU ÇALIŞMA — hiçbir şey değişmedi. Uygulamak için --confirm ekleyin.'); return; }

  await applyStockAdjustment({ productId: eskiUrunId, locationCode: lokasyonKodu, qty: 0, quantId: q.id });
  await execute('stock.lot', 'write', [[lot.id], {
    x_uts_kodu: `DELETE_${lot.x_uts_kodu}`, ...(lot.ref ? { ref: `DELETE_${lot.ref}` } : {}),
  }], {}, companyId);
  try {
    const { lotId } = await getOrCreateStockLot(lot.name, hedefUrun.id, companyId, lot.ref || undefined, uts);
    const ted = tedarikci ?? lot.x_tedarikci_urun_adi;
    if (ted) await execute('stock.lot', 'write', [[lotId], { x_tedarikci_urun_adi: ted }], {}, companyId);
    await applyStockAdjustmentForLot({ productId: hedefUrun.id, locationCode: lokasyonKodu, lotId, qty: 1 });
    if (!hedefUrun.list_price) {
      await execute('product.product', 'write', [[hedefUrun.id], { list_price: eski.list_price, standard_price: eski.standard_price }], {}, companyId);
      console.log('  Hedef ürünün fiyatı 0 idi, eski üründen kopyalandı.');
    }
    console.log(`\nTAMAM — yeni lot #${lotId}, ${hedefUrun.display_name} stoğu ${lokasyonKodu}'de 1.`);
  } catch (e) {
    console.error('HATA, geri alınıyor:', e instanceof Error ? e.message : e);
    await execute('stock.lot', 'write', [[lot.id], { x_uts_kodu: lot.x_uts_kodu, ref: lot.ref || false }], {}, companyId);
    await applyStockAdjustment({ productId: eskiUrunId, locationCode: lokasyonKodu, qty: 1, quantId: q.id });
    throw e;
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
