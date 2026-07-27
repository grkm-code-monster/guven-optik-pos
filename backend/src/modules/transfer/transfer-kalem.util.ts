import { execute } from '../odoo/odoo.service';

export type TransferKalemUtsAlanlari = {
  utsKodu?: string;
  utsFirmaKodu?: string;
};

type KalemWithLot = {
  lotId?: number | null;
  utsKodu?: string;
  utsFirmaKodu?: string;
};

function trimOrUndefined(value: unknown): string | undefined {
  if (value == null || value === false) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

/** lotId varsa stock.lot'tan x_uts_kodu (ve varsa ref) okuyup kaleme yazar */
export async function enrichKalemWithUtsFromLot<T extends KalemWithLot>(
  kalem: T,
  companyId: number,
): Promise<T & TransferKalemUtsAlanlari> {
  if (kalem.utsKodu || !kalem.lotId) {
    return kalem;
  }

  try {
    const lots = await execute(
      'stock.lot',
      'read',
      [[kalem.lotId]],
      { fields: ['id', 'x_uts_kodu', 'ref', 'name'] },
      companyId,
    ) as Array<{ x_uts_kodu?: string | false; ref?: string | false; name?: string }>;

    const lot = lots[0];
    if (!lot) return kalem;

    return {
      ...kalem,
      utsKodu: trimOrUndefined(lot.x_uts_kodu),
      utsFirmaKodu: kalem.utsFirmaKodu ?? trimOrUndefined(lot.ref),
    };
  } catch {
    return kalem;
  }
}

export async function enrichKalemlerWithUtsFromLot<T extends KalemWithLot>(
  kalemler: T[],
  companyId: number,
): Promise<Array<T & TransferKalemUtsAlanlari>> {
  return Promise.all(kalemler.map((k) => enrichKalemWithUtsFromLot(k, companyId)));
}

type TrackedKalem = {
  productId?: number;
  resolvedProductId?: number;
  lotId?: number | null;
  urunAdi?: string;
};

/** Lot/seri takipli ürünlerde lotId zorunlu — kabul aşamasında patlamasın. */
export async function assertTrackedKalemlerHaveLot(kalemler: TrackedKalem[]): Promise<string | null> {
  const ids = [...new Set(kalemler.map((k) => k.resolvedProductId ?? k.productId).filter(Boolean))] as number[];
  if (!ids.length) return null;
  const products = (await execute(
    'product.product',
    'read',
    [ids],
    { fields: ['id', 'name', 'display_name', 'tracking'] },
  )) as Array<{ id: number; name?: string; display_name?: string; tracking?: string }>;
  const trackingMap = new Map(products.map((p) => [p.id, p]));
  for (const kalem of kalemler) {
    const pid = kalem.resolvedProductId ?? kalem.productId;
    if (!pid) continue;
    const prod = trackingMap.get(pid);
    const tracking = prod?.tracking ?? 'none';
    if (tracking !== 'none' && !kalem.lotId) {
      const ad = kalem.urunAdi || prod?.display_name || prod?.name || `ürün #${pid}`;
      return `Bu ürün lot/seri takipli, transfer için lot seçilmeli: ${ad}`;
    }
  }
  return null;
}
