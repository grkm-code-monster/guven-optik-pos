/**
 * Varyantlı ürün ortalama fiyat testleri
 * npx ts-node --transpile-only backend/scripts/test-varyantli-ortalama-fiyat.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { getStokUrunRowsByIds } from '../src/modules/admin/stok-yonetimi.service';
import { resolveTemplateVariantAverages } from '../src/modules/odoo/odoo-standard-price.util';
import { exportStokUrunleri } from '../src/modules/admin/stok-export.service';

const TMPL_ID = 1950; // OPTELLİ
const VARIANT_IDS = [5621, 5623, 5626];
const ctx = { context: { active_test: false } };

async function readVariants() {
  return execute('product.product', 'read', [VARIANT_IDS], {
    fields: ['id', 'lst_price', 'standard_price'],
    ...ctx,
  }) as Array<{ id: number; lst_price: number; standard_price: number }>;
}

async function main() {
  console.log('=== TEST 1: Aynı fiyat (2800/2800/2800) regresyon ===');
  for (const id of VARIANT_IDS) {
    await execute('product.product', 'write', [[id], { lst_price: 2800, standard_price: 700 }], ctx);
  }
  const avg1 = await resolveTemplateVariantAverages([TMPL_ID]);
  const row1 = (await getStokUrunRowsByIds([TMPL_ID]))[0];
  console.log('  Ortalama:', avg1.get(TMPL_ID));
  console.log('  Şablon satırı:', row1?.satisFiyati, row1?.alisFiyati);
  console.log('  Beklenen 2800/700:', row1?.satisFiyati === 2800 && row1?.alisFiyati === 700 ? 'OK' : 'HATA');

  console.log('\n=== TEST 2: Farklı satış (2800/2300/2800) → 2633,33 ===');
  // Odoo'da varyant satış farkı price_extra ile yansır
  const v5623 = await execute('product.product', 'read', [[5623]], {
    fields: ['product_template_attribute_value_ids'],
    ...ctx,
  }) as Array<{ product_template_attribute_value_ids: number[] }>;
  const modelPtav5623 = v5623[0]?.product_template_attribute_value_ids?.[0];
  if (modelPtav5623) {
    await execute('product.template.attribute.value', 'write', [[modelPtav5623], { price_extra: -500 }], ctx);
  }
  const row2 = (await getStokUrunRowsByIds([TMPL_ID]))[0];
  const bekSatis = Math.round(((2800 + 2300 + 2800) / 3) * 100) / 100;
  console.log('  Şablon satış:', row2?.satisFiyati, 'beklenen', bekSatis, row2?.satisFiyati === bekSatis ? 'OK' : 'HATA');
  if (modelPtav5623) {
    await execute('product.template.attribute.value', 'write', [[modelPtav5623], { price_extra: 0 }], ctx);
  }

  console.log('\n=== TEST 3: Farklı maliyet (700/650/700) → 683,33 ===');
  await execute('product.product', 'write', [[5621], { standard_price: 700 }], ctx);
  await execute('product.product', 'write', [[5623], { standard_price: 650 }], ctx);
  await execute('product.product', 'write', [[5626], { standard_price: 700 }], ctx);
  const row3 = (await getStokUrunRowsByIds([TMPL_ID]))[0];
  const bekMaliyet = Math.round(((700 + 650 + 700) / 3) * 100) / 100;
  console.log('  Şablon alış:', row3?.alisFiyati, 'beklenen', bekMaliyet, row3?.alisFiyati === bekMaliyet ? 'OK' : 'HATA');

  console.log('\n=== TEST 4: Tek varyantlı ürün değişmedi ===');
  const tek = await execute('product.template', 'search_read', [[['product_variant_count', '=', 1], ['active', '=', true]]], {
    fields: ['id', 'list_price', 'product_variant_count'],
    limit: 1,
  }) as Array<{ id: number; list_price: number }>;
  const tekId = tek[0]?.id;
  if (tekId) {
    const before = Number(tek[0].list_price) || 0;
    const tekRow = (await getStokUrunRowsByIds([tekId]))[0];
    console.log('  Tek varyant tmpl', tekId, 'satis', tekRow?.satisFiyati, 'template list_price', before, tekRow?.satisFiyati === before ? 'OK' : 'HATA');
  }

  console.log('\n=== TEST 5: Dışa aktarma ortalama ===');
  if (modelPtav5623) {
    await execute('product.template.attribute.value', 'write', [[modelPtav5623], { price_extra: -500 }], ctx);
  }
  const csv = (await exportStokUrunleri([TMPL_ID], 'csv')).toString('utf-8');
  console.log('  CSV satış içeriyor mu 2633', csv.includes('2633,33') || csv.includes('2.633,33') ? 'OK' : 'HATA');
  if (modelPtav5623) {
    await execute('product.template.attribute.value', 'write', [[modelPtav5623], { price_extra: 0 }], ctx);
  }
  await execute('product.product', 'write', [[5623], { standard_price: 650 }], ctx);
  const csv2 = (await exportStokUrunleri([TMPL_ID], 'csv')).toString('utf-8');
  console.log('  CSV maliyet içeriyor mu 683', csv2.includes('683') ? 'OK' : 'HATA');

  console.log('\n=== Temizlik: fiyatları 2800/700 geri yükle ===');
  for (const id of VARIANT_IDS) {
    await execute('product.product', 'write', [[id], { lst_price: 2800, standard_price: 700 }], ctx);
  }
  console.log('Varyantlar:', await readVariants());
  console.log('\n=== Bitti ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
