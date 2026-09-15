import { execute } from '../odoo/odoo.service';
import { resolveOrCreateCategoryId } from '../odoo/odoo-category.util';
import { ptavKey } from './varyant-import-temizlik.service';

export type VaryantImportSatir = {
  index: number;
  model: string;
  renk: string;
  olcu: string;
  barkod: string;
  fiyat: number;
};

/**
 * Kalıcı varyant patlaması koruması — DÜZELTME 2 (15.09.2026).
 *
 * Odoo'da MODEL/RENK/ÖLÇÜ özniteliklerinin "Varyant Oluşturma" modu "Anında"
 * (always) — bir şablonun attribute satırına yeni değer eklendiğinde Odoo o
 * şablonun TÜM model×renk×ölçü kombinasyonunu peşinen üretmeye çalışıyor. Bu
 * modu değiştirmek Odoo tarafından engelleniyor (bkz. fix-variant-explosion.ts).
 *
 * İLK düzeltme (eşik = 500 kombinasyon) YETERSİZ çıktı: bir şablona MODEL,
 * RENK ve ÖLÇÜ satırlarının HER ÜÇÜ de yazıldığı an — sayı KAÇ olursa olsun,
 * 400 olsun 2 olsun — Odoo o üç satırın TAM kartezyen çarpımını anında
 * üretiyor. Gerçek dünyada bir "MODEL" zaten kendi başına ayrı bir üründür
 * (SS320SG başka bir ürün, GTR0315SG başka bir ürün) — aynı RENK/ÖLÇÜ
 * aralığını paylaşmaları hiç gerekmez, o yüzden MODEL'i hiçbir zaman ana
 * şablonun paylaşılan bir varyant niteliği yapmamak gerekiyor.
 *
 * KALICI ÇÖZÜM: MODEL artık HİÇBİR ZAMAN ana şablonun (örn. "SWING GÜNEŞ
 * GÖZLÜĞÜ") kendi attribute satırına yazılmıyor. Her farklı MODEL değeri,
 * kendi küçük "bölünmüş şablonuna" (`"{Ürün Adı} {MODEL}"`) yönlendiriliyor;
 * o şablonda SADECE RENK×ÖLÇÜ niteliği olur (genelde tek haneli sayıda
 * kombinasyon — asla patlamaz). Ana şablona hiçbir zaman MODEL bazlı bir
 * attribute satırı eklenmez, bu yüzden "kaç satır" sorusu artık önemsiz.
 */
export type VaryantImportSonuc = {
  varyantIdByKey: Map<string, number>;
  olusturulan: number;
  // Düzeltme (15.09.2026): "zaten var" eşleşmesi ne "oluşturuldu" ne de
  // "hata" sayılıyordu — bu yüzden bir önceki (nginx 504 nedeniyle arka
  // planda tamamlanmış ama istemciye hiç yanıt dönmemiş) denemenin
  // ürettiği varyantlarla eşleşen bir tekrar-import "0 varyant oluşturuldu,
  // 0 hata" gibi anlaşılması güç, sanki-başarısız bir sonuç veriyordu.
  // Artık ayrıca sayılıp UI'da gösteriliyor.
  zatenMevcut: number;
  hatalar: { index: number; sebep: string }[];
  otomatikTemizlenen: number;
  kalanVaryant: number;
  sonuclar: {
    index: number;
    model: string;
    renk: string;
    olcu: string;
    barkod: string;
    fiyat: number;
    varyantId: number;
    durum: 'olusturuldu' | 'zaten_var';
  }[];
};

function varyantKey(model: string, renk: string, olcu: string): string {
  return `${model.trim().toUpperCase()}|${renk.trim().toUpperCase()}|${olcu.trim().toUpperCase()}`;
}

/**
 * DÜZELTME 3 (15.09.2026) — kullanıcı geri bildirimi: "split by model" yöntemi
 * her MODEL'i AYRI bir Odoo şablonuna açıyordu (örn. "SWING GÜNEŞ GÖZLÜĞÜ
 * SS320SG" diye 95 ayrı ürün). Bu, patlamayı önlese de kullanıcının beklediği
 * "TEK ürün, altında Model/Renk/Ölçü varyantları" görünümünü VERMİYORDU.
 *
 * Gerçek çözüm: MODEL/RENK/ÖLÇÜ'nün "Talep Üzerine" (dynamic) modda YENİ bir
 * kopyası (bkz. odoo-varyant-import-dinamik.service.ts) — bu moddaki
 * nitelikler Odoo'nun otomatik kombinasyon üretimine hiç girmediği için kaç
 * farklı MODEL olursa olsun patlama riski YOK ve hepsi TEK şablonda kalıyor.
 *
 * Mevcut MODEL/RENK/ÖLÇÜ (always modda) nitelikleri onlarca ESKİ şablonda
 * (örn. OTTO/MUSTANG OPTİK ÇERÇEVE) zaten "split by model" yapısıyla
 * kullanıldığı için, o ürünlerde tutarlılığı bozmamak adına ESKİ yöntemle
 * devam ediyoruz. Hangi yöntemin kullanılacağına, bu ana ürün adı için
 * DAHA ÖNCE oluşturulmuş bir bölünmüş alt şablon (örn. "{Ürün Adı} XYZ")
 * olup olmadığına bakarak karar veriyoruz — varsa eski (split), yoksa
 * (SWING gibi sıfırdan/temizlenmiş bir ürün) yeni (dinamik tek şablon) yol.
 */
export async function importVaryantlarForTemplate(
  tmplId: number,
  satirlar: VaryantImportSatir[],
): Promise<VaryantImportSonuc> {
  const orijinalAd = (await execute(
    'product.template', 'read', [[Number(tmplId)]], { fields: ['name'] },
  ) as { name: string }[])[0]?.name?.trim();

  if (orijinalAd) {
    const splitOrnegi = await execute(
      'product.template', 'search_count',
      [[['name', '=like', `${orijinalAd} %`]]],
    ) as number;

    if (!splitOrnegi) {
      console.log(`[varyant-import] "${orijinalAd}" için önceden bölünmüş alt şablon bulunamadı — yeni "dinamik tek şablon" yolu kullanılıyor.`);
      const { importVaryantlarDinamikTekSablon } = await import('./odoo-varyant-import-dinamik.service');
      return importVaryantlarDinamikTekSablon(Number(tmplId), satirlar);
    }
    console.log(`[varyant-import] "${orijinalAd}" için ${splitOrnegi} bölünmüş alt şablon zaten var — eski "split by model" yolu kullanılıyor (tutarlılık için).`);
  }

  const nitelikler = await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'] },
  ) as { id: number; name: string }[];

  const nitelikMap = new Map(nitelikler.map((n) => [n.name, n.id]));
  const modelAttrId = nitelikMap.get('MODEL');
  const renkAttrId = nitelikMap.get('RENK');
  const olcuAttrId = nitelikMap.get('ÖLÇÜ');

  if (!modelAttrId || !renkAttrId || !olcuAttrId) {
    throw new Error('MODEL, RENK veya ÖLÇÜ niteliği bulunamadı');
  }

  const mevcutDegerler = await execute(
    'product.attribute.value', 'search_read',
    [[['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
    { fields: ['id', 'name', 'attribute_id'], limit: 10000 },
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

  // MODEL, ana şablonun (tmplId) KENDİ attribute satırına ARTIK HİÇ
  // YAZILMIYOR — her satır doğrudan kendi model-bazlı bölünmüş şablonuna
  // yönlendiriliyor (bkz. importVaryantlarSplitByModel ve yukarıdaki
  // dosya-başı açıklama). Ana şablon bu yüzden asla MODEL×RENK×ÖLÇÜ
  // kartezyen patlamasına maruz kalmaz.
  return importVaryantlarSplitByModel(tmplId, satirlar, { renkAttrId, olcuAttrId, getOrCreateDeger });
}

/**
 * Patlama riski taşıyan (VARYANT_PATLAMA_ESIGI'yi aşmış) bir şablona yeni
 * MODEL değeri eklemek yerine, her model için ayrı, küçük bir "bölünmüş
 * şablon" (`"{orijinal ürün adı} {MODEL}"`) oluşturup varyantı sadece
 * RENK×ÖLÇÜ niteliğiyle oraya yazar. Orijinal şablona ve mevcut varyantlarına
 * dokunulmaz — sadece bu satırların gideceği hedef değişir.
 */
async function importVaryantlarSplitByModel(
  orijinalTmplId: number,
  satirlar: VaryantImportSatir[],
  ctx: {
    renkAttrId: number;
    olcuAttrId: number;
    getOrCreateDeger: (attrId: number, ad: string) => Promise<number>;
  },
): Promise<VaryantImportSonuc> {
  const { renkAttrId, olcuAttrId, getOrCreateDeger } = ctx;
  const varyantIdByKey = new Map<string, number>();
  const hatalar: { index: number; sebep: string }[] = [];
  const sonuclar: VaryantImportSonuc['sonuclar'] = [];
  let olusturulan = 0;
  let zatenMevcut = 0;

  const orijinal = (await execute(
    'product.template', 'read',
    [[Number(orijinalTmplId)]],
    { fields: ['name', 'categ_id', 'taxes_id'] },
  ) as { name: string; categ_id: [number, string] | false; taxes_id: number[] }[])[0];

  if (!orijinal) {
    for (const s of satirlar) hatalar.push({ index: s.index, sebep: 'Orijinal şablon bulunamadı' });
    return { varyantIdByKey, olusturulan, zatenMevcut, hatalar, sonuclar, otomatikTemizlenen: 0, kalanVaryant: 0 };
  }

  const byModel = new Map<string, VaryantImportSatir[]>();
  for (const s of satirlar) {
    if (!s.model?.trim() || !s.renk?.trim() || !s.olcu?.trim()) {
      hatalar.push({ index: s.index, sebep: 'Model, renk veya ölçü boş' });
      continue;
    }
    const modelKey = s.model.trim().toUpperCase();
    if (!byModel.has(modelKey)) byModel.set(modelKey, []);
    byModel.get(modelKey)!.push(s);
  }

  // Tanı logu (15.09.2026) — bkz. admin.controller.ts /odoo-varyant-import.
  console.log(`[varyant-import-split] Ana şablon: "${orijinal.name}" (#${orijinalTmplId}). Toplam satır: ${satirlar.length}, gruplanan model sayısı: ${byModel.size}, gruplama sırasında hataya düşen: ${hatalar.length}.`);
  if (byModel.size === 0 && satirlar.length > 0) {
    console.log(`[varyant-import-split] UYARI: ${satirlar.length} satır geldi ama HİÇBİRİ modele gruplanamadı. İlk 3 satır ham hali: ${JSON.stringify(satirlar.slice(0, 3))}`);
  }

  const splitTmplCache = new Map<string, number>();

  async function resolveSplitTmplId(model: string): Promise<number> {
    const splitAdi = `${orijinal.name.trim()} ${model}`.trim();
    if (splitTmplCache.has(splitAdi)) return splitTmplCache.get(splitAdi)!;

    const mevcut = await execute(
      'product.template', 'search_read',
      [[['name', '=', splitAdi]]],
      { fields: ['id'], limit: 1 },
    ) as { id: number }[];

    if (mevcut.length) {
      splitTmplCache.set(splitAdi, mevcut[0].id);
      return mevcut[0].id;
    }

    const yeniId = Number(await execute(
      'product.template', 'create',
      [{
        name: splitAdi,
        type: 'product',
        categ_id: orijinal.categ_id ? orijinal.categ_id[0] : false,
        taxes_id: orijinal.taxes_id?.length ? [[6, 0, orijinal.taxes_id]] : undefined,
        sale_ok: true,
        purchase_ok: true,
        tracking: 'serial',
      }],
    ));
    splitTmplCache.set(splitAdi, yeniId);
    return yeniId;
  }

  for (const [model, rows] of byModel) {
    let splitTmplId: number;
    try {
      splitTmplId = await resolveSplitTmplId(model);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bölünmüş şablon oluşturulamadı';
      for (const r of rows) hatalar.push({ index: r.index, sebep: msg });
      continue;
    }

    // Bu split şablonda renk/ölçü satırlarını çek, gerekli değerleri ekle.
    const mevcutLines = await execute(
      'product.template.attribute.line', 'search_read',
      [[['product_tmpl_id', '=', splitTmplId], ['attribute_id', 'in', [renkAttrId, olcuAttrId]]]],
      { fields: ['id', 'attribute_id', 'value_ids'] },
    ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

    const lineByAttr = new Map<number, { id: number; value_ids: number[] }>();
    for (const l of mevcutLines) lineByAttr.set(l.attribute_id[0], { id: l.id, value_ids: l.value_ids });

    const attrUniqueValues = new Map<number, Set<number>>();
    const parsedRows: Array<VaryantImportSatir & { renkId: number; olcuId: number }> = [];

    for (const row of rows) {
      try {
        const renkId = await getOrCreateDeger(renkAttrId, row.renk);
        const olcuId = await getOrCreateDeger(olcuAttrId, row.olcu);
        if (!attrUniqueValues.has(renkAttrId)) attrUniqueValues.set(renkAttrId, new Set());
        if (!attrUniqueValues.has(olcuAttrId)) attrUniqueValues.set(olcuAttrId, new Set());
        attrUniqueValues.get(renkAttrId)!.add(renkId);
        attrUniqueValues.get(olcuAttrId)!.add(olcuId);
        parsedRows.push({ ...row, renkId, olcuId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
        hatalar.push({ index: row.index, sebep: msg });
      }
    }

    // Düzeltme (15.09.2026): bu blok try/catch İÇİNDE değildi — bir model
    // grubunda burada atılan bir hata (örn. Odoo XML-RPC geçici hatası)
    // yakalanmadan yukarı fırlıyor, İSTEĞİN TAMAMINI (o ana kadar işlenmiş
    // diğer TÜM model gruplarının sonuçlarıyla birlikte) durdurup 500'e
    // sebep oluyordu — hem de bu satırlar "hata" olarak dahi kaydedilmeden.
    // Artık bir model grubunun attribute satırı yazımı başarısız olursa,
    // SADECE o modelin satırları hataya düşüyor, diğer modellerle devam
    // ediliyor.
    try {
      for (const [attrId, valueSet] of attrUniqueValues) {
        const valueIds = [...valueSet];
        const line = lineByAttr.get(attrId);
        if (!line) {
          const lineId = Number(await execute(
            'product.template.attribute.line', 'create',
            [{ product_tmpl_id: splitTmplId, attribute_id: attrId, value_ids: [[6, 0, valueIds]] }],
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
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Nitelik satırı yazılamadı (bölünmüş şablon)';
      for (const r of rows) hatalar.push({ index: r.index, sebep: msg });
      continue;
    }

    const tumPtavlar = await execute(
      'product.template.attribute.value', 'search_read',
      [[['product_tmpl_id', '=', splitTmplId]]],
      { fields: ['id', 'product_attribute_value_id'], limit: 20000 },
    ) as { id: number; product_attribute_value_id: [number, string] }[];
    const ptavByValueId = new Map<number, number>();
    for (const p of tumPtavlar) ptavByValueId.set(p.product_attribute_value_id[0], p.id);

    const mevcutVaryantlar = await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', splitTmplId]]],
      { fields: ['id', 'product_template_attribute_value_ids'], limit: 20000 },
    ) as { id: number; product_template_attribute_value_ids: number[] }[];
    const varyantByPtavKey = new Map<string, number>();
    for (const v of mevcutVaryantlar) {
      varyantByPtavKey.set(ptavKey(v.product_template_attribute_value_ids ?? []), v.id);
    }

    for (const row of parsedRows) {
      try {
        const renkPtavId = ptavByValueId.get(row.renkId);
        const olcuPtavId = ptavByValueId.get(row.olcuId);
        if (!renkPtavId || !olcuPtavId) {
          hatalar.push({ index: row.index, sebep: 'PTAV bulunamadı (bölünmüş şablon)' });
          continue;
        }

        const ptavIds = [renkPtavId, olcuPtavId];
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
            product_tmpl_id: splitTmplId,
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

    console.log(`[varyant-import-split] Model "${model}" (split şablon #${splitTmplId}) işlendi — bu grupta ${rows.length} satır, şu ana kadar toplam: olusturulan=${olusturulan}, zatenMevcut=${zatenMevcut}, hatalar=${hatalar.length}.`);
  }

  return { varyantIdByKey, olusturulan, zatenMevcut, hatalar, sonuclar, otomatikTemizlenen: 0, kalanVaryant: 0 };
}

export async function findVariantProductId(
  tmplId: number,
  model: string,
  renk: string,
  olcu: string,
): Promise<number | null> {
  // Aynı yönlendirme mantığı (bkz. importVaryantlarForTemplate) — bu ana
  // ürün için önceden bölünmüş alt şablon YOKSA (SWING gibi dinamik-tek-
  // şablon yoluyla açılmış ürünler), varyantı direkt tmplId üzerinde,
  // dinamik nitelik setiyle ara.
  const anaSablonAdi = (await execute(
    'product.template', 'read', [[tmplId]], { fields: ['name'] },
  ) as { name: string }[])[0]?.name?.trim();

  if (anaSablonAdi) {
    const splitOrnegi = await execute(
      'product.template', 'search_count',
      [[['name', '=like', `${anaSablonAdi} %`]]],
    ) as number;
    if (!splitOrnegi) {
      const { findVariantProductIdDinamik } = await import('./odoo-varyant-import-dinamik.service');
      return findVariantProductIdDinamik(tmplId, model, renk, olcu);
    }
  }

  const attrs = await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'], limit: 10 },
  ) as { id: number; name: string }[];

  const attrIds = {
    model: attrs.find((a) => a.name === 'MODEL')?.id,
    renk: attrs.find((a) => a.name === 'RENK')?.id,
    olcu: attrs.find((a) => a.name === 'ÖLÇÜ')?.id,
  };
  if (!attrIds.model || !attrIds.renk || !attrIds.olcu) return null;

  const values = await execute(
    'product.attribute.value', 'search_read',
    [[['attribute_id', 'in', [attrIds.model, attrIds.renk, attrIds.olcu]]]],
    { fields: ['id', 'name', 'attribute_id'], limit: 10000 },
  ) as { id: number; name: string; attribute_id: [number, string] }[];

  const valMap = new Map<string, number>();
  for (const v of values) {
    valMap.set(`${v.attribute_id[0]}_${v.name.trim().toUpperCase()}`, v.id);
  }

  const modelId = valMap.get(`${attrIds.model}_${model.trim().toUpperCase()}`);
  const renkId = valMap.get(`${attrIds.renk}_${renk.trim().toUpperCase()}`);
  const olcuId = valMap.get(`${attrIds.olcu}_${olcu.trim().toUpperCase()}`);
  if (!modelId || !renkId || !olcuId) return null;

  const ptavlar = await execute(
    'product.template.attribute.value', 'search_read',
    [[
      ['product_tmpl_id', '=', tmplId],
      ['product_attribute_value_id', 'in', [modelId, renkId, olcuId]],
    ]],
    { fields: ['id'], limit: 10 },
  ) as { id: number }[];

  if (ptavlar.length === 3) {
    const key = ptavKey(ptavlar.map((p) => p.id));
    const variants = await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', tmplId]]],
      { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
    ) as { id: number; product_template_attribute_value_ids: number[] }[];

    const match = variants.find(
      (v) => ptavKey(v.product_template_attribute_value_ids ?? []) === key,
    );
    if (match) return match.id;
  }

  // Bulunamadıysa: varyant, MODEL'e göre bölünmüş bir alt şablonda olabilir
  // (bkz. importVaryantlarSplitByModel — "{Ürün Adı} {MODEL}" şablonu, sadece
  // RENK×ÖLÇÜ niteliğiyle). Ana şablonun adını okuyup o alt şablonu ara.
  const anaSablon = (await execute(
    'product.template', 'read', [[tmplId]], { fields: ['name'] },
  ) as { name: string }[])[0];
  if (!anaSablon) return null;

  const splitAdi = `${anaSablon.name.trim()} ${model.trim()}`.trim();
  const splitTmpl = (await execute(
    'product.template', 'search_read',
    [[['name', '=', splitAdi]]], { fields: ['id'], limit: 1 },
  ) as { id: number }[])[0];
  if (!splitTmpl) return null;

  const splitPtavlar = await execute(
    'product.template.attribute.value', 'search_read',
    [[
      ['product_tmpl_id', '=', splitTmpl.id],
      ['product_attribute_value_id', 'in', [renkId, olcuId]],
    ]],
    { fields: ['id'], limit: 10 },
  ) as { id: number }[];
  if (splitPtavlar.length < 2) return null;
  const splitKey = ptavKey(splitPtavlar.map((p) => p.id));

  const splitVariants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', splitTmpl.id]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
  ) as { id: number; product_template_attribute_value_ids: number[] }[];

  const splitMatch = splitVariants.find(
    (v) => ptavKey(v.product_template_attribute_value_ids ?? []) === splitKey,
  );
  return splitMatch?.id ?? null;
}

// ── Cam / Lens gibi Model-Renk-Ölçü niteliği OLMAYAN kategoriler için:
// attribute matrisine hiç girmeden, her barkodu doğrudan şablonun tekil
// varyantına (veya gerekiyorsa yeni bir product.product'a) bağlar.
export type TekVaryantImportSatir = { index: number; barkod: string; fiyat: number };

export async function importTekVaryantlarForTemplate(
  tmplId: number,
  satirlar: TekVaryantImportSatir[],
): Promise<VaryantImportSonuc> {
  const varyantIdByKey = new Map<string, number>();
  const hatalar: { index: number; sebep: string }[] = [];
  let olusturulan = 0;

  const mevcutVaryantlar = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)]]],
    { fields: ['id', 'barcode'], limit: 50 },
  ) as { id: number; barcode: string | false }[];

  // Odoo, attribute satırı olmayan bir şablon için otomatik olarak barkodsuz
  // TEK bir varsayılan varyant oluşturur — ilk satırı ona yazıyoruz.
  let bosVaryant = mevcutVaryantlar.find((v) => !v.barcode) ?? null;

  for (const satir of satirlar) {
    const barkod = satir.barkod.trim();
    try {
      const eslesen = mevcutVaryantlar.find((v) => v.barcode && v.barcode.trim() === barkod);
      if (eslesen) {
        varyantIdByKey.set(barkod, eslesen.id);
        continue;
      }

      if (bosVaryant) {
        await execute(
          'product.product', 'write',
          [[bosVaryant.id], { barcode: barkod || false, lst_price: satir.fiyat || 0 }],
        );
        varyantIdByKey.set(barkod, bosVaryant.id);
        mevcutVaryantlar.push({ id: bosVaryant.id, barcode: barkod });
        bosVaryant = null;
        olusturulan++;
        continue;
      }

      // Bu şablonda zaten barkodlu bir (tek) varyant var ve Model/Renk/Ölçü
      // olmadığı için ek bir varyant açacak nitelik yok — aynı "Ürün Adı"
      // altında ikinci bir barkod için ürün adının benzersiz olması gerekir.
      hatalar.push({
        index: satir.index,
        sebep: 'Bu ürün adında zaten farklı barkodlu bir kayıt var — Cam/Lens ürünlerinde her farklı ürün için "Ürün Adı" benzersiz olmalı',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
      hatalar.push({ index: satir.index, sebep: msg });
    }
  }

  return {
    varyantIdByKey,
    olusturulan,
    zatenMevcut: 0,
    hatalar,
    sonuclar: [],
    otomatikTemizlenen: 0,
    kalanVaryant: mevcutVaryantlar.length,
  };
}

export async function findTekVariantProductId(tmplId: number, barkod: string): Promise<number | null> {
  const trimmed = barkod.trim();
  if (!trimmed) return null;
  const found = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)], ['barcode', '=', trimmed]]],
    { fields: ['id'], limit: 1 },
  ) as { id: number }[];
  return found.length ? found[0].id : null;
}

export async function guncelleVaryantFiyatlari(
  varyantId: number,
  satisFiyati: number,
  maliyetFiyati: number,
  barkod?: string,
): Promise<void> {
  await execute('product.product', 'write', [
    [varyantId],
    {
      barcode: barkod?.trim() || false,
      lst_price: Number(satisFiyati) || 0,
      standard_price: Number(maliyetFiyati) || 0,
    },
  ]);
}

export async function createEnvanterSablon(input: {
  kategori: string;
  urunAdi: string;
  satisFiyati: number;
  maliyetFiyati: number;
  kdvOrani?: number;
}): Promise<number> {
  let categId: number | false = false;
  if (input.kategori?.trim()) {
    const resolved = await resolveOrCreateCategoryId(input.kategori);
    categId = resolved.id;
  }

  const tmplData: Record<string, unknown> = {
    name: input.urunAdi.trim(),
    type: 'product',
    categ_id: categId,
    list_price: Number(input.satisFiyati) || 0,
    standard_price: Number(input.maliyetFiyati) || 0,
    sale_ok: true,
    purchase_ok: true,
    tracking: 'serial',
  };

  if (input.kdvOrani != null && Number.isFinite(input.kdvOrani)) {
    const taxes = await execute(
      'account.tax', 'search_read',
      [[['type_tax_use', '=', 'sale'], ['amount', '=', Number(input.kdvOrani)]]],
      { fields: ['id'], limit: 1 },
    ) as { id: number }[];
    if (taxes.length) tmplData.taxes_id = [[6, 0, [taxes[0].id]]];
  }

  return Number(await execute('product.template', 'create', [tmplData]));
}

export { varyantKey };
