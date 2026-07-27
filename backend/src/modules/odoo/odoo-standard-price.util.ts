import { execute, ODOO_ALL_COMPANY_IDS } from './odoo.service';

type StandardPriceModel = 'product.template' | 'product.product';

function uniqueCompanyIds(...ids: Array<number | undefined>): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (id != null && id > 0 && !out.includes(id)) out.push(id);
  }
  for (const id of ODOO_ALL_COMPANY_IDS) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Company-dependent standard_price — pozitif değer bulan ilk şirket bağlamını döner */
export async function resolveStandardPriceAcrossCompanies(
  model: StandardPriceModel,
  recordId: number,
  preferredCompanyIds: number[] = [],
): Promise<{ price: number; companyId?: number }> {
  const companyIds = uniqueCompanyIds(...preferredCompanyIds);

  for (const companyId of companyIds) {
    try {
      const rows = (await execute(
        model,
        'read',
        [[recordId]],
        { fields: ['standard_price'] },
        companyId,
      )) as Array<{ standard_price?: number }>;
      const price = Number(rows[0]?.standard_price ?? 0);
      if (price > 0) {
        return { price, companyId };
      }
    } catch {
      // sonraki şirket bağlamını dene
    }
  }

  return { price: 0 };
}

/** Stok Yönetimi güncellemesi — tüm şirket bağlamlarına aynı maliyeti yazar */
export async function writeStandardPriceAllCompanies(
  model: StandardPriceModel,
  recordId: number,
  price: number,
): Promise<void> {
  for (const companyId of ODOO_ALL_COMPANY_IDS) {
    try {
      await execute(model, 'write', [[recordId], { standard_price: price }], {}, companyId);
    } catch (err) {
      console.warn(
        `[odoo-standard-price] write ${model}#${recordId} company=${companyId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function resolveTemplateStandardPriceMap(
  templateIds: number[],
  preferredCompanyIds: number[] = [],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!templateIds.length) return map;

  const companyIds = uniqueCompanyIds(...preferredCompanyIds);
  const unresolved = new Set(templateIds);
  const BATCH = 100;

  for (const companyId of companyIds) {
    if (!unresolved.size) break;
    const ids = [...unresolved];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      try {
        const rows = (await execute(
          'product.template',
          'read',
          [batch],
          { fields: ['id', 'standard_price'] },
          companyId,
        )) as Array<{ id: number; standard_price?: number }>;
        for (const row of rows) {
          const price = Number(row.standard_price ?? 0);
          if (price > 0) {
            map.set(row.id, price);
            unresolved.delete(row.id);
          }
        }
      } catch {
        // sonraki şirket bağlamını dene
      }
    }
  }

  for (const id of templateIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

function m2oId(v: unknown): number | null {
  if (Array.isArray(v) && v.length) return Number(v[0]) || null;
  if (typeof v === 'number') return v;
  return null;
}

export type TemplateVariantAverages = {
  ortalamaSatis: number;
  ortalamaMaliyet: number;
  varyantSayisi: number;
};

async function resolveVariantStandardPriceMap(variantIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!variantIds.length) return map;

  const unresolved = new Set(variantIds);
  const BATCH = 100;
  const companyIds = uniqueCompanyIds();

  for (const companyId of companyIds) {
    if (!unresolved.size) break;
    const ids = [...unresolved];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      try {
        const rows = (await execute(
          'product.product',
          'read',
          [batch],
          { fields: ['id', 'standard_price'] },
          companyId,
        )) as Array<{ id: number; standard_price?: number }>;
        for (const row of rows) {
          const price = Number(row.standard_price ?? 0);
          if (price > 0 && !map.has(row.id)) {
            map.set(row.id, price);
            unresolved.delete(row.id);
          }
        }
      } catch {
        // sonraki şirket bağlamını dene
      }
    }
  }

  for (const id of variantIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

/** Çok varyantlı şablonlar için varyant lst_price / standard_price ortalaması */
export async function resolveTemplateVariantAverages(
  templateIds: number[],
): Promise<Map<number, TemplateVariantAverages>> {
  const map = new Map<number, TemplateVariantAverages>();
  if (!templateIds.length) return map;

  const BATCH = 100;
  const variantsByTmpl = new Map<number, Array<{ id: number; lst_price: number }>>();

  for (let i = 0; i < templateIds.length; i += BATCH) {
    const batch = templateIds.slice(i, i + BATCH);
    const variants = (await execute(
      'product.product',
      'search_read',
      [[['product_tmpl_id', 'in', batch]]],
      {
        fields: ['id', 'product_tmpl_id', 'lst_price'],
        limit: 5000,
        context: { active_test: false },
      },
    )) ?? [];

    for (const v of variants) {
      const tmplId = m2oId(v.product_tmpl_id);
      if (!tmplId) continue;
      if (!variantsByTmpl.has(tmplId)) variantsByTmpl.set(tmplId, []);
      variantsByTmpl.get(tmplId)!.push({
        id: v.id,
        lst_price: Number(v.lst_price) || 0,
      });
    }
  }

  const allVariantIds = [...variantsByTmpl.values()].flat().map((v) => v.id);
  const costMap = await resolveVariantStandardPriceMap(allVariantIds);

  for (const tmplId of templateIds) {
    const variants = variantsByTmpl.get(tmplId) ?? [];
    const count = variants.length;
    if (!count) {
      map.set(tmplId, { ortalamaSatis: 0, ortalamaMaliyet: 0, varyantSayisi: 0 });
      continue;
    }
    const satisToplam = variants.reduce((sum, v) => sum + v.lst_price, 0);
    const maliyetToplam = variants.reduce((sum, v) => sum + (costMap.get(v.id) ?? 0), 0);
    map.set(tmplId, {
      ortalamaSatis: Math.round((satisToplam / count) * 100) / 100,
      ortalamaMaliyet: Math.round((maliyetToplam / count) * 100) / 100,
      varyantSayisi: count,
    });
  }

  return map;
}
