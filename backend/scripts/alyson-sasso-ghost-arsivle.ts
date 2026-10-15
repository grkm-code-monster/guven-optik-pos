/**
 * ALYSON SASSO OPTİK ÇERÇEVE (#11800) — alyson-sasso-ghost-tespit.ts ile
 * doğrulanan, GÜVENLİ olduğu kanıtlanmış hayalet varyantları arşivler.
 *
 * Güvenlik kriteri (hepsi aynı anda sağlanmalı): aynı GERÇEK (dinamik-only:
 * eski MODEL/RENK/ÖLÇÜ hariç) kombinasyonu taşıyan bir grup içinde,
 *   - 6 nitelik değerli (eski+yeni karışık) olan,
 *   - sale.order.line=0 VE stock.quant=0 (hiç satılmamış, hiç stok hareketi yok),
 *   - VE aynı grupta 3 nitelik değerli (temiz, sadece yeni Çoklu) bir TWİN'i var.
 * Bu kritere uymayan hiçbir kayda DOKUNULMAZ — özellikle [3799,3800,3801]
 * grubundaki #25451/#32423 çifti (her ikisi de 6 değerli VE satış geçmişi
 * olduğu için) bu script tarafından ASLA işlenmez, elle/ayrıca ele alınacak.
 *
 * Kullanım:
 *   npm run alyson-sasso-ghost-arsivle
 *   npm run alyson-sasso-ghost-arsivle -- --execute
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
    { fields: ['id'] },
  )) as { id: number }[];
  const eskiAttrIds = eskiNitelikler.map((n) => n.id);

  const eskiPtavlar = (await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID], ['attribute_id', 'in', eskiAttrIds]]],
    { fields: ['id'], context: { active_test: false } },
  )) as { id: number }[];
  const eskiPtavIdSet = new Set(eskiPtavlar.map((p) => p.id));

  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'active', 'product_template_attribute_value_ids'], limit: 5000, context: { active_test: false } },
  )) as { id: number; active: boolean; product_template_attribute_value_ids: number[] }[];

  const grupByDinamikKey = new Map<string, typeof variants>();
  for (const v of variants) {
    const dinamikPtavlar = v.product_template_attribute_value_ids.filter((id) => !eskiPtavIdSet.has(id));
    const key = [...dinamikPtavlar].sort((a, b) => a - b).join(',');
    if (!grupByDinamikKey.has(key)) grupByDinamikKey.set(key, []);
    grupByDinamikKey.get(key)!.push(v);
  }

  const arsivlenecek: number[] = [];

  for (const [key, grup] of grupByDinamikKey) {
    if (grup.length <= 1) continue;
    const temizler = grup.filter((v) => v.product_template_attribute_value_ids.length === 3);
    const hayaletler = grup.filter((v) => v.product_template_attribute_value_ids.length === 6);
    if (temizler.length !== 1 || hayaletler.length === 0) continue; // sadece "1 temiz + N hayalet" deseni

    for (const h of hayaletler) {
      const sale = await execute('sale.order.line', 'search_count', [[['product_id', '=', h.id]]]);
      const quant = await execute('stock.quant', 'search_count', [[['product_id', '=', h.id]]]);
      if (sale === 0 && quant === 0) {
        console.log(`[${key}] Hayalet varyant #${h.id} (aktif: ${h.active}) → güvenli, temiz twin: #${temizler[0].id}. Arşivlenecek.`);
        arsivlenecek.push(h.id);
      } else {
        console.log(`[${key}] Hayalet varyant #${h.id} satış/stok geçmişine SAHİP (satış=${sale}, stok=${quant}) — DOKUNULMUYOR, elle kontrol edin.`);
      }
    }
  }

  if (arsivlenecek.length === 0) {
    console.log('\nArşivlenecek güvenli hayalet varyant bulunamadı.');
    return;
  }

  console.log(`\nToplam ${arsivlenecek.length} hayalet varyant arşivlenecek: #${arsivlenecek.join(', #')}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — gerçek çalıştırma için: npm run alyson-sasso-ghost-arsivle -- --execute');
    return;
  }

  for (const id of arsivlenecek) {
    await execute('product.product', 'write', [[id], { active: false }]);
    console.log(`  ✓ varyant #${id} arşivlendi.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
