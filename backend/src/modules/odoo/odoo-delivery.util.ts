import { execute, ODOO_ALL_COMPANY_IDS } from './odoo.service';

/** Stok quant kaydı satışın şirketinden farklı company_id altında olsa bile
 *  rezervasyon/teslimat işleminin görebilmesi için tüm şirketleri izinli kıl. */
function allCompaniesValidateKwargs(companyId: number) {
  return {
    context: {
      skip_backorder: true,
      skip_immediate: true,
      allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
      force_company: companyId,
    },
  };
}

/** Şirketin varsayılan deposu (stock.warehouse) */
export async function resolveWarehouseIdForCompany(companyId: number): Promise<number | null> {
  const rows = await execute(
    'stock.warehouse',
    'search_read',
    [[['company_id', '=', companyId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  return rows?.[0]?.id ?? null;
}

export type PickingValidateResult = {
  ok: boolean;
  errors: string[];
};

/** Satış onayı sonrası picking kaynak lokasyonunu şube stoğuna çevirip teslim eder */
export async function validateSalePickingsFromBranch(
  odooOrderId: number,
  stockLocationId: number,
  companyId: number,
): Promise<PickingValidateResult> {
  const errors: string[] = [];
  const pickings = await execute(
    'stock.picking',
    'search_read',
    [[['sale_id', '=', odooOrderId], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'state', 'name'], limit: 10 },
    companyId,
  );

  for (const picking of pickings ?? []) {
    try {
      await execute(
        'stock.picking',
        'write',
        [[picking.id], { location_id: stockLocationId }],
        {},
        companyId,
      );
      const moveIds = await execute(
        'stock.move',
        'search',
        [[['picking_id', '=', picking.id]]],
        {},
        companyId,
      );
      if (moveIds?.length) {
        await execute(
          'stock.move',
          'write',
          [moveIds, { location_id: stockLocationId }],
          {},
          companyId,
        );
      }
      const validateKwargs = allCompaniesValidateKwargs(companyId);
      await execute('stock.picking', 'action_assign', [[picking.id]], validateKwargs, companyId);
      await execute('stock.picking', 'button_validate', [[picking.id]], validateKwargs, companyId);
    } catch (err) {
      const msg = `${picking.name ?? picking.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error('[Odoo] Teslimat hatası:', msg);
    }
  }

  return { ok: errors.length === 0, errors };
}
