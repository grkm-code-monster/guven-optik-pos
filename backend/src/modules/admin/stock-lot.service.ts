import { execute } from '../odoo/odoo.service';

export async function isLotAvailableForReceipt(
  lotId: number,
  companyId?: number,
  excludePickingId?: number,
): Promise<{ available: boolean; reason?: string }> {
  const cid = companyId && companyId > 0 ? companyId : undefined;

  const doneMls = await execute(
    'stock.move.line',
    'search_read',
    [[['lot_id', '=', lotId], ['state', '=', 'done']]],
    { fields: ['id', 'picking_id'], limit: 3 },
    cid,
  );
  if (doneMls?.length) {
    const pickName = doneMls[0].picking_id?.[1] ?? doneMls[0].picking_id?.[0];
    return { available: false, reason: `Seri no zaten teslim alınmış (picking: ${pickName})` };
  }

  const openMls = await execute(
    'stock.move.line',
    'search_read',
    [[['lot_id', '=', lotId], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'picking_id', 'state'], limit: 5 },
    cid,
  );
  for (const ml of openMls ?? []) {
    const pickId = ml.picking_id?.[0];
    if (excludePickingId && pickId === excludePickingId) continue;
    const pickName = ml.picking_id?.[1] ?? pickId;
    return { available: false, reason: `Seri no başka picking'de kullanımda: ${pickName} (ml ${ml.id})` };
  }

  const quants = await execute(
    'stock.quant',
    'search_read',
    [[['lot_id', '=', lotId], ['quantity', '>', 0]]],
    { fields: ['location_id', 'quantity'], limit: 5 },
    cid,
  );
  for (const q of quants ?? []) {
    const locName = String(q.location_id?.[1] ?? '');
    if (!locName.toLowerCase().includes('vendor')) {
      return { available: false, reason: `Seri no stokta: ${locName} (qty=${q.quantity})` };
    }
  }

  return { available: true };
}

export async function getOrCreateStockLot(
  lotNo: string,
  productId: number,
  companyId?: number,
  barkod?: string,
  utsKodu?: string,
): Promise<{ lotId: number; created: boolean }> {
  const cid = companyId && companyId > 0 ? companyId : undefined;
  const lotDomain: unknown[] = [['name', '=', lotNo], ['product_id', '=', productId]];
  if (cid) lotDomain.push(['company_id', '=', cid]);
  const existing = await execute(
    'stock.lot',
    'search_read',
    [lotDomain],
    { fields: ['id', 'company_id'], limit: 1 },
    cid,
  );
  if (existing?.[0]?.id) {
    if (utsKodu) {
      const mevcut = await execute(
        'stock.lot',
        'read',
        [[existing[0].id]],
        { fields: ['x_uts_kodu'] },
        cid,
      ) as { x_uts_kodu?: string | false | null }[];
      const mevcutUts = mevcut?.[0]?.x_uts_kodu;
      const mevcutBos = mevcutUts === false || mevcutUts == null
        || String(mevcutUts).trim() === '';
      if (mevcutBos) {
        await execute(
          'stock.lot',
          'write',
          [[existing[0].id], { x_uts_kodu: utsKodu }],
          {},
          cid,
        );
      }
    }
    return { lotId: existing[0].id, created: false };
  }

  const lotVals: Record<string, unknown> = { name: lotNo, product_id: productId };
  if (barkod) lotVals.ref = barkod;
  if (utsKodu) lotVals.x_uts_kodu = utsKodu;
  if (cid) lotVals.company_id = cid;

  const lotId = Number(await execute('stock.lot', 'create', [lotVals], {}, cid));
  return { lotId, created: true };
}

/** Yeni oluşturulmuş ve stoğa yazılamamış lot'u temizler */
export async function rollbackCreatedLot(
  lotId: number,
  companyId?: number,
): Promise<void> {
  const cid = companyId && companyId > 0 ? companyId : undefined;
  const quants = await execute(
    'stock.quant',
    'search_count',
    [[['lot_id', '=', lotId], ['quantity', '!=', 0]]],
    {},
    cid,
  );
  if (Number(quants) > 0) return;

  const moves = await execute(
    'stock.move.line',
    'search_count',
    [[['lot_id', '=', lotId]]],
    {},
    cid,
  );
  if (Number(moves) > 0) return;

  await execute('stock.lot', 'unlink', [[lotId]], {}, cid);
}
