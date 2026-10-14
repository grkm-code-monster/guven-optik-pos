/**
 * ALYSON SASSO OPTİK ÇERÇEVE (#11800) — MSSP8307MO/C63/51 varyantı açılırken
 * tam ALLIGATOR (#1984) olayındaki (bkz. alligator-32432-yeniden-aktif.ts)
 * AYNI hata: "duplicate key value violates unique constraint
 * product_product_combination_unique — Key (product_tmpl_id,
 * combination_indices)=(11800, 988,989,990,3801,4018,4024) already exists."
 *
 * Kök neden AYNI: bu nitelik kombinasyonu şablon #11800'de ZATEN VAR ama
 * ARŞİVLİ (active=false) — Postgres'in UNIQUE kısıtlaması arşivli kayıtları
 * da saydığı için Odoo aynı kombinasyonla yeni bir aktif varyant açamıyor,
 * "_unlink_or_archive" içinde patlıyor.
 *
 * Script önceki çalıştırmada "güvenlik ağı"nın (izole şablon fallback)
 * YANLIŞ YERDE (ayrı bir alt şablonda) oluşturduğu #37993 varyantını da
 * tespit edip, --execute ile temizler (arşivler) — gerçek kombinasyon ana
 * şablonda yeniden aktif edildiğinde, POS/katalogda ÇİFT/YANLIŞ kayıt
 * kalmasın.
 *
 * Kullanım:
 *   npm run alyson-sasso-kombinasyon-coz
 *   npm run alyson-sasso-kombinasyon-coz -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = 11800;
// Hata mesajındaki combination_indices — bunlar product.template.attribute.value ID'leri.
const HEDEF_PTAV_IDS = [988, 989, 990, 3801, 4018, 4024];
const YANLIS_IZOLE_VARYANT_ID = 37993;
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const tumVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'active', 'barcode', 'product_template_attribute_value_ids'], limit: 5000, context: { active_test: false } },
  )) as { id: number; active: boolean; barcode: string | false; product_template_attribute_value_ids: number[] }[];

  const hedefKey = [...HEDEF_PTAV_IDS].sort((a, b) => a - b).join(',');
  const esleseen = tumVaryantlar.find(
    (v) => [...v.product_template_attribute_value_ids].sort((a, b) => a - b).join(',') === hedefKey,
  );

  if (!esleseen) {
    console.log(`#${TEMPLATE_ID} şablonunda bu kombinasyonla (PTAV: ${HEDEF_PTAV_IDS.join(',')}) eşleşen varyant bulunamadı.`);
    console.log('Toplam varyant sayısı (aktif+arşivli):', tumVaryantlar.length);
    return;
  }

  const ptavlar = (await execute(
    'product.template.attribute.value', 'read',
    [esleseen.product_template_attribute_value_ids],
    { fields: ['id', 'name', 'attribute_id'] },
  )) as { id: number; name: string; attribute_id: [number, string] }[];

  console.log(`Çakışan varyant bulundu: #${esleseen.id} — aktif: ${esleseen.active} — barkod: ${esleseen.barcode || '-'}`);
  console.log('Nitelik kombinasyonu:');
  for (const p of ptavlar) console.log(`  ${p.attribute_id[1]}: ${p.name}`);

  const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', esleseen.id]]]);
  const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', esleseen.id]]]);
  console.log(`\nsale.order.line=${sale} stock.quant=${quant}`);

  // Önceki çalıştırmada yanlış izole şablona açılmış varyantı da göster.
  const [izoleVaryant] = (await execute(
    'product.product', 'read', [[YANLIS_IZOLE_VARYANT_ID]],
    { fields: ['id', 'active', 'product_tmpl_id', 'display_name'], context: { active_test: false } },
  ).catch(() => [null])) as ({ id: number; active: boolean; product_tmpl_id: [number, string]; display_name: string } | null)[];

  if (izoleVaryant) {
    console.log(`\nÖnceki (yanlış) izole şablon varyantı: #${izoleVaryant.id} — "${izoleVaryant.display_name}" — şablon #${izoleVaryant.product_tmpl_id[0]} "${izoleVaryant.product_tmpl_id[1]}" — aktif: ${izoleVaryant.active}`);
  }

  if (esleseen.active) {
    console.log('\nÇakışan varyant zaten AKTİF — bu yüzden farklı bir sorun olabilir, elle kontrol edin.');
    return;
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN — --execute ile yapılacaklar:');
    console.log(`  1) Varyant #${esleseen.id} active=true yapılacak (YENİDEN AKTİF EDİLECEK, yeni kayıt oluşturulmayacak).`);
    if (izoleVaryant && izoleVaryant.active) {
      console.log(`  2) Yanlış izole şablon varyantı #${izoleVaryant.id} arşivlenecek (active=false) — katalogda çift kayıt kalmasın.`);
    }
    console.log('\nNitelik kombinasyonunun MSSP8307MO / C63 / 51 olduğunu yukarıdan DOĞRULAYIN, sonra:');
    console.log('  npm run alyson-sasso-kombinasyon-coz -- --execute');
    return;
  }

  await execute('product.product', 'write', [[esleseen.id], { active: true }]);
  console.log(`\n✓ Varyant #${esleseen.id} yeniden aktif edildi.`);

  if (izoleVaryant && izoleVaryant.active) {
    await execute('product.product', 'write', [[izoleVaryant.id], { active: false }]);
    console.log(`✓ Yanlış izole şablon varyantı #${izoleVaryant.id} arşivlendi.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
