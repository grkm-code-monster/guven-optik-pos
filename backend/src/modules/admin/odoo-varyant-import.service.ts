import { execute } from '../odoo/odoo.service';
import { resolveOrCreateCategoryId } from '../odoo/odoo-category.util';
import { ptavKey, temizleImportSonrasiVaryantlar } from './varyant-import-temizlik.service';

export type VaryantImportSatir = {
  index: number;
  model: string;
  renk: string;
  olcu: string;
  barkod: string;
  fiyat: number;
};

export type VaryantImportSonuc = {
  varyantIdByKey: Map<string, number>;
  olusturulan: number;
  hatalar: { index: number; sebep: string }[];
  otomatikTemizlenen: number;
  kalanVaryant: number;
};

function varyantKey(model: string, renk: string, olcu: string): string {
  return `${model.trim().toUpperCase()}|${renk.trim().toUpperCase()}|${olcu.trim().toUpperCase()}`;
}

export async function importVaryantlarForTemplate(
  tmplId: number,
  satirlar: VaryantImportSatir[],
): Promise<VaryantImportSonuc> {
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

  const mevcutLines = await execute(
    'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)]]],
    { fields: ['id', 'attribute_id', 'value_ids'] },
  ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

  const lineMap = new Map<number, { id: number; value_ids: number[] }>();
  for (const line of mevcutLines) {
    const attrId = line.attribute_id[0];
    if (!lineMap.has(attrId)) {
      lineMap.set(attrId, { id: line.id, value_ids: line.value_ids });
    } else {
      await execute('product.template.attribute.line', 'unlink', [[line.id]]);
    }
  }

  for (const attrId of [modelAttrId, renkAttrId, olcuAttrId]) {
    if (!lineMap.has(attrId)) {
      lineMap.set(attrId, { id: -1, value_ids: [] });
    }
  }

  type ParsedRow = VaryantImportSatir & {
    modelId: number;
    renkId: number;
    olcuId: number;
  };

  const parsedRows: ParsedRow[] = [];
  const hatalar: { index: number; sebep: string }[] = [];
  const attrUniqueValues = new Map<number, Set<number>>();

  for (const satir of satirlar) {
    if (!satir.model?.trim() || !satir.renk?.trim() || !satir.olcu?.trim()) {
      hatalar.push({ index: satir.index, sebep: 'Model, renk veya ölçü boş' });
      continue;
    }

    try {
      const modelId = await getOrCreateDeger(modelAttrId, satir.model);
      const renkId = await getOrCreateDeger(renkAttrId, satir.renk);
      const olcuId = await getOrCreateDeger(olcuAttrId, satir.olcu);

      const track = (attrId: number, valueId: number) => {
        if (!attrUniqueValues.has(attrId)) attrUniqueValues.set(attrId, new Set());
        attrUniqueValues.get(attrId)!.add(valueId);
      };
      track(modelAttrId, modelId);
      track(renkAttrId, renkId);
      track(olcuAttrId, olcuId);

      parsedRows.push({
        ...satir,
        modelId,
        renkId,
        olcuId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
      hatalar.push({ index: satir.index, sebep: msg });
    }
  }

  for (const [attrId, valueSet] of attrUniqueValues) {
    const valueIds = [...valueSet];
    const line = lineMap.get(attrId);
    if (!line || line.id === -1) {
      const lineId = Number(await execute(
        'product.template.attribute.line', 'create',
        [{
          product_tmpl_id: Number(tmplId),
          attribute_id: attrId,
          value_ids: [[6, 0, valueIds]],
        }],
      ));
      lineMap.set(attrId, { id: lineId, value_ids: valueIds });
    } else {
      const merged = [...new Set([...line.value_ids, ...valueIds])];
      if (merged.length !== line.value_ids.length
        || merged.some((id) => !line.value_ids.includes(id))) {
        await execute(
          'product.template.attribute.line', 'write',
          [[line.id], { value_ids: [[6, 0, merged]] }],
        );
        lineMap.set(attrId, { id: line.id, value_ids: merged });
      }
    }
  }

  const varyantIdByKey = new Map<string, number>();
  const korunanPtavKeys = new Set<string>();
  const korunanVaryantIds = new Set<number>();
  let olusturulan = 0;

  for (const row of parsedRows) {
    try {
      const ptavlar = await execute(
        'product.template.attribute.value', 'search_read',
        [[
          ['product_tmpl_id', '=', Number(tmplId)],
          ['product_attribute_value_id', 'in', [row.modelId, row.renkId, row.olcuId]],
        ]],
        { fields: ['id', 'product_attribute_value_id'] },
      ) as { id: number; product_attribute_value_id: [number, string] }[];

      const modelPtav = ptavlar.find((p) => p.product_attribute_value_id[0] === row.modelId);
      const renkPtav = ptavlar.find((p) => p.product_attribute_value_id[0] === row.renkId);
      const olcuPtav = ptavlar.find((p) => p.product_attribute_value_id[0] === row.olcuId);

      if (!modelPtav || !renkPtav || !olcuPtav) {
        hatalar.push({ index: row.index, sebep: 'PTAV bulunamadı' });
        continue;
      }

      const ptavIds = [modelPtav.id, renkPtav.id, olcuPtav.id];
      const key = ptavKey(ptavIds);
      korunanPtavKeys.add(key);

      const vKey = varyantKey(row.model, row.renk, row.olcu);

      const mevcutVaryantlar = await execute(
        'product.product', 'search_read',
        [[['product_tmpl_id', '=', Number(tmplId)]]],
        { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
      ) as { id: number; product_template_attribute_value_ids: number[] }[];

      const mevcutEslesen = mevcutVaryantlar.find(
        (v) => ptavKey(v.product_template_attribute_value_ids ?? []) === key,
      );

      if (mevcutEslesen) {
        korunanVaryantIds.add(mevcutEslesen.id);
        varyantIdByKey.set(vKey, mevcutEslesen.id);
        continue;
      }

      const varyantId = Number(await execute(
        'product.product', 'create',
        [{
          product_tmpl_id: Number(tmplId),
          product_template_attribute_value_ids: [[6, 0, ptavIds]],
          barcode: row.barkod || false,
          lst_price: row.fiyat || 0,
        }],
      ));
      korunanVaryantIds.add(varyantId);
      varyantIdByKey.set(vKey, varyantId);
      olusturulan++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
      hatalar.push({ index: row.index, sebep: msg });
    }
  }

  const temizlik = await temizleImportSonrasiVaryantlar(
    Number(tmplId),
    korunanPtavKeys,
    korunanVaryantIds,
  );

  return {
    varyantIdByKey,
    olusturulan,
    hatalar,
    otomatikTemizlenen: temizlik.temizlenen,
    kalanVaryant: temizlik.kalanVaryant,
  };
}

export async function findVariantProductId(
  tmplId: number,
  model: string,
  renk: string,
  olcu: string,
): Promise<number | null> {
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

  if (ptavlar.length < 3) return null;
  const key = ptavKey(ptavlar.map((p) => p.id));

  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
  ) as { id: number; product_template_attribute_value_ids: number[] }[];

  const match = variants.find(
    (v) => ptavKey(v.product_template_attribute_value_ids ?? []) === key,
  );
  return match?.id ?? null;
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
    hatalar,
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
