/**
 * TEŞHİS (salt-okunur, HİÇBİR ŞEYİ DEĞİŞTİRMEZ) — ALYSON SASSO OPTİK ÇERÇEVE
 * (#11800) şablonundaki TÜM nitelik (attribute) satırlarını, modlarını
 * (always/dynamic/no_variant) ve değerlerini listeler.
 *
 * Amaç: kombinasyon çakışmasının kök nedenini görmek. Önceki teşhiste
 * (alyson-sasso-kombinasyon-coz.ts), bu şablonda MSSP8307MO/C63/51 ile hiç
 * ilgisi olmayan bir kombinasyon (MODEL: 8117AO, RENK: C13, ÖLÇÜ: 52 +
 * MODEL(Çoklu): ALYTT012AO, RENK(Çoklu): C101, ÖLÇÜ(Çoklu): 51 — 6 nitelik
 * değeri BİRDEN) bulundu. Bu, şablonda ESKİ (always modda) MODEL/RENK/ÖLÇÜ
 * satırlarının, YENİ "Çoklu" (dynamic) satırlarla BİRLİKTE var olduğuna ve
 * Odoo'nun ikisini çarparak (cartesian) anlamsız ghost kombinasyonlar
 * ürettiğine işaret ediyor.
 *
 * Kullanım:
 *   npm run alyson-sasso-nitelik-teshis
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = 11800;

async function main() {
  const lines = (await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'attribute_id', 'value_ids'], context: { active_test: false } },
  )) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

  console.log(`Şablon #${TEMPLATE_ID} — toplam nitelik satırı: ${lines.length}\n`);

  const attrIds = lines.map((l) => l.attribute_id[0]);
  const attrDetails = (await execute(
    'product.attribute', 'read', [attrIds],
    { fields: ['id', 'name', 'create_variant'] },
  )) as { id: number; name: string; create_variant: string }[];
  const attrById = new Map(attrDetails.map((a) => [a.id, a]));

  for (const line of lines) {
    const attr = attrById.get(line.attribute_id[0]);
    const degerler = (await execute(
      'product.attribute.value', 'read', [line.value_ids],
      { fields: ['id', 'name'] },
    )) as { id: number; name: string }[];
    console.log(`• Nitelik: "${line.attribute_id[1]}" (id=${line.attribute_id[0]}) — mod: ${attr?.create_variant ?? '?'}`);
    console.log(`  Değerler (${degerler.length}): ${degerler.map((d) => d.name).join(', ')}`);
    console.log('');
  }

  // Şu an kaç varyant var (aktif + arşivli) ve kaçı anormal (3'ten fazla nitelik değeri taşıyan)?
  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'active', 'product_template_attribute_value_ids'], limit: 5000, context: { active_test: false } },
  )) as { id: number; active: boolean; product_template_attribute_value_ids: number[] }[];

  const aktif = variants.filter((v) => v.active).length;
  const arsivli = variants.length - aktif;
  const anormal = variants.filter((v) => v.product_template_attribute_value_ids.length !== 3);

  console.log(`Toplam varyant: ${variants.length} (aktif: ${aktif}, arşivli: ${arsivli})`);
  console.log(`3 nitelik değeri DIŞINDA (anormal — eski+yeni karışık) varyant sayısı: ${anormal.length}`);
  if (anormal.length > 0 && anormal.length <= 20) {
    for (const v of anormal) {
      console.log(`  - varyant #${v.id} (aktif: ${v.active}) — ${v.product_template_attribute_value_ids.length} nitelik değeri: [${v.product_template_attribute_value_ids.join(',')}]`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
