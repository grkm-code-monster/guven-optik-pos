/**
 * TEŞHİS (salt-okunur, HİÇBİR ŞEYİ DEĞİŞTİRMEZ) — ALYSON SASSO OPTİK ÇERÇEVE
 * (#11800) şablonunda, "anormal" (6 nitelik değerli — eski MODEL/RENK/ÖLÇÜ +
 * yeni Çoklu MODEL/RENK/ÖLÇÜ) varyantların, eski değer (988/989/990) silinip
 * sadece gerçek 3 Çoklu değer bırakıldığında, ZATEN VAR OLAN "normal" (3
 * değerli) bir varyantla birebir aynı kimliğe düşüp düşmediğini kontrol eder.
 *
 * Önceki adımda (alyson-sasso-eski-nitelik-temizle -- --execute) eski MODEL
 * satırını kaldırmaya çalışınca Odoo "duplicate key ... (989,990,3801,4018,4024)
 * already exists" hatası verdi — bu script bu hipotezi (6 değerli = 3 değerli
 * gerçek varyantın HAYALET KOPYASI) doğrulamak için yazıldı. Doğrulanırsa,
 * gerçek düzeltme: önce bu 6-değerli hayalet kopyaları arşivlemek, SONRA eski
 * nitelik satırlarını (artık hiçbir varyant kullanmıyorken) güvenle kaldırmak.
 *
 * Kullanım:
 *   npm run alyson-sasso-ghost-tespit
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = 11800;
const ESKI_NITELIK_ADLARI = ['MODEL', 'RENK', 'ÖLÇÜ'];

async function main() {
  const eskiNitelikler = (await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ESKI_NITELIK_ADLARI]]],
    { fields: ['id', 'name'] },
  )) as { id: number; name: string }[];
  const eskiAttrIds = eskiNitelikler.map((n) => n.id);

  const eskiLines = (await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID], ['attribute_id', 'in', eskiAttrIds]]],
    { fields: ['id', 'value_ids'], context: { active_test: false } },
  )) as { id: number; value_ids: number[] }[];

  // Bu satırların PTAV (product.template.attribute.value) id'lerini bul —
  // combination_indices'teki 988/989/990 bunlar.
  const eskiPtavlar = (await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID], ['attribute_id', 'in', eskiAttrIds]]],
    { fields: ['id'], context: { active_test: false } },
  )) as { id: number }[];
  const eskiPtavIdSet = new Set(eskiPtavlar.map((p) => p.id));
  console.log(`Eski (always) nitelik PTAV id'leri: ${[...eskiPtavIdSet].join(',')}\n`);

  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'active', 'barcode', 'product_template_attribute_value_ids'], limit: 5000, context: { active_test: false } },
  )) as { id: number; active: boolean; barcode: string | false; product_template_attribute_value_ids: number[] }[];

  const grupByDinamikKey = new Map<string, typeof variants>();
  for (const v of variants) {
    const dinamikPtavlar = v.product_template_attribute_value_ids.filter((id) => !eskiPtavIdSet.has(id));
    const key = [...dinamikPtavlar].sort((a, b) => a - b).join(',');
    if (!grupByDinamikKey.has(key)) grupByDinamikKey.set(key, []);
    grupByDinamikKey.get(key)!.push(v);
  }

  console.log(`Toplam varyant: ${variants.length}, benzersiz GERÇEK (dinamik-only) kombinasyon: ${grupByDinamikKey.size}\n`);

  let cakisanGrupSayisi = 0;
  for (const [key, grup] of grupByDinamikKey) {
    if (grup.length <= 1) continue;
    cakisanGrupSayisi++;
    console.log(`ÇAKIŞMA — dinamik kombinasyon [${key}] için ${grup.length} varyant kaydı var:`);
    for (const v of grup) {
      const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', v.id]]]);
      const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', v.id]]]);
      console.log(`  • varyant #${v.id} — aktif: ${v.active} — barkod: ${v.barcode || '-'} — toplam PTAV: ${v.product_template_attribute_value_ids.length} — satış: ${sale} — stok hareketi: ${quant}`);
    }
    console.log('');
  }

  if (cakisanGrupSayisi === 0) {
    console.log('Hiçbir çakışma bulunamadı — hipotez DOĞRULANMADI, kök neden başka bir şey olabilir.');
  } else {
    console.log(`TOPLAM ${cakisanGrupSayisi} çakışan grup bulundu — hipotez DOĞRULANDI: bazı "6 değerli" varyantlar, "3 değerli" gerçek varyantların eski-nitelikli hayalet kopyaları.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
