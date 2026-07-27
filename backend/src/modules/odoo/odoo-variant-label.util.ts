import { execute } from './odoo.service';

export type PtavEntry = { attrName: string; valueName: string };

function attrValueOnly(attrName: string, valueName: string): string {
  const trimmed = valueName?.trim() ?? '';
  if (!trimmed || !attrName) return trimmed;
  const prefixes = [`${attrName}: `, `${attrName}:`];
  for (const prefix of prefixes) {
    if (trimmed.length >= prefix.length && trimmed.slice(0, prefix.length).toUpperCase() === prefix.toUpperCase()) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

export function attrsFromPtavIds(
  ptavIds: number[] | undefined,
  ptavMap: Map<number, PtavEntry>,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const ptavId of ptavIds ?? []) {
    const ptav = ptavMap.get(ptavId);
    if (ptav) attrs[ptav.attrName] = ptav.valueName;
  }
  return attrs;
}

export function varyantEtiketi(attrs: Record<string, string>): string {
  const parts = [attrs.MODEL, attrs.RENK, attrs['ÖLÇÜ']].filter((s) => s?.trim());
  if (parts.length) return parts.join(' / ');
  const fromAttrs = Object.entries(attrs)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`);
  return fromAttrs.length ? fromAttrs.join(' / ') : '—';
}

export function formatVariantUrunAdi(templateName: string, attrs: Record<string, string>): string {
  const base = templateName.trim();
  const orderedKeys = ['MODEL', 'RENK', 'ÖLÇÜ'] as const;
  const ordered = orderedKeys
    .map((k) => (attrs[k] ? attrValueOnly(k, attrs[k]) : ''))
    .filter((s) => s);
  const parts = ordered.length
    ? ordered
    : Object.entries(attrs)
      .map(([k, v]) => attrValueOnly(k, v))
      .filter((s) => s);
  if (!parts.length) return base;
  return base ? `${base} (${parts.join(', ')})` : parts.join(', ');
}

export async function buildPtavMap(ptavIds: number[]): Promise<Map<number, PtavEntry>> {
  const ptavMap = new Map<number, PtavEntry>();
  const ids = [...new Set(ptavIds.filter((id) => id > 0))];
  if (!ids.length) return ptavMap;

  const ptavlar = await execute(
    'product.template.attribute.value',
    'read',
    [ids],
    { fields: ['id', 'attribute_id', 'product_attribute_value_id'] },
  );
  for (const p of ptavlar ?? []) {
    ptavMap.set(p.id, {
      attrName: p.attribute_id?.[1] ?? '',
      valueName: p.product_attribute_value_id?.[1] ?? '',
    });
  }
  return ptavMap;
}

export function buildUrunAdiFromProduct(
  product: {
    name?: string;
    display_name?: string;
    product_tmpl_id?: [number, string] | false;
    product_template_attribute_value_ids?: number[];
  },
  ptavMap: Map<number, PtavEntry>,
): string {
  const attrs = attrsFromPtavIds(product.product_template_attribute_value_ids, ptavMap);
  const tmplName = Array.isArray(product.product_tmpl_id)
    ? product.product_tmpl_id[1]
    : '';
  if (Object.keys(attrs).length) {
    return formatVariantUrunAdi(tmplName || product.name || product.display_name || '', attrs);
  }
  return product.display_name ?? product.name ?? tmplName ?? '';
}
