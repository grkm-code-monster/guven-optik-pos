import { execute } from '../odoo/odoo.service';

export const ARCHIVE_DELETE_PREFIX = 'DELETE_';

const inactiveCtx = { context: { active_test: false } };

export function withArchivePrefix(value: string | false | null | undefined): string | false {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return false;
  if (trimmed.startsWith(ARCHIVE_DELETE_PREFIX)) return trimmed;
  return `${ARCHIVE_DELETE_PREFIX}${trimmed}`;
}

export function withoutArchivePrefix(value: string | false | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed.startsWith(ARCHIVE_DELETE_PREFIX)) return null;
  return trimmed.slice(ARCHIVE_DELETE_PREFIX.length);
}

type OdooCtx = { context?: { active_test?: boolean } };

export async function applyArchivePrefixToVariant(
  variantId: number,
  ctx: OdooCtx = inactiveCtx,
): Promise<void> {
  const variants = (await execute(
    'product.product',
    'read',
    [[variantId]],
    { fields: ['id', 'barcode'], ...ctx },
  )) as Array<{ id: number; barcode?: string | false }>;
  const v = variants?.[0];
  if (!v) return;

  const barcode = typeof v.barcode === 'string' ? v.barcode.trim() : '';
  const prefixedBarcode = withArchivePrefix(barcode);
  if (prefixedBarcode && prefixedBarcode !== barcode) {
    await execute('product.product', 'write', [[variantId], { barcode: prefixedBarcode }], ctx);
  }

  const lots = (await execute(
    'stock.lot',
    'search_read',
    [[['product_id', '=', variantId]]],
    { fields: ['id', 'x_uts_kodu', 'ref'], limit: 500, ...ctx },
  )) as Array<{ id: number; x_uts_kodu?: string | false; ref?: string | false }>;

  for (const lot of lots ?? []) {
    const writes: Record<string, unknown> = {};
    const uts = typeof lot.x_uts_kodu === 'string' ? lot.x_uts_kodu.trim() : '';
    const prefixedUts = withArchivePrefix(uts);
    if (prefixedUts && prefixedUts !== uts) writes.x_uts_kodu = prefixedUts;

    const ref = typeof lot.ref === 'string' ? lot.ref.trim() : '';
    const prefixedRef = withArchivePrefix(ref);
    if (prefixedRef && prefixedRef !== ref) writes.ref = prefixedRef;

    if (Object.keys(writes).length) {
      await execute('stock.lot', 'write', [[lot.id], writes], ctx);
    }
  }
}

export type RestorePrefixResult = { ok: true } | { ok: false; reason: string };

export async function restoreArchivePrefixFromVariant(
  variantId: number,
  ctx: OdooCtx = inactiveCtx,
): Promise<RestorePrefixResult> {
  const variants = (await execute(
    'product.product',
    'read',
    [[variantId]],
    { fields: ['id', 'barcode'], ...ctx },
  )) as Array<{ id: number; barcode?: string | false }>;
  const v = variants?.[0];
  if (!v) return { ok: true };

  const barcode = typeof v.barcode === 'string' ? v.barcode.trim() : '';
  const originalBarcode = withoutArchivePrefix(barcode);
  if (originalBarcode) {
    const conflict = (await execute(
      'product.product',
      'search_read',
      [[
        ['barcode', '=', originalBarcode],
        ['id', '!=', variantId],
        ['active', '=', true],
      ]],
      { fields: ['id'], limit: 1, ...ctx },
    )) as Array<{ id: number }>;
    if (conflict?.length) {
      return {
        ok: false,
        reason: `Barkod çakışıyor (${originalBarcode} — aktif kayıt #${conflict[0].id}), önek kaldırılamadı`,
      };
    }
  }

  const lots = (await execute(
    'stock.lot',
    'search_read',
    [[['product_id', '=', variantId]]],
    { fields: ['id', 'x_uts_kodu', 'ref'], limit: 500, ...ctx },
  )) as Array<{ id: number; x_uts_kodu?: string | false; ref?: string | false }>;

  for (const lot of lots ?? []) {
    const uts = typeof lot.x_uts_kodu === 'string' ? lot.x_uts_kodu.trim() : '';
    const originalUts = withoutArchivePrefix(uts);
    if (originalUts) {
      const utsConflict = Number(await execute(
        'stock.lot',
        'search_count',
        [[
          ['x_uts_kodu', '=', originalUts],
          ['id', '!=', lot.id],
        ]],
        ctx,
      ));
      if (utsConflict > 0) {
        return {
          ok: false,
          reason: `UTS kodu çakışıyor (${originalUts}), önek kaldırılamadı`,
        };
      }
    }
  }

  if (originalBarcode) {
    await execute('product.product', 'write', [[variantId], { barcode: originalBarcode }], ctx);
  }

  for (const lot of lots ?? []) {
    const writes: Record<string, unknown> = {};
    const uts = typeof lot.x_uts_kodu === 'string' ? lot.x_uts_kodu.trim() : '';
    const originalUts = withoutArchivePrefix(uts);
    if (originalUts) writes.x_uts_kodu = originalUts;

    const ref = typeof lot.ref === 'string' ? lot.ref.trim() : '';
    const originalRef = withoutArchivePrefix(ref);
    if (originalRef) writes.ref = originalRef;

    if (Object.keys(writes).length) {
      await execute('stock.lot', 'write', [[lot.id], writes], ctx);
    }
  }

  return { ok: true };
}

export async function applyArchivePrefixToVariants(
  variantIds: number[],
  ctx: OdooCtx = inactiveCtx,
): Promise<void> {
  for (const id of variantIds) {
    await applyArchivePrefixToVariant(id, ctx);
  }
}

export async function restoreArchivePrefixFromVariants(
  variantIds: number[],
  ctx: OdooCtx = inactiveCtx,
): Promise<RestorePrefixResult> {
  for (const id of variantIds) {
    const result = await restoreArchivePrefixFromVariant(id, ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}
