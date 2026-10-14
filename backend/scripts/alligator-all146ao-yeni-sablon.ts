/**
 * ACİL ÇÖZÜM — şablon #1984 (ALLIGATOR OPTİK ÇERÇEVE) iç durumu bozuk
 * (Odoo "_create_variant_ids" her attribute satırı yazımında mevcut bir
 * aktif varyantla ["duplicate key ... combination_indices"] çakışıyor,
 * kök neden derinlemesine Odoo içi bir tutarsızlık — bkz. önceki teşhis
 * scriptleri). O şablona DOKUNMADAN, bu kod tabanında zaten yıllardır
 * kullanılan "model başına ayrı küçük şablon" yöntemiyle (bkz. OTTO/
 * MUSTANG ürünleri, odoo-varyant-import.service.ts importVaryantlarSplitByModel)
 * YENİ, TEMİZ bir şablon açıp ALL146AO modelini oraya yazıyoruz:
 *
 *   "ALLIGATOR OPTİK ÇERÇEVE ALL146AO"  (yeni, 0'dan temiz şablon)
 *     RENK: C4, C112 (eski/global RENK niteliği, always modda)
 *     ÖLÇÜ: 50
 *
 * Bu şablon #1984'ün hiçbir satırına dokunmaz, tamamen izole.
 *
 * Kullanım:
 *   npm run alligator-all146ao-yeni-sablon
 *   npm run alligator-all146ao-yeni-sablon -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { ptavKey } from '../src/modules/admin/varyant-import-temizlik.service';

const ANA_SABLON_ID = 1984;
const MODEL = 'ALL146AO';
const RENKLER = ['C4', 'C112'];
const OLCU = '50';
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [anaSablon] = (await execute(
    'product.template', 'read', [[ANA_SABLON_ID]],
    { fields: ['name', 'categ_id', 'taxes_id'] },
  )) as { name: string; categ_id: [number, string] | false; taxes_id: number[] }[];
  if (!anaSablon) throw new Error('Ana şablon bulunamadı');

  const yeniAd = `${anaSablon.name.trim()} ${MODEL}`;
  console.log(`Hedef yeni şablon adı: "${yeniAd}"`);

  const mevcut = (await execute(
    'product.template', 'search_read', [[['name', '=', yeniAd]]],
    { fields: ['id'], limit: 1, context: { active_test: false } },
  )) as { id: number }[];

  let splitTmplId: number;
  if (mevcut.length) {
    splitTmplId = mevcut[0].id;
    console.log(`Zaten var: #${splitTmplId} (yeniden kullanılacak)`);
  } else {
    console.log('Henüz yok — yeni oluşturulacak.');
    if (!EXECUTE) {
      splitTmplId = -1;
    } else {
      splitTmplId = Number(await execute('product.template', 'create', [{
        name: yeniAd,
        type: 'product',
        categ_id: anaSablon.categ_id ? anaSablon.categ_id[0] : false,
        taxes_id: anaSablon.taxes_id?.length ? [[6, 0, anaSablon.taxes_id]] : undefined,
        sale_ok: true,
        purchase_ok: true,
        tracking: 'serial',
      }]));
      console.log(`  → oluşturuldu: #${splitTmplId}`);
    }
  }

  const nitelikler = (await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ['RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'] },
  )) as { id: number; name: string }[];
  const renkAttrId = nitelikler.find((n) => n.name === 'RENK')?.id;
  const olcuAttrId = nitelikler.find((n) => n.name === 'ÖLÇÜ')?.id;
  if (!renkAttrId || !olcuAttrId) throw new Error('RENK/ÖLÇÜ niteliği bulunamadı');

  async function getOrCreateDeger(attrId: number, ad: string): Promise<number> {
    const bulunan = (await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', '=', attrId], ['name', '=', ad.trim()]]],
      { fields: ['id'], limit: 1 },
    )) as { id: number }[];
    if (bulunan.length) return bulunan[0].id;
    console.log(`  (yeni değer) ${ad}`);
    if (!EXECUTE) return -1;
    return Number(await execute('product.attribute.value', 'create', [{ name: ad.trim(), attribute_id: attrId }]));
  }

  const renkIds: number[] = [];
  for (const r of RENKLER) renkIds.push(await getOrCreateDeger(renkAttrId, r));
  const olcuId = await getOrCreateDeger(olcuAttrId, OLCU);

  console.log(`\nRENK değerleri: ${renkIds.join(', ')} — ÖLÇÜ değeri: ${olcuId}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN bitti. Gerçek çalıştırma için --execute ekleyin.');
    return;
  }

  // Attribute satırlarını yeni (temiz) şablona yaz.
  const mevcutLines = (await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', splitTmplId], ['attribute_id', 'in', [renkAttrId, olcuAttrId]]]],
    { fields: ['id', 'attribute_id', 'value_ids'] },
  )) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];
  const lineByAttr = new Map(mevcutLines.map((l) => [l.attribute_id[0], l]));

  async function upsertLine(attrId: number, valueIds: number[]) {
    const line = lineByAttr.get(attrId);
    if (!line) {
      await execute('product.template.attribute.line', 'create', [{
        product_tmpl_id: splitTmplId, attribute_id: attrId, value_ids: [[6, 0, valueIds]],
      }]);
      console.log(`  → nitelik satırı oluşturuldu (attr #${attrId})`);
    } else {
      const merged = [...new Set([...line.value_ids, ...valueIds])];
      if (merged.length !== line.value_ids.length) {
        await execute('product.template.attribute.line', 'write', [[line.id], { value_ids: [[6, 0, merged]] }]);
        console.log(`  → nitelik satırı güncellendi (attr #${attrId})`);
      }
    }
  }

  await upsertLine(renkAttrId, renkIds);
  await upsertLine(olcuAttrId, [olcuId]);

  console.log('\nOluşan varyantlar aranıyor...');
  const tumPtavlar = (await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', splitTmplId]]],
    { fields: ['id', 'product_attribute_value_id'], limit: 1000 },
  )) as { id: number; product_attribute_value_id: [number, string] }[];
  const ptavByValueId = new Map(tumPtavlar.map((p) => [p.product_attribute_value_id[0], p.id]));

  const tumVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', splitTmplId]]],
    { fields: ['id', 'barcode', 'product_template_attribute_value_ids'], limit: 1000 },
  )) as { id: number; barcode: string | false; product_template_attribute_value_ids: number[] }[];
  const varyantByKey = new Map(tumVaryantlar.map((v) => [ptavKey(v.product_template_attribute_value_ids ?? []), v.id]));

  for (const r of RENKLER) {
    const renkId = renkIds[RENKLER.indexOf(r)];
    const rPtav = ptavByValueId.get(renkId);
    const oPtav = ptavByValueId.get(olcuId);
    if (!rPtav || !oPtav) {
      console.log(`  ✗ ${MODEL}/${r}/${OLCU}: PTAV oluşmamış`);
      continue;
    }
    const key = ptavKey([rPtav, oPtav]);
    const varyantId = varyantByKey.get(key);
    console.log(`  ${varyantId ? '✓' : '✗'} ${MODEL}/${r}/${OLCU} → ${varyantId ? `varyant #${varyantId}` : 'bulunamadı'} (şablon #${splitTmplId})`);
  }

  console.log(`\nTamamlandı. Şablon: #${splitTmplId} — "${yeniAd}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
