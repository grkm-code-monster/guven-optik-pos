import { execute } from '../odoo/odoo.service';
import { ptavKey } from './varyant-import-temizlik.service';
import type { VaryantImportSatir, VaryantImportSonuc } from './odoo-varyant-import.service';
import { varyantKey } from './odoo-varyant-import.service';

/**
 * Çok-modelli ürünler (örn. "SWING GÜNEŞ GÖZLÜĞÜ" — 90+ farklı MODEL) için
 * TEK şablonda gerçek MODEL×RENK×ÖLÇÜ varyantı açan import yolu.
 *
 * Mevcut MODEL/RENK/ÖLÇÜ nitelikleri "Anında" (always) modda ve onlarca
 * BAŞKA şablonda gerçek varyantlarla kullanıldığı için Odoo bu modu global
 * olarak değiştirmemize izin vermiyor (bkz. fix-variant-explosion.ts). Bu
 * yüzden çok-modelli ürünler için AYRI, "Talep Üzerine" (dynamic) modda yeni
 * bir nitelik seti kullanıyoruz — bu moddaki nitelikler Odoo'nun otomatik
 * kombinasyon üretimine hiç girmez, SADECE bizim `product.product create`
 * ile açıkça istediğimiz kombinasyon oluşturulur. Bu sayede MODEL kaç farklı
 * değer alırsa alsın patlama riski hiç olmaz VE her şey TEK şablonda kalır
 * (model başına ayrı alt şablon YOK — bkz. odoo-varyant-import.service.ts'in
 * eski "split by model" yöntemiyle karşılaştırıldığında bu, kullanıcının
 * gördüğü/beklediği görünüme (Odoo'da tek ürün, altında Model/Renk/Ölçü
 * varyantları) karşılık gelir).
 *
 * Nitelikler bir kere oluşturulur (bkz. scripts/dinamik-nitelik-olustur.ts)
 * ve isim çakışmasını önlemek için mevcut MODEL/RENK/ÖLÇÜ'den farklı,
 * açıkça ayırt edici adlar taşır.
 */
export const DINAMIK_NITELIK_ADLARI = {
  MODEL: 'MODEL (Çoklu)',
  RENK: 'RENK (Çoklu)',
  OLCU: 'ÖLÇÜ (Çoklu)',
} as const;

let nitelikIdCache: { modelAttrId: number; renkAttrId: number; olcuAttrId: number } | null = null;

async function getDinamikNitelikIds(): Promise<{ modelAttrId: number; renkAttrId: number; olcuAttrId: number }> {
  if (nitelikIdCache) return nitelikIdCache;

  const adlar = Object.values(DINAMIK_NITELIK_ADLARI);
  const nitelikler = await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', adlar]]],
    { fields: ['id', 'name', 'create_variant'] },
  ) as { id: number; name: string; create_variant: string }[];

  const modelAttrId = nitelikler.find((n) => n.name === DINAMIK_NITELIK_ADLARI.MODEL)?.id;
  const renkAttrId = nitelikler.find((n) => n.name === DINAMIK_NITELIK_ADLARI.RENK)?.id;
  const olcuAttrId = nitelikler.find((n) => n.name === DINAMIK_NITELIK_ADLARI.OLCU)?.id;

  if (!modelAttrId || !renkAttrId || !olcuAttrId) {
    throw new Error(
      'Dinamik MODEL/RENK/ÖLÇÜ nitelikleri bulunamadı — önce '
      + '"npm run dinamik-nitelik-olustur -- --execute" çalıştırılmalı.',
    );
  }

  // Güvenlik kontrolü: bu nitelikler yanlışlıkla "always" moda çekilmişse
  // (örn. Odoo arayüzünden elle) burada patlamayı önden yakalayalım.
  const yanlisMod = nitelikler.find((n) => n.create_variant !== 'dynamic');
  if (yanlisMod) {
    throw new Error(
      `"${yanlisMod.name}" niteliği "dynamic" modda değil (şu an: ${yanlisMod.create_variant}) — `
      + 'bu, çok-modelli ürünlerde patlama riskini geri getirir. Odoo\'da düzeltin.',
    );
  }

  nitelikIdCache = { modelAttrId, renkAttrId, olcuAttrId };
  return nitelikIdCache;
}

/**
 * Çok-modelli TEK şablon için MODEL×RENK×ÖLÇÜ varyantlarını doğrudan o
 * şablona (bölme yapmadan) import eder. importVaryantlarSplitByModel ile
 * aynı sözleşmeyi (VaryantImportSonuc) döner.
 */
export async function importVaryantlarDinamikTekSablon(
  tmplId: number,
  satirlar: VaryantImportSatir[],
): Promise<VaryantImportSonuc> {
  const { modelAttrId, renkAttrId, olcuAttrId } = await getDinamikNitelikIds();

  const varyantIdByKey = new Map<string, number>();
  const hatalar: { index: number; sebep: string }[] = [];
  const sonuclar: VaryantImportSonuc['sonuclar'] = [];
  let olusturulan = 0;
  let zatenMevcut = 0;

  const gecerliSatirlar = satirlar.filter((s) => {
    if (!s.model?.trim() || !s.renk?.trim() || !s.olcu?.trim()) {
      hatalar.push({ index: s.index, sebep: 'Model, renk veya ölçü boş' });
      return false;
    }
    return true;
  });

  console.log(`[varyant-import-dinamik] Şablon #${tmplId}. Toplam satır: ${satirlar.length}, geçerli: ${gecerliSatirlar.length}.`);

  if (!gecerliSatirlar.length) {
    return { varyantIdByKey, olusturulan, zatenMevcut, hatalar, sonuclar, otomatikTemizlenen: 0, kalanVaryant: 0 };
  }

  // Mevcut global değerleri (bu 3 dinamik nitelik için) tek seferde çek.
  const mevcutDegerler = await execute(
    'product.attribute.value', 'search_read',
    [[['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
    { fields: ['id', 'name', 'attribute_id'], limit: 20000 },
  ) as { id: number; name: string; attribute_id: [number, string] }[];

  const degerMap = new Map<string, number>();
  for (const d of mevcutDegerler) {
    degerMap.set(`${d.attribute_id[0]}_${d.name.trim().toUpperCase()}`, d.id);
  }

  const getOrCreateDeger = async (attrId: number, ad: string): Promise<number> => {
    const key = `${attrId}_${ad.trim().toUpperCase()}`;
    if (degerMap.has(key)) return degerMap.get(key)!;
    const yeniId = Number(await execute(
      'product.attribute.value', 'create',
      [{ name: ad.trim(), attribute_id: attrId }],
    ));
    degerMap.set(key, yeniId);
    return yeniId;
  };

  // Şablonun mevcut MODEL/RENK/ÖLÇÜ (dinamik) attribute satırlarını çek.
  const mevcutLines = await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', tmplId], ['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
    { fields: ['id', 'attribute_id', 'value_ids'] },
  ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

  const lineByAttr = new Map<number, { id: number; value_ids: number[] }>();
  for (const l of mevcutLines) lineByAttr.set(l.attribute_id[0], { id: l.id, value_ids: l.value_ids });

  const attrUniqueValues = new Map<number, Set<number>>();
  const parsedRows: Array<VaryantImportSatir & { modelId: number; renkId: number; olcuId: number }> = [];

  for (const row of gecerliSatirlar) {
    try {
      const modelId = await getOrCreateDeger(modelAttrId, row.model);
      const renkId = await getOrCreateDeger(renkAttrId, row.renk);
      const olcuId = await getOrCreateDeger(olcuAttrId, row.olcu);
      for (const [attrId, valId] of [[modelAttrId, modelId], [renkAttrId, renkId], [olcuAttrId, olcuId]] as const) {
        if (!attrUniqueValues.has(attrId)) attrUniqueValues.set(attrId, new Set());
        attrUniqueValues.get(attrId)!.add(valId);
      }
      parsedRows.push({ ...row, modelId, renkId, olcuId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
      hatalar.push({ index: row.index, sebep: msg });
    }
  }

  // Attribute satırlarını yaz (dynamic mod olduğu için Odoo burada HİÇBİR
  // otomatik kombinasyon üretmeye çalışmaz — sadece PTAV'lar oluşur).
  try {
    for (const [attrId, valueSet] of attrUniqueValues) {
      const valueIds = [...valueSet];
      const line = lineByAttr.get(attrId);
      if (!line) {
        const lineId = Number(await execute(
          'product.template.attribute.line', 'create',
          [{ product_tmpl_id: tmplId, attribute_id: attrId, value_ids: [[6, 0, valueIds]] }],
        ));
        lineByAttr.set(attrId, { id: lineId, value_ids: valueIds });
      } else {
        const merged = [...new Set([...line.value_ids, ...valueIds])];
        if (merged.length !== line.value_ids.length || merged.some((id) => !line.value_ids.includes(id))) {
          await execute('product.template.attribute.line', 'write', [[line.id], { value_ids: [[6, 0, merged]] }]);
          lineByAttr.set(attrId, { id: line.id, value_ids: merged });
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'Nitelik satırı yazılamadı';
    console.log(`[varyant-import-dinamik] Attribute satırı yazma hatası: ${msg}`);
    for (const r of parsedRows) hatalar.push({ index: r.index, sebep: msg });
    return { varyantIdByKey, olusturulan, zatenMevcut, hatalar, sonuclar, otomatikTemizlenen: 0, kalanVaryant: 0 };
  }

  const tumPtavlar = await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'product_attribute_value_id'], limit: 50000 },
  ) as { id: number; product_attribute_value_id: [number, string] }[];
  const ptavByValueId = new Map<number, number>();
  for (const p of tumPtavlar) ptavByValueId.set(p.product_attribute_value_id[0], p.id);

  const mevcutVaryantlar = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 50000 },
  ) as { id: number; product_template_attribute_value_ids: number[] }[];
  const varyantByPtavKey = new Map<string, number>();
  for (const v of mevcutVaryantlar) {
    varyantByPtavKey.set(ptavKey(v.product_template_attribute_value_ids ?? []), v.id);
  }

  console.log(`[varyant-import-dinamik] Şablon #${tmplId}: ${parsedRows.length} satır işlenecek, ${attrUniqueValues.get(modelAttrId)?.size ?? 0} farklı model, mevcut varyant: ${mevcutVaryantlar.length}.`);

  for (const row of parsedRows) {
    try {
      const modelPtavId = ptavByValueId.get(row.modelId);
      const renkPtavId = ptavByValueId.get(row.renkId);
      const olcuPtavId = ptavByValueId.get(row.olcuId);
      if (!modelPtavId || !renkPtavId || !olcuPtavId) {
        hatalar.push({ index: row.index, sebep: 'PTAV bulunamadı' });
        continue;
      }

      const ptavIds = [modelPtavId, renkPtavId, olcuPtavId];
      const key = ptavKey(ptavIds);
      const vKey = varyantKey(row.model, row.renk, row.olcu);

      const mevcutVaryantId = varyantByPtavKey.get(key);
      if (mevcutVaryantId) {
        varyantIdByKey.set(vKey, mevcutVaryantId);
        zatenMevcut++;
        sonuclar.push({
          index: row.index, model: row.model, renk: row.renk, olcu: row.olcu,
          barkod: row.barkod, fiyat: row.fiyat, varyantId: mevcutVaryantId, durum: 'zaten_var',
        });
        continue;
      }

      const varyantId = Number(await execute(
        'product.product', 'create',
        [{
          product_tmpl_id: tmplId,
          product_template_attribute_value_ids: [[6, 0, ptavIds]],
          barcode: row.barkod || false,
          lst_price: row.fiyat || 0,
        }],
      ));
      varyantIdByKey.set(vKey, varyantId);
      varyantByPtavKey.set(key, varyantId);
      olusturulan++;
      sonuclar.push({
        index: row.index, model: row.model, renk: row.renk, olcu: row.olcu,
        barkod: row.barkod, fiyat: row.fiyat, varyantId, durum: 'olusturuldu',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
      hatalar.push({ index: row.index, sebep: msg });
    }
  }

  console.log(`[varyant-import-dinamik] Bitti — olusturulan=${olusturulan}, zatenMevcut=${zatenMevcut}, hatalar=${hatalar.length}.`);

  return { varyantIdByKey, olusturulan, zatenMevcut, hatalar, sonuclar, otomatikTemizlenen: 0, kalanVaryant: mevcutVaryantlar.length + olusturulan };
}

/**
 * findVariantProductId ile aynı sözleşme — dinamik nitelik setiyle, TEK
 * şablon üzerinde arama yapar (bölünmüş alt şablon aramaz, çünkü bu yolda
 * hiç bölme yok).
 */
export async function findVariantProductIdDinamik(
  tmplId: number,
  model: string,
  renk: string,
  olcu: string,
): Promise<number | null> {
  const { modelAttrId, renkAttrId, olcuAttrId } = await getDinamikNitelikIds();

  const values = await execute(
    'product.attribute.value', 'search_read',
    [[['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
    { fields: ['id', 'name', 'attribute_id'], limit: 20000 },
  ) as { id: number; name: string; attribute_id: [number, string] }[];

  const valMap = new Map<string, number>();
  for (const v of values) valMap.set(`${v.attribute_id[0]}_${v.name.trim().toUpperCase()}`, v.id);

  const modelId = valMap.get(`${modelAttrId}_${model.trim().toUpperCase()}`);
  const renkId = valMap.get(`${renkAttrId}_${renk.trim().toUpperCase()}`);
  const olcuId = valMap.get(`${olcuAttrId}_${olcu.trim().toUpperCase()}`);
  if (!modelId || !renkId || !olcuId) return null;

  const ptavlar = await execute(
    'product.template.attribute.value', 'search_read',
    [[['product_tmpl_id', '=', tmplId], ['product_attribute_value_id', 'in', [modelId, renkId, olcuId]]]],
    { fields: ['id'], limit: 10 },
  ) as { id: number }[];
  if (ptavlar.length !== 3) return null;

  const key = ptavKey(ptavlar.map((p) => p.id));
  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 20000 },
  ) as { id: number; product_template_attribute_value_ids: number[] }[];

  const match = variants.find((v) => ptavKey(v.product_template_attribute_value_ids ?? []) === key);
  return match?.id ?? null;
}
