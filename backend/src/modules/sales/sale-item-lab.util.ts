import { LinkType, ProductCategory } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';

/** Odoo optik cam kategori ID'leri — packages/web saleMeasurements.ts ile uyumlu */
export const ODOO_OPTIK_CAM_CATEGORY_IDS = [
  4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44,
] as const;

const OPTIK_CAM_ID_SET = new Set<number>(ODOO_OPTIK_CAM_CATEGORY_IDS);

export function isOdooOptikCamCategoryId(id: number | null | undefined): boolean {
  if (id == null) return false;
  return OPTIK_CAM_ID_SET.has(id);
}

export type LabEligibleSaleItem = {
  odooCategoryId?: number | null;
  odooProductId?: string | null;
  odooProductName?: string | null;
  linkType?: LinkType | null;
  product?: { category: ProductCategory } | null;
};

export function isLabEligibleSaleItem(item: LabEligibleSaleItem): boolean {
  if (item.product?.category === ProductCategory.LENS_RX) return true;

  const catId = item.odooCategoryId ?? null;
  const inList = catId != null && OPTIK_CAM_ID_SET.has(catId);
  const hasOdooProductId = item.odooProductId != null && String(item.odooProductId).trim() !== '';
  const hasOdooProductName = item.odooProductName != null && String(item.odooProductName).trim() !== '';
  if (hasOdooProductId && inList) return true;
  if (hasOdooProductName && inList) return true;

  if (item.linkType === LinkType.FRAME_LENS || item.linkType === LinkType.CUSTOMER_FRAME) {
    return true;
  }

  return false;
}

/** Odoo'dan güncel kategori okuyup sale item'a yazar; lab uygunluk kontrolünden önce çağrılır */
export async function refreshLabCategoryFromOdoo<T extends LabEligibleSaleItem & { id?: string }>(
  item: T,
): Promise<T> {
  if (!item.odooProductId) return item;
  const pid = parseInt(String(item.odooProductId), 10);
  if (!Number.isFinite(pid)) return item;
  try {
    const rows = await execute('product.product', 'read', [[pid]], { fields: ['categ_id'] });
    const categId = rows?.[0]?.categ_id?.[0] as number | undefined;
    if (categId == null) return item;
    if (item.id) {
      await prisma.saleItem.update({ where: { id: item.id }, data: { odooCategoryId: categId } });
    }
    return { ...item, odooCategoryId: categId };
  } catch {
    return item;
  }
}
