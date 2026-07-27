import { execute } from '../odoo/odoo.service';
import { getCompanyIdFromLokasyon, LOKASYON_ID_MAP } from '../odoo/odooLocations';

function isOdooNoneMarshalFault(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  return msg.includes('cannot marshal None unless allow_none is enabled');
}

async function applyInventoryAdjustment(quantId: number, companyId?: number): Promise<void> {
  try {
    await execute('stock.quant', 'action_apply_inventory', [[quantId]], {}, companyId);
  } catch (err) {
    // Odoo action_apply_inventory çoğu kurulumda None döner; XML-RPC allow_none kapalıysa fault atar.
    // Stok genelde yine de uygulanır — miktar doğrulaması applyStockAdjustment içinde yapılır.
    if (!isOdooNoneMarshalFault(err)) throw err;
  }
}

export async function applyStockAdjustment(input: {
  productId: number;
  locationCode: string;
  qty: number;
  quantId?: number;
}): Promise<{ quantId: number; previousQty: number; newQty: number }> {
  const locationCode = String(input.locationCode ?? '').trim().toUpperCase();
  const locationId = LOKASYON_ID_MAP[locationCode];
  if (!locationId) {
    throw new Error(`Bilinmeyen lokasyon: ${input.locationCode}`);
  }

  const companyId = getCompanyIdFromLokasyon(locationCode);
  if (!companyId) {
    throw new Error(`Lokasyon şirketi tanımsız: ${input.locationCode}`);
  }

  if (!Number.isFinite(input.productId) || input.productId <= 0) {
    throw new Error('Geçersiz productId');
  }
  if (!Number.isFinite(input.qty) || input.qty < 0) {
    throw new Error('Miktar negatif olamaz');
  }

  let quantId = input.quantId;
  let previousQty = 0;

  if (quantId) {
    const rows = await execute(
      'stock.quant',
      'read',
      [[quantId]],
      { fields: ['id', 'quantity', 'product_id', 'location_id'] },
      companyId,
    );
    const quant = rows?.[0];
    if (!quant) {
      throw new Error(`Stok kaydı bulunamadı (quant #${quantId})`);
    }
    const quantProductId = Array.isArray(quant.product_id) ? quant.product_id[0] : quant.product_id;
    const quantLocationId = Array.isArray(quant.location_id) ? quant.location_id[0] : quant.location_id;
    if (quantProductId !== input.productId) {
      throw new Error('Stok kaydı ürün eşleşmesi hatalı');
    }
    if (quantLocationId !== locationId) {
      throw new Error('Stok kaydı lokasyon eşleşmesi hatalı');
    }
    previousQty = Number(quant.quantity) || 0;
  } else {
    const quants = await execute(
      'stock.quant',
      'search_read',
      [[['product_id', '=', input.productId], ['location_id', '=', locationId]]],
      { fields: ['id', 'quantity'], limit: 20 },
      companyId,
    );

    if (quants.length === 0) {
      quantId = await execute(
        'stock.quant',
        'create',
        [{
          product_id: input.productId,
          location_id: locationId,
          inventory_quantity: input.qty,
        }],
        { context: { inventory_mode: true } },
        companyId,
      );
      previousQty = 0;
    } else if (quants.length === 1) {
      quantId = quants[0].id as number;
      previousQty = Number(quants[0].quantity) || 0;
    } else {
      throw new Error(
        'Bu ürün için birden fazla stok satırı (lot/seri) var — quantId gönderilmeli',
      );
    }
  }

  if (previousQty === input.qty) {
    const after = await execute(
      'stock.quant',
      'read',
      [[quantId!]],
      { fields: ['quantity'] },
      companyId,
    );
    return {
      quantId: quantId!,
      previousQty,
      newQty: Number(after?.[0]?.quantity) ?? input.qty,
    };
  }

  await execute(
    'stock.quant',
    'write',
    [[quantId!], { inventory_quantity: input.qty }],
    {},
    companyId,
  );

  try {
    await applyInventoryAdjustment(quantId!, companyId);
  } catch (err) {
    await execute(
      'stock.quant',
      'write',
      [[quantId!], { inventory_quantity: 0 }],
      {},
      companyId,
    ).catch(() => undefined);
    throw err;
  }

  const after = await execute(
    'stock.quant',
    'read',
    [[quantId!]],
    { fields: ['quantity'] },
    companyId,
  );
  const newQty = Number(after?.[0]?.quantity);
  if (!Number.isFinite(newQty)) {
    throw new Error('Sayım sonrası stok miktarı okunamadı');
  }
  if (Math.abs(newQty - input.qty) > 0.0001) {
    throw new Error(
      `Sayım Odoo'ya yansımadı (hedef: ${input.qty}, güncel: ${newQty}). Seri/lot takipli ürünlerde lot atanmadan miktar artırılamaz.`,
    );
  }

  return { quantId: quantId!, previousQty, newQty };
}

/** Seri/lot takipli ürünler için lot_id ile quant oluşturup sayım uygular */
export async function applyStockAdjustmentForLot(input: {
  productId: number;
  locationCode: string;
  lotId: number;
  qty?: number;
}): Promise<{ quantId: number; previousQty: number; newQty: number }> {
  const locationCode = String(input.locationCode ?? '').trim().toUpperCase();
  const locationId = LOKASYON_ID_MAP[locationCode];
  if (!locationId) throw new Error(`Bilinmeyen lokasyon: ${input.locationCode}`);

  const companyId = getCompanyIdFromLokasyon(locationCode);
  if (!companyId) throw new Error(`Lokasyon şirketi tanımsız: ${input.locationCode}`);

  const targetQty = input.qty ?? 1;

  const quants = await execute(
    'stock.quant',
    'search_read',
    [[
      ['product_id', '=', input.productId],
      ['location_id', '=', locationId],
      ['lot_id', '=', input.lotId],
    ]],
    { fields: ['id', 'quantity'], limit: 1 },
    companyId,
  );

  let quantId: number;
  if (quants.length) {
    quantId = quants[0].id as number;
  } else {
    quantId = await execute(
      'stock.quant',
      'create',
      [{
        product_id: input.productId,
        location_id: locationId,
        lot_id: input.lotId,
        inventory_quantity: targetQty,
      }],
      { context: { inventory_mode: true } },
      companyId,
    );
  }

  return applyStockAdjustment({
    productId: input.productId,
    locationCode,
    qty: targetQty,
    quantId,
  });
}
