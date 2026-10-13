/**
 * ACİL — "Ürün Yapılandırma" ekranındaki "Import ile oluştur" akışı,
 * ALLIGATOR OPTİK ÇERÇEVE (şablon #1984) için YENİ bir "dinamik" nitelik
 * seti (MODEL/RENK/ÖLÇÜ "Çoklu") ekliyor; bu şablon zaten ESKİ, "Anında"
 * (always) modda MODEL/RENK/ÖLÇÜ nitelikleriyle 24 gerçek varyanta sahip
 * olduğu için, Odoo yeni nitelik satırı eklenince TÜM eski varyantları
 * (aralarında stoklu/satışlı olanlar dahil) geçersiz kombinasyon sayıp
 * silmeye/arşivlemeye çalışıyor ve stoklu olanı silemediği için patlıyor
 * ("_unlink_or_archive").
 *
 * Bu script o YENİ nitelik setini HİÇ kullanmadan, ŞABLONUN KENDİ ESKİ
 * (always modda) MODEL/RENK/ÖLÇÜ attribute satırlarına doğrudan istenen
 * değerleri ekler — bu satırlar zaten var ve 24 varyant onlardan
 * türediği için, buraya YENİ değer eklemek SADECE yeni kombinasyonlar
 * EKLER, hiçbir mevcut varyantı silmeye çalışmaz (mevcut tüm kombinasyonlar
 * yeni genişletilmiş kümenin alt kümesi olarak kalır).
 *
 * Not: "Anında" modda bir attribute satırına yeni değer eklemek, Odoo'nun
 * o değer ile DİĞER tüm mevcut değerlerin kartezyen çarpımını otomatik
 * oluşturmasına yol açar (yeni MODEL × mevcut tüm RENK/ÖLÇÜ, yeni RENK ×
 * mevcut tüm MODEL/ÖLÇÜ gibi) — bu, istenenden fazla (boş/stoksuz) varyant
 * oluşturabilir. Script önce bunun büyüklüğünü tahmin edip gösterir,
 * --execute olmadan hiçbir şey yazmaz.
 *
 * Kullanım:
 *   npm run alligator-acil-varyant-ac
 *   npm run alligator-acil-varyant-ac -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { ptavKey } from '../src/modules/admin/varyant-import-temizlik.service';

const TEMPLATE_ID = 1984;
const EXECUTE = process.argv.includes('--execute');

// Kullanıcının acil istediği 2 varyant
const ISTENEN_SATIRLAR: { model: string; renk: string; olcu: string }[] = [
  { model: 'ALL146AO', renk: 'C4', olcu: '50' },
  { model: 'ALL146AO', renk: 'C112', olcu: '50' },
];

async function main() {
  const [tmpl] = (await execute(
    'product.template', 'read', [[TEMPLATE_ID]],
    { fields: ['id', 'name', 'attribute_line_ids'] },
  )) as { id: number; name: string; attribute_line_ids: number[] }[];
  if (!tmpl) throw new Error(`Şablon #${TEMPLATE_ID} bulunamadı`);
  console.log(`Şablon #${TEMPLATE_ID}: "${tmpl.name}"\n`);

  const lines = (await execute(
    'product.template.attribute.line', 'read',
    [tmpl.attribute_line_ids],
    { fields: ['id', 'attribute_id', 'value_ids'] },
  )) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

  const lineByAttrName = new Map<string, { id: number; attrId: number; value_ids: number[] }>();
  for (const l of lines) {
    lineByAttrName.set(l.attribute_id[1].trim().toUpperCase(), { id: l.id, attrId: l.attribute_id[0], value_ids: l.value_ids });
  }

  const modelLine = lineByAttrName.get('MODEL');
  const renkLine = lineByAttrName.get('RENK');
  const olcuLine = lineByAttrName.get('ÖLÇÜ');
  if (!modelLine || !renkLine || !olcuLine) {
    throw new Error(
      `Şablonda beklenen eski MODEL/RENK/ÖLÇÜ (always) satırları bulunamadı. ` +
      `Mevcut satırlar: ${[...lineByAttrName.keys()].join(', ')}`,
    );
  }

  console.log(`Mevcut MODEL değer sayısı: ${modelLine.value_ids.length}`);
  console.log(`Mevcut RENK değer sayısı: ${renkLine.value_ids.length}`);
  console.log(`Mevcut ÖLÇÜ değer sayısı: ${olcuLine.value_ids.length}`);
  const eskiToplam = modelLine.value_ids.length * renkLine.value_ids.length * olcuLine.value_ids.length;
  console.log(`Eski olası kombinasyon sayısı: ${eskiToplam} (mevcut gerçek varyant sayısıyla karşılaştırın)\n`);

  // Gerekli değerleri (global product.attribute.value) bul/oluştur.
  async function getOrCreateValue(attrId: number, ad: string): Promise<number> {
    const mevcut = (await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', '=', attrId], ['name', '=', ad.trim()]]],
      { fields: ['id'], limit: 1 },
    )) as { id: number }[];
    if (mevcut.length) return mevcut[0].id;
    console.log(`  (yeni değer) ${ad} — oluşturulacak`);
    if (!EXECUTE) return -1; // dry-run'da gerçek id yok, sadece akışı göstermek için
    return Number(await execute('product.attribute.value', 'create', [{ name: ad.trim(), attribute_id: attrId }]));
  }

  const modelValsGerekli = [...new Set(ISTENEN_SATIRLAR.map((s) => s.model.trim().toUpperCase()))];
  const renkValsGerekli = [...new Set(ISTENEN_SATIRLAR.map((s) => s.renk.trim().toUpperCase()))];
  const olcuValsGerekli = [...new Set(ISTENEN_SATIRLAR.map((s) => s.olcu.trim().toUpperCase()))];

  // Mevcut değer isimlerini oku (karşılaştırma için)
  const tumDegerIdleri = [...modelLine.value_ids, ...renkLine.value_ids, ...olcuLine.value_ids];
  const tumDegerler = (await execute(
    'product.attribute.value', 'read', [tumDegerIdleri], { fields: ['id', 'name'] },
  )) as { id: number; name: string }[];
  const adByIdMap = new Map(tumDegerler.map((d) => [d.id, d.name.trim().toUpperCase()]));

  const modelYeniSayisi = modelValsGerekli.filter((ad) => ![...modelLine.value_ids].some((id) => adByIdMap.get(id) === ad)).length;
  const renkYeniSayisi = renkValsGerekli.filter((ad) => ![...renkLine.value_ids].some((id) => adByIdMap.get(id) === ad)).length;
  const olcuYeniSayisi = olcuValsGerekli.filter((ad) => ![...olcuLine.value_ids].some((id) => adByIdMap.get(id) === ad)).length;

  const yeniToplam = (modelLine.value_ids.length + modelYeniSayisi) * (renkLine.value_ids.length + renkYeniSayisi) * (olcuLine.value_ids.length + olcuYeniSayisi);
  const tahminiYeniVaryant = yeniToplam - eskiToplam;

  console.log(`Yeni MODEL değeri: ${modelYeniSayisi}, yeni RENK değeri: ${renkYeniSayisi}, yeni ÖLÇÜ değeri: ${olcuYeniSayisi}`);
  console.log(`TAHMİNİ yeni oluşacak varyant sayısı (kartezyen genişleme): ~${tahminiYeniVaryant}\n`);

  if (tahminiYeniVaryant > 300) {
    console.log(`⚠️  Tahmini genişleme çok büyük (${tahminiYeniVaryant}) — güvenlik için DURDURULDU. Elle inceleme gerekir.`);
    return;
  }

  if (!EXECUTE) {
    console.log('DRY RUN bitti — gerçek yazma için --execute ekleyin.');
    return;
  }

  const modelValId = await getOrCreateValue(modelLine.attrId, ISTENEN_SATIRLAR[0].model);
  const renkValIds = new Map<string, number>();
  for (const renk of new Set(ISTENEN_SATIRLAR.map((s) => s.renk))) {
    renkValIds.set(renk.trim().toUpperCase(), await getOrCreateValue(renkLine.attrId, renk));
  }
  const olcuValId = await getOrCreateValue(olcuLine.attrId, ISTENEN_SATIRLAR[0].olcu);

  const modelMerged = [...new Set([...modelLine.value_ids, modelValId])];
  const renkMerged = [...new Set([...renkLine.value_ids, ...renkValIds.values()])];
  const olcuMerged = [...new Set([...olcuLine.value_ids, olcuValId])];

  console.log('Attribute satırları güncelleniyor (bu adım Odoo tarafında kartezyen grid oluşturabilir, biraz sürebilir)...');
  if (modelMerged.length !== modelLine.value_ids.length) {
    await execute('product.template.attribute.line', 'write', [[modelLine.id], { value_ids: [[6, 0, modelMerged]] }]);
    console.log('  → MODEL satırı güncellendi.');
  }
  if (renkMerged.length !== renkLine.value_ids.length) {
    await execute('product.template.attribute.line', 'write', [[renkLine.id], { value_ids: [[6, 0, renkMerged]] }]);
    console.log('  → RENK satırı güncellendi.');
  }
  if (olcuMerged.length !== olcuLine.value_ids.length) {
    await execute('product.template.attribute.line', 'write', [[olcuLine.id], { value_ids: [[6, 0, olcuMerged]] }]);
    console.log('  → ÖLÇÜ satırı güncellendi.');
  }

  console.log('\nİstenen varyantlar aranıyor...');
  const tumPtavlar = (await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'product_attribute_value_id'], limit: 50000 },
  )) as { id: number; product_attribute_value_id: [number, string] }[];
  const ptavByValueId = new Map(tumPtavlar.map((p) => [p.product_attribute_value_id[0], p.id]));

  const tumVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', TEMPLATE_ID]]],
    { fields: ['id', 'product_template_attribute_value_ids', 'barcode'], limit: 50000 },
  )) as { id: number; product_template_attribute_value_ids: number[]; barcode: string | false }[];
  const varyantByKey = new Map(tumVaryantlar.map((v) => [ptavKey(v.product_template_attribute_value_ids ?? []), v.id]));

  for (const satir of ISTENEN_SATIRLAR) {
    const mId = ptavByValueId.get(modelValId);
    const rId = ptavByValueId.get(renkValIds.get(satir.renk.trim().toUpperCase())!);
    const oId = ptavByValueId.get(olcuValId);
    if (!mId || !rId || !oId) {
      console.log(`  ✗ ${satir.model}/${satir.renk}/${satir.olcu}: PTAV bulunamadı (mId=${mId}, rId=${rId}, oId=${oId})`);
      continue;
    }
    const key = ptavKey([mId, rId, oId]);
    const varyantId = varyantByKey.get(key);
    if (varyantId) {
      console.log(`  ✓ ${satir.model}/${satir.renk}/${satir.olcu} → varyant #${varyantId} oluştu/mevcut.`);
    } else {
      console.log(`  ✗ ${satir.model}/${satir.renk}/${satir.olcu}: beklenen kombinasyon bulunamadı — Odoo grid'i henüz bu kombinasyonu üretmemiş olabilir.`);
    }
  }

  console.log('\nTamamlandı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
