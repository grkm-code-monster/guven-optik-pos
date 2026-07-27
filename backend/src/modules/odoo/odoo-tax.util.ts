import { buildOdooTaxAccessContext, execute, ODOO_ALL_COMPANY_IDS, ODOO_TAX_CHART_COMPANY_ID } from './odoo.service';

export { ODOO_TAX_CHART_COMPANY_ID };

const taxCache = new Map<string, number>();

function cacheKey(
  companyId: number,
  taxRate: number,
  type: 'sale' | 'purchase',
  priceInclude: boolean,
): string {
  return `${companyId}:${type}:${taxRate}:${priceInclude ? 1 : 0}`;
}

async function resolveTaxGroupId(rate: number, companyId: number): Promise<number | undefined> {
  // Önce aynı oran + type’taki mevcut vergiden grup kopyala
  const existing = await execute(
    'account.tax',
    'search_read',
    [[
      ['amount_type', '=', 'percent'],
      ['amount', '=', rate],
      ['company_id', '=', companyId],
      ['active', '=', true],
    ]],
    { fields: ['id', 'tax_group_id'], limit: 1, context: buildOdooTaxAccessContext(companyId) },
    companyId,
  );
  const fromTax = existing[0]?.tax_group_id?.[0];
  if (fromTax) return Number(fromTax);

  const groupName =
    rate === 20 ? 'VAT %20'
      : rate === 10 ? 'VAT %10'
        : rate === 1 ? 'VAT %1'
          : `VAT %${rate}`;

  const groups = await execute(
    'account.tax.group',
    'search_read',
    [[['name', '=', groupName], ['company_id', '=', companyId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  if (groups[0]?.id) return Number(groups[0].id);

  const anyGroup = await execute(
    'account.tax.group',
    'search_read',
    [[['company_id', '=', companyId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  return anyGroup[0]?.id ? Number(anyGroup[0].id) : undefined;
}

type ChartTaxTemplate = {
  id: number;
  name: string;
  amount: number;
  amount_type: string;
  type_tax_use: string;
  price_include: boolean;
  tax_group_id?: [number, string];
};

async function findChartTaxTemplate(opts: {
  taxRate: number;
  typeTaxUse: 'sale' | 'purchase';
  priceInclude: boolean;
}): Promise<ChartTaxTemplate | null> {
  const fields = ['id', 'name', 'amount', 'amount_type', 'type_tax_use', 'price_include', 'tax_group_id'];
  const baseDomain = [
    ['type_tax_use', '=', opts.typeTaxUse],
    ['amount_type', '=', 'percent'],
    ['amount', '=', opts.taxRate],
    ['company_id', '=', ODOO_TAX_CHART_COMPANY_ID],
    ['active', '=', true],
  ] as unknown[];

  const exact = await execute(
    'account.tax',
    'search_read',
    [[...baseDomain, ['price_include', '=', opts.priceInclude]]],
    { fields, limit: 1 },
    ODOO_TAX_CHART_COMPANY_ID,
  );
  if (exact[0]?.id) return exact[0] as ChartTaxTemplate;

  const relaxed = await execute(
    'account.tax',
    'search_read',
    [baseDomain],
    { fields, limit: 1 },
    ODOO_TAX_CHART_COMPANY_ID,
  );
  return relaxed[0]?.id ? (relaxed[0] as ChartTaxTemplate) : null;
}

async function ensureTaxGroupForCompany(
  rate: number,
  companyId: number,
  template?: ChartTaxTemplate | null,
): Promise<number | undefined> {
  const existing = await resolveTaxGroupId(rate, companyId);
  if (existing) return existing;

  const groupName = template?.tax_group_id?.[1]
    ?? (rate === 20 ? 'VAT %20' : rate === 10 ? 'VAT %10' : rate === 1 ? 'VAT %1' : `VAT %${rate}`);

  try {
    const groupId = Number(await execute(
      'account.tax.group',
      'create',
      [{ name: groupName, company_id: companyId }],
      {},
      companyId,
    ));
    return groupId > 0 ? groupId : undefined;
  } catch (err) {
    console.warn(`[odoo-tax] tax.group create hata (company=${companyId}):`, err instanceof Error ? err.message : err);
    return resolveTaxGroupId(rate, companyId);
  }
}

async function searchCompanyTax(
  companyId: number,
  opts: {
    taxRate: number;
    typeTaxUse: 'sale' | 'purchase';
    priceInclude?: boolean;
  },
): Promise<number | null> {
  const domain: unknown[] = [
    ['type_tax_use', '=', opts.typeTaxUse],
    ['amount_type', '=', 'percent'],
    ['amount', '=', opts.taxRate],
    ['company_id', '=', companyId],
    ['active', '=', true],
  ];
  if (opts.priceInclude !== undefined) {
    domain.push(['price_include', '=', opts.priceInclude]);
  }

  const rows = await execute(
    'account.tax',
    'search_read',
    [domain],
    { fields: ['id'], limit: 1, context: buildOdooTaxAccessContext(companyId) },
    companyId,
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function createCompanyTaxFromTemplate(opts: {
  companyId: number;
  taxRate: number;
  typeTaxUse: 'sale' | 'purchase';
  priceInclude: boolean;
}): Promise<number | null> {
  const { companyId, taxRate, typeTaxUse, priceInclude } = opts;
  const template = await findChartTaxTemplate({ taxRate, typeTaxUse, priceInclude });
  const taxGroupId = await ensureTaxGroupForCompany(taxRate, companyId, template);

  const dahilSuffix = priceInclude ? ' Dahil' : '';
  const tipLabel = typeTaxUse === 'sale' ? 'Satış' : 'Alış';
  const fallbackName = `KDV %${taxRate}${dahilSuffix} (${tipLabel})`;
  const name = template?.name ?? fallbackName;

  const vals: Record<string, unknown> = {
    name,
    amount: taxRate,
    amount_type: template?.amount_type ?? 'percent',
    type_tax_use: typeTaxUse,
    price_include: priceInclude,
    company_id: companyId,
  };
  if (taxGroupId) vals.tax_group_id = taxGroupId;

  try {
    const taxId = Number(await execute(
      'account.tax',
      'create',
      [vals],
      { context: buildOdooTaxAccessContext(companyId) },
      companyId,
    ));
    if (taxId > 0) {
      console.log(
        `[odoo-tax] oluşturuldu: ${name} id=${taxId} company=${companyId}` +
        (template ? ` (chart şablon #${template.id})` : ''),
      );
      return taxId;
    }
  } catch (err) {
    console.warn(`[odoo-tax] create hata (${name}, company=${companyId}):`, err instanceof Error ? err.message : err);
  }
  return null;
}

/**
 * Şirket + oran ile Odoo account.tax bulur; yoksa chart şablonundan hedef şirkette oluşturur.
 * POS: priceInclude=true (fiyat KDV dahil).
 * Transfer: priceInclude=false (matrah + KDV).
 */
export async function resolveOdooTaxId(opts: {
  companyId: number;
  taxRate: number;
  typeTaxUse: 'sale' | 'purchase';
  priceInclude: boolean;
}): Promise<number | null> {
  const rate = Number(opts.taxRate);
  if (!Number.isFinite(rate) || rate < 0) return null;

  const targetCompanyId = opts.companyId;
  const key = cacheKey(targetCompanyId, rate, opts.typeTaxUse, opts.priceInclude);
  const cached = taxCache.get(key);
  if (cached) return cached;

  let taxId = await searchCompanyTax(targetCompanyId, {
    taxRate: rate,
    typeTaxUse: opts.typeTaxUse,
    priceInclude: opts.priceInclude,
  });

  if (!taxId && !opts.priceInclude) {
    taxId = await searchCompanyTax(targetCompanyId, {
      taxRate: rate,
      typeTaxUse: opts.typeTaxUse,
    });
  }

  if (!taxId) {
    taxId = await createCompanyTaxFromTemplate({
      companyId: targetCompanyId,
      taxRate: rate,
      typeTaxUse: opts.typeTaxUse,
      priceInclude: opts.priceInclude,
    });
  }

  if (taxId) {
    taxCache.set(key, taxId);
    return taxId;
  }

  return null;
}

export async function resolveSaleTaxIdIncluded(
  companyId: number,
  taxRate: number,
): Promise<number | null> {
  return resolveOdooTaxId({
    companyId,
    taxRate,
    typeTaxUse: 'sale',
    priceInclude: true,
  });
}

export async function resolveSaleTaxIdExcluded(
  companyId: number,
  taxRate: number,
): Promise<number | null> {
  return resolveOdooTaxId({
    companyId,
    taxRate,
    typeTaxUse: 'sale',
    priceInclude: false,
  });
}

export async function resolvePurchaseTaxId(
  companyId: number,
  taxRate: number,
): Promise<number | null> {
  return resolveOdooTaxId({
    companyId,
    taxRate,
    typeTaxUse: 'purchase',
    priceInclude: false,
  });
}

/** NG / ADESE / POTENTIAL için eksik vergi kayıtlarını chart şablonundan oluşturur */
export async function ensureStandardCompanyTaxes(
  companyIds: number[] = [2, 3, 4],
  rates: number[] = [20],
): Promise<Array<{ companyId: number; type: string; rate: number; priceInclude: boolean; taxId: number | null }>> {
  const results: Array<{ companyId: number; type: string; rate: number; priceInclude: boolean; taxId: number | null }> = [];
  for (const companyId of companyIds) {
    for (const rate of rates) {
      for (const spec of [
        { fn: () => resolveSaleTaxIdExcluded(companyId, rate), type: 'sale', priceInclude: false },
        { fn: () => resolveSaleTaxIdIncluded(companyId, rate), type: 'sale', priceInclude: true },
        { fn: () => resolvePurchaseTaxId(companyId, rate), type: 'purchase', priceInclude: false },
      ]) {
        const taxId = await spec.fn();
        results.push({ companyId, type: spec.type, rate, priceInclude: spec.priceInclude, taxId });
      }
    }
  }
  return results;
}

/**
 * POS satırı: KDV dahil birim fiyat → Odoo tax_id + price_unit.
 * Tercihen price_include=true vergi; yoksa matraha çevirip price_include=false kullanır.
 * Toplam tutar değişmez.
 */
export async function resolvePosLineTax(opts: {
  companyId: number;
  taxRate: number;
  unitPriceInclusive: number;
}): Promise<{ taxId: number | null; priceUnit: number; priceInclude: boolean }> {
  const rate = Number(opts.taxRate);
  const inclusive = Number(opts.unitPriceInclusive) || 0;
  const includedId = await resolveSaleTaxIdIncluded(opts.companyId, rate);
  if (includedId) {
    return { taxId: includedId, priceUnit: inclusive, priceInclude: true };
  }
  const excludedId = await resolveSaleTaxIdExcluded(opts.companyId, rate);
  if (excludedId && rate > 0) {
    const exclusive = Math.round((inclusive / (1 + rate / 100)) * 10000) / 10000;
    return { taxId: excludedId, priceUnit: exclusive, priceInclude: false };
  }
  return { taxId: excludedId, priceUnit: inclusive, priceInclude: false };
}

function uniqueTaxCompanyIds(...ids: Array<number | undefined>): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (id != null && id > 0 && !out.includes(id)) out.push(id);
  }
  for (const id of ODOO_ALL_COMPANY_IDS) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

async function readSaleTaxRateFromTaxIds(
  taxIds: number[],
  companyId: number,
): Promise<number | null> {
  if (!taxIds.length) return null;
  const taxes = await execute(
    'account.tax',
    'read',
    [taxIds],
    {
      fields: ['id', 'amount', 'amount_type', 'type_tax_use'],
      context: buildOdooTaxAccessContext(companyId),
    },
    companyId,
  );
  const salePercent = (taxes as Array<{ amount?: number; amount_type?: string; type_tax_use?: string }>)
    .find((t) => t.type_tax_use === 'sale' && t.amount_type === 'percent' && Number(t.amount) > 0);
  return salePercent ? Number(salePercent.amount) : null;
}

async function readProductSaleTaxRateInCompany(
  productId: number,
  companyId: number,
): Promise<number | null> {
  const products = await execute(
    'product.product',
    'read',
    [[productId]],
    { fields: ['taxes_id'] },
    companyId,
  );
  const taxIds: number[] = products[0]?.taxes_id ?? [];
  return readSaleTaxRateFromTaxIds(taxIds, companyId);
}

/** Odoo product.product satış vergisi — company-dependent; tüm şirketleri dener */
export async function readProductSaleTaxRate(
  productId: number,
  companyId?: number,
): Promise<number> {
  try {
    for (const cid of uniqueTaxCompanyIds(companyId)) {
      const rate = await readProductSaleTaxRateInCompany(productId, cid);
      if (rate != null) return rate;
    }
  } catch (err) {
    console.warn('[odoo-tax] ürün vergi oranı okunamadı:', err instanceof Error ? err.message : err);
  }
  return 20;
}

async function readTemplateSaleTaxRateInCompany(
  templateId: number,
  companyId: number,
): Promise<number | null> {
  const rows = await execute(
    'product.template',
    'read',
    [[templateId]],
    { fields: ['taxes_id'] },
    companyId,
  );
  const taxIds: number[] = rows[0]?.taxes_id ?? [];
  return readSaleTaxRateFromTaxIds(taxIds, companyId);
}

/** product.template satış KDV oranı — Stok Yönetimi listesi için */
export async function readTemplateSaleTaxRate(
  templateId: number,
  companyId?: number,
): Promise<number> {
  try {
    for (const cid of uniqueTaxCompanyIds(companyId)) {
      const rate = await readTemplateSaleTaxRateInCompany(templateId, cid);
      if (rate != null) return rate;
    }
  } catch (err) {
    console.warn('[odoo-tax] şablon vergi oranı okunamadı:', err instanceof Error ? err.message : err);
  }
  return 0;
}

export async function resolveTemplateKdvMap(
  templateIds: number[],
  preferredCompanyIds: number[] = [],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!templateIds.length) return map;

  const preferred = uniqueTaxCompanyIds(...preferredCompanyIds);
  const unresolved = new Set(templateIds);
  const BATCH = 100;

  for (const companyId of preferred) {
    if (!unresolved.size) break;
    const ids = [...unresolved];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      try {
        const rows = (await execute(
          'product.template',
          'read',
          [batch],
          { fields: ['id', 'taxes_id'] },
          companyId,
        )) as Array<{ id: number; taxes_id?: number[] }>;

        const allTaxIds = [...new Set(rows.flatMap((r) => r.taxes_id ?? []))];
        const taxRateById = new Map<number, number>();
        if (allTaxIds.length) {
          const taxes = (await execute(
            'account.tax',
            'read',
            [allTaxIds],
            {
              fields: ['id', 'amount', 'amount_type', 'type_tax_use'],
              context: buildOdooTaxAccessContext(companyId),
            },
            companyId,
          )) as Array<{ id: number; amount?: number; amount_type?: string; type_tax_use?: string }>;
          for (const t of taxes) {
            if (t.type_tax_use === 'sale' && t.amount_type === 'percent' && Number(t.amount) > 0) {
              taxRateById.set(t.id, Number(t.amount));
            }
          }
        }

        for (const row of rows) {
          const saleTaxId = (row.taxes_id ?? []).find((tid) => taxRateById.has(tid));
          if (saleTaxId != null) {
            map.set(row.id, taxRateById.get(saleTaxId)!);
            unresolved.delete(row.id);
          }
        }
      } catch (err) {
        console.warn(
          '[odoo-tax] resolveTemplateKdvMap batch hata:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  for (const id of templateIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}
