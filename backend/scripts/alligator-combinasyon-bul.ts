/**
 * Odoo'nun verdiği hata: duplicate key (product_tmpl_id, combination_indices)
 * = (1984, 546,547,548,3819,3951,3956) already exists. Bu script, şablon
 * #1984'ün TÜM varyantlarını (aktif+arşivli) tarayıp hangisinin TAM OLARAK
 * bu PTAV id setine (546,547,548,3819,3951,3956) sahip olduğunu bulur.
 * SALT OKUNUR.
 *
 * Kullanım:
 *   npm run alligator-combinasyon-bul
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = 1984;
const HEDEF_SET = new Set([546, 547, 548, 3819, 3951, 3956]);

async function main() {
  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'active', 'barcode', 'product_template_attribute_value_ids'], context: { active_test: false }, limit: 500 },
  )) as { id: number; active: boolean; barcode: string | false; product_template_attribute_value_ids: number[] }[];

  console.log(`Toplam varyant: ${variants.length}\n`);

  // Önce tüm PTAV id'lerin isimlerini toplu okuyalım (debug için faydalı).
  const hedefPtavlar = (await execute(
    'product.template.attribute.value', 'read',
    [[...HEDEF_SET]],
    { fields: ['id', 'name', 'attribute_id'], context: { active_test: false } },
  )) as { id: number; name: string; attribute_id: [number, string] }[];
  console.log('Hedef PTAV id\'lerinin karşılığı:');
  for (const p of hedefPtavlar) console.log(`  #${p.id} — ${p.attribute_id[1]}: ${p.name}`);
  console.log('');

  let bulundu = false;
  for (const v of variants) {
    const set = new Set(v.product_template_attribute_value_ids ?? []);
    const esit = set.size === HEDEF_SET.size && [...HEDEF_SET].every((x) => set.has(x));
    const kesisim = [...HEDEF_SET].filter((x) => set.has(x)).length;
    if (esit) {
      bulundu = true;
      console.log(`✓ TAM EŞLEŞME: Varyant #${v.id} — aktif: ${v.active} — barkod: ${v.barcode || '-'} — PTAVs: ${[...set].join(',')}`);
    } else if (kesisim >= 3) {
      console.log(`  (kısmi, ${kesisim}/6 ortak) Varyant #${v.id} — aktif: ${v.active} — PTAVs: ${[...set].join(',')}`);
    }
  }
  if (!bulundu) console.log('Tam eşleşen AKTİF/ARŞİVLİ varyant bulunamadı (başka bir şablonda olabilir mi diye de kontrol edilebilir).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
