/**
 * KÖK NEDEN DÜZELTMESİ — ALYSON SASSO OPTİK ÇERÇEVE (#11800) şablonunda,
 * yeni "Çoklu" (dynamic) MODEL/RENK/ÖLÇÜ nitelik satırlarıyla BİRLİKTE, ESKİ
 * global MODEL/RENK/ÖLÇÜ nitelikleri "always" modda, TEK değerli (8117AO/
 * C13/52) olarak hâlâ bu şablona bağlıydı (bkz. alyson-sasso-nitelik-teshis.ts
 * çıktısı). Bu, her gerçek varyanta otomatik olarak aynı (988,989,990) PTAV
 * üçlüsünü ekleyip, Odoo'nun _create_variant_ids iç hesaplamasını (always
 * modun cartesian recompute'u) tetikleyerek yeni model/renk/ölçü eklenirken
 * "duplicate key ... combination_indices" ile patlamasına sebep oluyordu.
 *
 * Bu script SADECE şablon #11800'ün kendi product.template.attribute.line
 * satırlarını (MODEL/RENK/ÖLÇÜ — id 1/2/3) kaldırır. Global MODEL/RENK/ÖLÇÜ
 * niteliklerine (onlarca BAŞKA şablonda gerçek varyantlarla kullanılıyor) ya
 * da başka hiçbir şablona DOKUNMAZ. Her varyantta bu değer TEK ve SABİT
 * olduğu için (hepsinde aynı 8117AO/C13/52), satırı kaldırmak hiçbir
 * kombinasyonu çakıştırmaz — sadece 26 varyantı 6 nitelik değerinden 3'e
 * indirir (gerçek MODEL(Çoklu)/RENK(Çoklu)/ÖLÇÜ(Çoklu) değerleri kalır).
 *
 * Kullanım:
 *   npm run alyson-sasso-eski-nitelik-temizle
 *   npm run alyson-sasso-eski-nitelik-temizle -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = 11800;
const ESKI_NITELIK_ADLARI = ['MODEL', 'RENK', 'ÖLÇÜ'];
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const eskiNitelikler = (await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ESKI_NITELIK_ADLARI]]],
    { fields: ['id', 'name'] },
  )) as { id: number; name: string }[];
  const eskiAttrIds = eskiNitelikler.map((n) => n.id);

  const lines = (await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID], ['attribute_id', 'in', eskiAttrIds]]],
    { fields: ['id', 'attribute_id', 'value_ids'], context: { active_test: false } },
  )) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

  if (lines.length === 0) {
    console.log(`Şablon #${TEMPLATE_ID}'de eski MODEL/RENK/ÖLÇÜ nitelik satırı bulunamadı — zaten temiz.`);
    return;
  }

  console.log(`Kaldırılacak eski nitelik satırları (şablon #${TEMPLATE_ID}):`);
  for (const l of lines) console.log(`  • satır #${l.id} — "${l.attribute_id[1]}" (${l.value_ids.length} değer)`);

  // Güvenlik kontrolü: her satırda TEK değer olduğunu doğrula (varsayım buydu).
  const cokDegerli = lines.filter((l) => l.value_ids.length !== 1);
  if (cokDegerli.length > 0) {
    console.log('\n⚠️  UYARI: beklenenden farklı — bazı satırlarda birden fazla değer var. Elle kontrol edilmeden devam etmiyorum.');
    return;
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN — gerçek çalıştırma için: npm run alyson-sasso-eski-nitelik-temizle -- --execute');
    return;
  }

  for (const l of lines) {
    await execute('product.template.attribute.line', 'unlink', [[l.id]]);
    console.log(`  ✓ satır #${l.id} ("${l.attribute_id[1]}") kaldırıldı.`);
  }

  const kalanVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000, context: { active_test: false } },
  )) as { id: number; product_template_attribute_value_ids: number[] }[];
  const halaAnormal = kalanVaryantlar.filter((v) => v.product_template_attribute_value_ids.length !== 3);
  console.log(`\nTemizlik sonrası hâlâ anormal (3 değer dışında) varyant sayısı: ${halaAnormal.length} (0 bekleniyordu).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
