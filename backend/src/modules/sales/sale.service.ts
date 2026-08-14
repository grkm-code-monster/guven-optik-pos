import {
  CashMovementType,
  ItemStatus,
  LinkType,
  PaymentType,
  Prisma,
  ProductCategory,
  ProductType,
  Role,
  SaleStatus,
  ShiftStatus,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import { appendPartnerNote, execute } from '../odoo/odoo.service';
import { getCompanyIdFromLokasyon, resolveBranchStockLocationId } from '../odoo/odooLocations';
import { resolveWarehouseIdForCompany, validateSalePickingsFromBranch } from '../odoo/odoo-delivery.util';
import { ODOO_TAX_CHART_COMPANY_ID, readProductSaleTaxRate, resolvePosLineTax } from '../odoo/odoo-tax.util';
import { resolveStandardPriceAcrossCompanies } from '../odoo/odoo-standard-price.util';
import { createBildirimler } from '../bildirim/bildirim.service';
import { calculateCommission } from '../payments/commission.service';
import { tetikleSatisEFatura } from '../efatura/uyumsoft-efatura.service';
import { generateSatisReferansNo } from '../shared/referans-no.util';
import type {
  AddSaleItemInputType,
  ConfirmSaleInputType,
  CreateSaleInputType,
  UpdateDraftMetaInputType,
  VoidSaleInputType,
} from './sale.types';
import { isLabEligibleSaleItem, refreshLabCategoryFromOdoo } from './sale-item-lab.util';
import { calcInclusiveLineAmounts, resolveSaleItemTaxRate } from './sale-tax.util';
import type { JwtPayload } from '../auth/auth.types';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

function calcNearSph(farSph: Prisma.Decimal, add: Prisma.Decimal): Prisma.Decimal {
  return farSph.plus(add);
}

const ODOO_PLACEHOLDER_NAME = '__ODOO_PLACEHOLDER__';
let odooPlaceholderProductIdCache: string | null = null;

async function getOdooPlaceholderProduct() {
  if (odooPlaceholderProductIdCache) {
    const cached = await prisma.product.findUnique({ where: { id: odooPlaceholderProductIdCache } });
    if (cached) return cached;
    odooPlaceholderProductIdCache = null;
  }
  const existing = await prisma.product.findFirst({ where: { name: ODOO_PLACEHOLDER_NAME } });
  if (existing) {
    odooPlaceholderProductIdCache = existing.id;
    return existing;
  }
  const created = await prisma.product.create({
    data: {
      name: ODOO_PLACEHOLDER_NAME,
      productType: ProductType.READY,
      category: ProductCategory.ACCESSORY,
      price: new Prisma.Decimal(0),
      taxRate: new Prisma.Decimal(0),
      isActive: false,
    },
  });
  odooPlaceholderProductIdCache = created.id;
  return created;
}

async function resolveProductForInput(input: AddSaleItemInputType) {
  const raw = input.productId;
  const isOdoo = typeof raw === 'string' && raw.startsWith('odoo_');
  if (isOdoo) {
    const odooId = (input.odooProductId ?? raw.replace(/^odoo_/, '')) || null;
    const odooName = input.odooProductName ?? null;
    const local = await prisma.product.findUnique({ where: { id: raw } });
    if (local?.isActive) {
      return {
        product: local,
        resolvedProductId: local.id,
        resolvedOdooProductId: odooId,
        resolvedOdooProductName: odooName,
        isOdooPlaceholder: false,
      };
    }
    const placeholder = await getOdooPlaceholderProduct();
    // Geçici: Odoo BAKIM (kategori 63) hizmet kalemleri READY/ACCESSORY placeholder üzerinden referanslanır
    return {
      product: placeholder,
      resolvedProductId: placeholder.id,
      resolvedOdooProductId: odooId,
      resolvedOdooProductName: odooName,
      isOdooPlaceholder: true,
    };
  }
  const local = await prisma.product.findUnique({ where: { id: raw } });
  if (!local?.isActive) throw codeError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı.');
  return {
    product: local,
    resolvedProductId: local.id,
    resolvedOdooProductId: input.odooProductId ?? null,
    resolvedOdooProductName: input.odooProductName ?? null,
    isOdooPlaceholder: false,
  };
}

function isLensCategory(product: { category: ProductCategory }, input: AddSaleItemInputType) {
  if (product.category === ProductCategory.LENS_RX) return true;
  if (input.odooCategoryId != null && input.linkType) return true;
  return false;
}

export async function recalcSaleTotals(
  db: Prisma.TransactionClient | typeof prisma,
  saleId: string,
) {
  const items = await db.saleItem.findMany({
    where: { saleId, status: { not: ItemStatus.VOID } },
    include: { product: { select: { taxRate: true } } },
  });

  let taxTotal = new Prisma.Decimal(0);
  let grossTotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);

  for (const item of items) {
    const taxRateNum = await resolveSaleItemTaxRate({
      odooProductId: item.odooProductId,
      productTaxRate: item.product.taxRate,
    });
    const taxRate = new Prisma.Decimal(taxRateNum);
    const { taxAmount, lineTotal } = calcInclusiveLineAmounts({
      unitPrice: item.unitPrice,
      qty: item.qty,
      discount: item.discount,
      taxRate,
    });
    await db.saleItem.update({
      where: { id: item.id },
      data: { taxRate, taxAmount, lineTotal },
    });
    grossTotal = grossTotal.plus(item.unitPrice.times(item.qty));
    discountTotal = discountTotal.plus(item.discount);
    taxTotal = taxTotal.plus(taxAmount);
  }

  const netTotal = grossTotal.minus(discountTotal);

  return db.sale.update({
    where: { id: saleId },
    data: { grossTotal, discountTotal, taxTotal, netTotal },
  });
}

export async function createSale(userId: string, branchId: string, input: CreateSaleInputType) {
  const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
  if (!shift || shift.status !== ShiftStatus.OPEN || shift.branchId !== branchId) {
    throw codeError('SHIFT_NOT_OPEN', 'Vardiya açık olmalı.');
  }

  return prisma.sale.create({
    data: {
      customerId: input.customerId,
      userId,
      branchId,
      shiftId: input.shiftId,
      grossTotal: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      netTotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      status: SaleStatus.DRAFT,
    },
  });
}

export async function addSaleItem(saleId: string, input: AddSaleItemInputType) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (sale.status !== SaleStatus.DRAFT) throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');

  const { product, resolvedProductId, resolvedOdooProductId, resolvedOdooProductName } =
    await resolveProductForInput(input);

  if (isLensCategory(product, input)) {
    const hasLinked = Boolean(input.linkedItemId);
    const hasCustomerFrame = input.linkType === 'CUSTOMER_FRAME';
    if (!hasLinked && !hasCustomerFrame) {
      throw codeError('LENS_REQUIRES_FRAME_LINK', 'Cam kalemi bir çerçeveye bağlı olmalı.');
    }
  }

  const unitPrice = new Prisma.Decimal(input.unitPrice);
  const discount = new Prisma.Decimal(input.discount);
  const qty = input.qty;
  const taxRateNum = await resolveSaleItemTaxRate({
    inputTaxRate: (input as { taxRate?: number | null }).taxRate,
    odooProductId: resolvedOdooProductId,
    productTaxRate: product.taxRate,
  });
  const taxRate = new Prisma.Decimal(taxRateNum);

  const { taxAmount, lineTotal } = calcInclusiveLineAmounts({
    unitPrice,
    qty,
    discount,
    taxRate,
  });

  const result = await prisma.$transaction(async (tx) => {
    const saleItem = await tx.saleItem.create({
      data: {
        saleId,
        productId: resolvedProductId,
        odooCategoryId: input.odooCategoryId ?? null,
        odooProductId: resolvedOdooProductId,
        odooProductName: resolvedOdooProductName,
        lotNo: input.lotNo?.trim() || null,
        qty,
        unitPrice,
        discount,
        taxRate,
        taxAmount,
        lineTotal,
        linkedItemId: input.linkedItemId,
        linkType: input.linkType,
        status: ItemStatus.PENDING,
      },
    });

    let prescription = null as any;
    let prescriptionMissing = false;

    if (product.productType === ProductType.PRESCRIBED || input.prescription) {
      if (input.prescription) {
        const r_sph = input.prescription.r_sph ? new Prisma.Decimal(input.prescription.r_sph) : null;
        const r_add = input.prescription.r_add ? new Prisma.Decimal(input.prescription.r_add) : null;
        const l_sph = input.prescription.l_sph ? new Prisma.Decimal(input.prescription.l_sph) : null;
        const l_add = input.prescription.l_add ? new Prisma.Decimal(input.prescription.l_add) : null;

        const near_r_sph =
          r_sph && r_add ? calcNearSph(r_sph, r_add) : (input.prescription.near_r_sph ? new Prisma.Decimal(input.prescription.near_r_sph) : null);
        const near_l_sph =
          l_sph && l_add ? calcNearSph(l_sph, l_add) : (input.prescription.near_l_sph ? new Prisma.Decimal(input.prescription.near_l_sph) : null);

        prescription = await tx.prescription.create({
          data: {
            saleItemId: saleItem.id,
            prescriptionType: input.prescription.prescriptionType,
            prescriptionSource: input.prescription.prescriptionSource,
            doctorName: input.prescription.doctorName,
            prescriptionDate: input.prescription.prescriptionDate ? new Date(input.prescription.prescriptionDate) : undefined,
            eReceteCode: input.prescription.eReceteCode,

            r_pd: input.prescription.r_pd ? new Prisma.Decimal(input.prescription.r_pd) : undefined,
            r_sph: input.prescription.r_sph ? new Prisma.Decimal(input.prescription.r_sph) : undefined,
            r_cyl: input.prescription.r_cyl ? new Prisma.Decimal(input.prescription.r_cyl) : undefined,
            r_aks: input.prescription.r_aks,
            r_add: input.prescription.r_add ? new Prisma.Decimal(input.prescription.r_add) : undefined,

            l_pd: input.prescription.l_pd ? new Prisma.Decimal(input.prescription.l_pd) : undefined,
            l_sph: input.prescription.l_sph ? new Prisma.Decimal(input.prescription.l_sph) : undefined,
            l_cyl: input.prescription.l_cyl ? new Prisma.Decimal(input.prescription.l_cyl) : undefined,
            l_aks: input.prescription.l_aks,
            l_add: input.prescription.l_add ? new Prisma.Decimal(input.prescription.l_add) : undefined,

            near_r_sph: near_r_sph ?? undefined,
            near_l_sph: near_l_sph ?? undefined,

            lens_r_sph: input.prescription.lens_r_sph ? new Prisma.Decimal(input.prescription.lens_r_sph) : undefined,
            lens_r_cyl: input.prescription.lens_r_cyl ? new Prisma.Decimal(input.prescription.lens_r_cyl) : undefined,
            lens_r_aks: input.prescription.lens_r_aks,
            lens_r_bc: input.prescription.lens_r_bc ? new Prisma.Decimal(input.prescription.lens_r_bc) : undefined,
            lens_r_dia: input.prescription.lens_r_dia ? new Prisma.Decimal(input.prescription.lens_r_dia) : undefined,
            lens_r_add: input.prescription.lens_r_add ? new Prisma.Decimal(input.prescription.lens_r_add) : undefined,
            lens_r_color: input.prescription.lens_r_color,
            lens_r_brand: input.prescription.lens_r_brand,

            lens_l_sph: input.prescription.lens_l_sph ? new Prisma.Decimal(input.prescription.lens_l_sph) : undefined,
            lens_l_cyl: input.prescription.lens_l_cyl ? new Prisma.Decimal(input.prescription.lens_l_cyl) : undefined,
            lens_l_aks: input.prescription.lens_l_aks,
            lens_l_bc: input.prescription.lens_l_bc ? new Prisma.Decimal(input.prescription.lens_l_bc) : undefined,
            lens_l_dia: input.prescription.lens_l_dia ? new Prisma.Decimal(input.prescription.lens_l_dia) : undefined,
            lens_l_add: input.prescription.lens_l_add ? new Prisma.Decimal(input.prescription.lens_l_add) : undefined,
            lens_l_color: input.prescription.lens_l_color,
            lens_l_brand: input.prescription.lens_l_brand,

            solution: input.prescription.solution,
            solutionQty: input.prescription.solutionQty,
          },
        });
      } else {
        prescriptionMissing = true;
      }
    }

    let frames = [] as any[];
    if (input.frames?.length) {
      frames = await Promise.all(
        input.frames.map((f) =>
          tx.frame.create({
            data: {
              saleItemId: saleItem.id,
              sortOrder: f.sortOrder,
              barcode: f.barcode,
              brand: f.brand,
              model: f.model,
              h: f.h ? new Prisma.Decimal(f.h) : undefined,
              cap: f.cap ? new Prisma.Decimal(f.cap) : undefined,
              vertex: f.vertex ? new Prisma.Decimal(f.vertex) : undefined,
              pantos: f.pantos ? new Prisma.Decimal(f.pantos) : undefined,
              frameAngle: f.frameAngle ? new Prisma.Decimal(f.frameAngle) : undefined,
            },
          }),
        ),
      );
    }

    if (input.pairWithItemId) {
      const partner = await tx.saleItem.findFirst({
        where: {
          id: input.pairWithItemId,
          saleId,
          linkType: LinkType.CUSTOMER_FRAME,
          pairedItemId: null,
        },
      });
      if (!partner) {
        throw codeError('PAIR_ITEM_NOT_FOUND', 'Eşleştirilecek cam kalemi bulunamadı veya zaten eşleşmiş.');
      }
      await tx.saleItem.update({
        where: { id: saleItem.id },
        data: { pairedItemId: partner.id },
      });
      await tx.saleItem.update({
        where: { id: partner.id },
        data: { pairedItemId: saleItem.id },
      });
    }

    await recalcSaleTotals(tx, saleId);

    return { saleItem, prescription, frames, prescription_missing: prescriptionMissing };
  });

  return result;
}

export async function updateSaleItem(saleItemId: string, input: AddSaleItemInputType) {
  const saleItem = await prisma.saleItem.findUnique({ where: { id: saleItemId }, include: { sale: true, product: true } });
  if (!saleItem) throw codeError('SALE_ITEM_NOT_FOUND', 'Kalem bulunamadı.');
  if (saleItem.sale.status !== SaleStatus.DRAFT) throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');

  const { product, resolvedProductId, resolvedOdooProductId, resolvedOdooProductName } =
    await resolveProductForInput(input);

  if (isLensCategory(product, input)) {
    const hasLinked = Boolean(input.linkedItemId);
    const hasCustomerFrame = input.linkType === 'CUSTOMER_FRAME';
    if (!hasLinked && !hasCustomerFrame) {
      throw codeError('LENS_REQUIRES_FRAME_LINK', 'Cam kalemi bir çerçeveye bağlı olmalı.');
    }
  }

  const unitPrice = new Prisma.Decimal(input.unitPrice);
  const discount = new Prisma.Decimal(input.discount);
  const qty = input.qty;
  const taxRateNum = await resolveSaleItemTaxRate({
    inputTaxRate: (input as { taxRate?: number | null }).taxRate,
    odooProductId: resolvedOdooProductId,
    productTaxRate: product.taxRate,
  });
  const taxRate = new Prisma.Decimal(taxRateNum);
  const { taxAmount, lineTotal } = calcInclusiveLineAmounts({
    unitPrice,
    qty,
    discount,
    taxRate,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const upd = await tx.saleItem.update({
      where: { id: saleItemId },
      data: {
        productId: resolvedProductId,
        odooCategoryId: input.odooCategoryId ?? null,
        odooProductId: resolvedOdooProductId,
        odooProductName: resolvedOdooProductName,
        lotNo: input.lotNo?.trim() || null,
        qty,
        unitPrice,
        discount,
        taxRate,
        taxAmount,
        lineTotal,
        linkedItemId: input.linkedItemId,
        linkType: input.linkType,
      },
    });

    await tx.prescription.deleteMany({ where: { saleItemId: saleItemId } });
    if (product.productType === ProductType.PRESCRIBED && input.prescription) {
      const r_sph = input.prescription.r_sph ? new Prisma.Decimal(input.prescription.r_sph) : null;
      const r_add = input.prescription.r_add ? new Prisma.Decimal(input.prescription.r_add) : null;
      const l_sph = input.prescription.l_sph ? new Prisma.Decimal(input.prescription.l_sph) : null;
      const l_add = input.prescription.l_add ? new Prisma.Decimal(input.prescription.l_add) : null;

      const near_r_sph = r_sph && r_add ? calcNearSph(r_sph, r_add) : (input.prescription.near_r_sph ? new Prisma.Decimal(input.prescription.near_r_sph) : null);
      const near_l_sph = l_sph && l_add ? calcNearSph(l_sph, l_add) : (input.prescription.near_l_sph ? new Prisma.Decimal(input.prescription.near_l_sph) : null);

      await tx.prescription.create({
        data: {
          saleItemId: upd.id,
          prescriptionType: input.prescription.prescriptionType,
          prescriptionSource: input.prescription.prescriptionSource,
          doctorName: input.prescription.doctorName,
          prescriptionDate: input.prescription.prescriptionDate ? new Date(input.prescription.prescriptionDate) : undefined,
          eReceteCode: input.prescription.eReceteCode,
          r_pd: input.prescription.r_pd ? new Prisma.Decimal(input.prescription.r_pd) : undefined,
          r_sph: input.prescription.r_sph ? new Prisma.Decimal(input.prescription.r_sph) : undefined,
          r_cyl: input.prescription.r_cyl ? new Prisma.Decimal(input.prescription.r_cyl) : undefined,
          r_aks: input.prescription.r_aks,
          r_add: input.prescription.r_add ? new Prisma.Decimal(input.prescription.r_add) : undefined,
          l_pd: input.prescription.l_pd ? new Prisma.Decimal(input.prescription.l_pd) : undefined,
          l_sph: input.prescription.l_sph ? new Prisma.Decimal(input.prescription.l_sph) : undefined,
          l_cyl: input.prescription.l_cyl ? new Prisma.Decimal(input.prescription.l_cyl) : undefined,
          l_aks: input.prescription.l_aks,
          l_add: input.prescription.l_add ? new Prisma.Decimal(input.prescription.l_add) : undefined,
          near_r_sph: near_r_sph ?? undefined,
          near_l_sph: near_l_sph ?? undefined,
          lens_r_sph: input.prescription.lens_r_sph ? new Prisma.Decimal(input.prescription.lens_r_sph) : undefined,
          lens_r_cyl: input.prescription.lens_r_cyl ? new Prisma.Decimal(input.prescription.lens_r_cyl) : undefined,
          lens_r_aks: input.prescription.lens_r_aks,
          lens_r_bc: input.prescription.lens_r_bc ? new Prisma.Decimal(input.prescription.lens_r_bc) : undefined,
          lens_r_dia: input.prescription.lens_r_dia ? new Prisma.Decimal(input.prescription.lens_r_dia) : undefined,
          lens_r_add: input.prescription.lens_r_add ? new Prisma.Decimal(input.prescription.lens_r_add) : undefined,
          lens_r_color: input.prescription.lens_r_color,
          lens_r_brand: input.prescription.lens_r_brand,
          lens_l_sph: input.prescription.lens_l_sph ? new Prisma.Decimal(input.prescription.lens_l_sph) : undefined,
          lens_l_cyl: input.prescription.lens_l_cyl ? new Prisma.Decimal(input.prescription.lens_l_cyl) : undefined,
          lens_l_aks: input.prescription.lens_l_aks,
          lens_l_bc: input.prescription.lens_l_bc ? new Prisma.Decimal(input.prescription.lens_l_bc) : undefined,
          lens_l_dia: input.prescription.lens_l_dia ? new Prisma.Decimal(input.prescription.lens_l_dia) : undefined,
          lens_l_add: input.prescription.lens_l_add ? new Prisma.Decimal(input.prescription.lens_l_add) : undefined,
          lens_l_color: input.prescription.lens_l_color,
          lens_l_brand: input.prescription.lens_l_brand,
          solution: input.prescription.solution,
          solutionQty: input.prescription.solutionQty,
        },
      });
    }

    await tx.frame.deleteMany({ where: { saleItemId: saleItemId } });
    if (input.frames?.length) {
      await Promise.all(
        input.frames.map((f) =>
          tx.frame.create({
            data: {
              saleItemId: upd.id,
              sortOrder: f.sortOrder,
              barcode: f.barcode,
              brand: f.brand,
              model: f.model,
              h: f.h ? new Prisma.Decimal(f.h) : undefined,
              cap: f.cap ? new Prisma.Decimal(f.cap) : undefined,
              vertex: f.vertex ? new Prisma.Decimal(f.vertex) : undefined,
              pantos: f.pantos ? new Prisma.Decimal(f.pantos) : undefined,
              frameAngle: f.frameAngle ? new Prisma.Decimal(f.frameAngle) : undefined,
            },
          }),
        ),
      );
    }

    await recalcSaleTotals(tx, upd.saleId);
    return upd;
  });

  return updated;
}

export async function removeSaleItem(saleItemId: string) {
  const saleItem = await prisma.saleItem.findUnique({ where: { id: saleItemId }, include: { sale: true } });
  if (!saleItem) throw codeError('SALE_ITEM_NOT_FOUND', 'Kalem bulunamadı.');
  if (saleItem.sale.status !== SaleStatus.DRAFT) throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');

  await prisma.saleItem.update({
    where: { id: saleItemId },
    data: { status: ItemStatus.VOID },
  });

  await recalcSaleTotals(prisma, saleItem.saleId);
  return { ok: true };
}

const STATUS_ALLOWED_ROLES: Partial<Record<ItemStatus, Role[]>> = {
  ORDERED: [Role.SALES_STAFF, Role.STORE_MANAGER, Role.WAREHOUSE_MANAGER, Role.ADMIN],
  IN_LAB: [Role.WORKSHOP_STAFF, Role.WAREHOUSE_MANAGER, Role.STORE_MANAGER, Role.ADMIN],
  READY: [Role.WORKSHOP_STAFF, Role.WAREHOUSE_MANAGER, Role.STORE_MANAGER, Role.ADMIN],
  DELIVERED: [Role.SALES_STAFF, Role.STORE_MANAGER, Role.ADMIN],
  PENDING: [Role.ADMIN, Role.STORE_MANAGER],
};

function assertStatusTransitionAllowed(
  role: Role,
  targetStatus: ItemStatus,
  canWorkAtolye = false,
): void {
  const atolyeStatuses: ItemStatus[] = [ItemStatus.IN_LAB, ItemStatus.READY];
  if (canWorkAtolye && atolyeStatuses.includes(targetStatus)) {
    return;
  }

  const allowed = STATUS_ALLOWED_ROLES[targetStatus];
  if (!allowed?.includes(role)) {
    throw codeError('FORBIDDEN_STATUS_TRANSITION', 'Bu durum geçişi için yetkiniz yok.');
  }
}

export async function updateSaleItemStatus(
  saleItemId: string,
  status: ItemStatus,
  role: Role,
  canWorkAtolye = false,
  options?: {
    deliveryDate?: Date | null;
    atolyeBranchId?: string;
    userId?: string;
  },
) {
  assertStatusTransitionAllowed(role, status, canWorkAtolye);

  const existing = await prisma.saleItem.findUnique({
    where: { id: saleItemId },
    include: { product: { select: { category: true } } },
  });
  if (!existing) throw codeError('SALE_ITEM_NOT_FOUND', 'Kalem bulunamadı.');

  const data: Prisma.SaleItemUpdateInput = {
    status,
    ...(options?.deliveryDate !== undefined ? { deliveryDate: options.deliveryDate } : {}),
  };

  if (status === ItemStatus.IN_LAB) {
    const refreshed = await refreshLabCategoryFromOdoo({ ...existing, id: saleItemId });
    if (!isLabEligibleSaleItem(refreshed)) {
      throw codeError(
        'NOT_LAB_ELIGIBLE_ITEM',
        'Bu ürün laboratuvar sürecine tabi değil. Cam/lens kalemini seçin; çerçeve kalemleri laboratuvara gönderilemez.',
      );
    }

    const atolyeBranchId = options?.atolyeBranchId?.trim();
    if (!atolyeBranchId) {
      throw codeError('ATOLYE_BRANCH_REQUIRED', 'Laboratuvara gönderim için atölye şubesi seçilmelidir.');
    }

    const branch = await prisma.branch.findUnique({ where: { id: atolyeBranchId } });
    if (!branch?.hasAtolye) {
      throw codeError('ATOLYE_BRANCH_INVALID', 'Seçilen şubenin atölyesi yok.');
    }

    data.atolyeBranchId = atolyeBranchId;
    data.sentToLabAt = new Date();
    data.sentToLabByUserId = options?.userId ?? null;
  }

  const saleItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.saleItem.update({
      where: { id: saleItemId },
      data,
    });
    if (status === ItemStatus.READY) {
      await tx.sale.update({
        where: { id: existing.saleId },
        data: { updatedAt: new Date() },
      });
    }
    return updated;
  });
  return saleItem;
}

const ATOLYE_PANEL_ROLES: Role[] = [
  Role.WORKSHOP_STAFF,
  Role.STORE_MANAGER,
  Role.ADMIN,
  Role.WAREHOUSE_MANAGER,
];

function hasAtolyePanelAccess(user: JwtPayload): boolean {
  if (user.canWorkAtolye) return true;
  return ATOLYE_PANEL_ROLES.includes(user.role);
}

function assertAtolyeKuyrukAccess(user: JwtPayload, branchId: string): void {
  if (!hasAtolyePanelAccess(user)) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Bu işlem için yetkiniz yok.');
  }

  const crossBranchRoles: Role[] = [Role.ADMIN, Role.STORE_MANAGER];
  if (!crossBranchRoles.includes(user.role) && branchId !== user.branchId) {
    throw codeError('FORBIDDEN_ATOLYE_BRANCH', 'Bu atölye kuyruğuna erişim yetkiniz yok.');
  }
}

export function assertAtolyePanelAccess(user: JwtPayload, branchId: string): void {
  assertAtolyeKuyrukAccess(user, branchId);
}

function istanbulDayBounds(now = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const start = new Date(`${y}-${m}-${d}T00:00:00+03:00`);
  const end = new Date(`${y}-${m}-${d}T23:59:59.999+03:00`);
  return { start, end };
}

export async function getAtolyeKuyruk(
  user: JwtPayload,
  branchId: string,
  durum: 'IN_LAB' | 'READY',
) {
  assertAtolyeKuyrukAccess(user, branchId);

  const where: Prisma.SaleItemWhereInput = {
    atolyeBranchId: branchId,
    status: durum,
    sale: { status: SaleStatus.PAID },
  };

  if (durum === 'READY') {
    const { start, end } = istanbulDayBounds();
    where.OR = [
      { sentToLabAt: { gte: start, lte: end } },
      { sale: { updatedAt: { gte: start, lte: end } } },
    ];
  }

  return prisma.saleItem.findMany({
    where,
    include: {
      product: { select: { name: true, category: true } },
      sale: {
        select: {
          id: true,
          createdAt: true,
          customer: { select: { name: true, phone: true } },
        },
      },
    },
    orderBy: durum === 'IN_LAB'
      ? [{ sentToLabAt: 'asc' }, { sale: { createdAt: 'asc' } }]
      : [{ sale: { updatedAt: 'desc' } }, { sentToLabAt: 'desc' }],
  });
}

export async function getAtolyeBranches() {
  return prisma.branch.findMany({
    where: { hasAtolye: true, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
}

// Personel Fiyat Listesi: Fiyat = (maliyet × (1 + KDV oranı)) × 1.20
// Maliyet Odoo standard_price'tan (iskontosuz alış fiyatı), KDV oranı ürünün Odoo satış vergisinden okunur.
export async function hesaplaPersonelFiyati(odooProductIdRaw: string) {
  const odooProductId = Number(String(odooProductIdRaw).replace(/^odoo_/, ''));
  if (!odooProductId) {
    throw codeError('PRODUCT_ID_MISSING', 'Odoo ürün ID bulunamadı.');
  }

  const { price: maliyet } = await resolveStandardPriceAcrossCompanies('product.product', odooProductId);
  const kdvOrani = await readProductSaleTaxRate(odooProductId);
  const fiyat = maliyet * (1 + kdvOrani / 100) * 1.2;

  return {
    maliyet: Math.round(maliyet * 100) / 100,
    kdvOrani,
    fiyat: Math.round(fiyat * 100) / 100,
  };
}

export async function confirmSale(saleId: string, userId: string, role: Role, input: ConfirmSaleInputType) {
  let sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (sale.status !== SaleStatus.DRAFT) throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');

  await recalcSaleTotals(prisma, saleId);
  sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });

  const now = new Date();
  const paymentsToCreate: Array<{
    saleId: string;
    paymentType: PaymentType;
    bankId: string | null;
    posDeviceId: string | null;
    installment: number | null;
    grossAmount: Prisma.Decimal;
    commissionRate: Prisma.Decimal | null;
    commissionAmount: Prisma.Decimal | null;
    netAmount: Prisma.Decimal;
  }> = [];
  const cashMovementsToCreate: Array<{
    branchId: string;
    shiftId: string;
    userId: string;
    type: CashMovementType;
    amount: Prisma.Decimal;
    description: string;
  }> = [];

  for (const p of input.payments) {
    if (p.paymentType === PaymentType.CARD) {
      if (!p.bankId || !p.posDeviceId || !p.installment) {
        throw codeError('CARD_PAYMENT_FIELDS_REQUIRED', 'Kart ödemesi için bankId, posDeviceId ve installment zorunludur.');
      }
      const commission = await calculateCommission(p.bankId, p.installment, p.grossAmount, now);
      paymentsToCreate.push({
        saleId,
        paymentType: p.paymentType,
        bankId: p.bankId,
        posDeviceId: p.posDeviceId,
        installment: p.installment,
        grossAmount: new Prisma.Decimal(p.grossAmount),
        commissionRate: new Prisma.Decimal(commission.commissionRate),
        commissionAmount: new Prisma.Decimal(commission.commissionAmount),
        netAmount: new Prisma.Decimal(commission.netAmount),
      });
    } else {
      paymentsToCreate.push({
        saleId,
        paymentType: p.paymentType,
        bankId: null,
        posDeviceId: null,
        installment: null,
        grossAmount: new Prisma.Decimal(p.grossAmount),
        commissionRate: null,
        commissionAmount: null,
        netAmount: new Prisma.Decimal(p.grossAmount),
      });

      if (p.paymentType === PaymentType.CASH) {
        cashMovementsToCreate.push({
          branchId: sale.branchId,
          shiftId: sale.shiftId,
          userId,
          type: CashMovementType.CASH_IN,
          amount: new Prisma.Decimal(p.grossAmount),
          description: `SALE_CASH_PAYMENT:${saleId}`,
        });
      }
    }
  }

  if (input.sgkAmount > 0) {
    paymentsToCreate.push({
      saleId,
      paymentType: PaymentType.SGK,
      bankId: null,
      posDeviceId: null,
      installment: null,
      grossAmount: new Prisma.Decimal(input.sgkAmount),
      commissionRate: null,
      commissionAmount: null,
      netAmount: new Prisma.Decimal(input.sgkAmount),
    });
  }
  if (input.vakifAmount > 0) {
    paymentsToCreate.push({
      saleId,
      paymentType: PaymentType.VAKIF,
      bankId: null,
      posDeviceId: null,
      installment: null,
      grossAmount: new Prisma.Decimal(input.vakifAmount),
      commissionRate: null,
      commissionAmount: null,
      netAmount: new Prisma.Decimal(input.vakifAmount),
    });
  }

  const totalPayments = paymentsToCreate.reduce(
    (acc, p) => acc.plus(p.netAmount),
    new Prisma.Decimal(0),
  );

  if (!totalPayments.equals(sale.netTotal)) {
    console.warn('[confirmSale] Payment toplamı sale.netTotal ile eşleşmiyor', {
      saleId,
      saleNetTotal: sale.netTotal.toString(),
      paymentSum: totalPayments.toString(),
      sgkAmount: input.sgkAmount,
      vakifAmount: input.vakifAmount,
    });
  }

  const thirdParty = new Prisma.Decimal(input.thirdPartyAmount ?? 0);
  const expectedTotal = sale.netTotal.minus(thirdParty);

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.sale.updateMany({
      where: { id: saleId, status: SaleStatus.DRAFT },
      data: {
        status: SaleStatus.PAID,
        sgkAmount: input.sgkAmount > 0 ? new Prisma.Decimal(input.sgkAmount) : undefined,
        prescriptionAmount: input.vakifAmount > 0 ? new Prisma.Decimal(input.vakifAmount) : undefined,
      },
    });
    if (claim.count === 0) {
      throw codeError('SALE_ALREADY_PROCESSING', 'Satış zaten işleniyor veya onaylanmış.');
    }

    await tx.payment.createMany({ data: paymentsToCreate });
    if (cashMovementsToCreate.length) {
      await tx.cashMovement.createMany({ data: cashMovementsToCreate });
    }
    const updatedSale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    const payments = await tx.payment.findMany({ where: { saleId } });
    return { sale: updatedSale, payments };
  });

  if (!result.sale.referansNo) {
    const branchRow = await prisma.branch.findUnique({
      where: { id: sale.branchId },
      select: { code: true },
    });
    const referansNo = await generateSatisReferansNo(branchRow?.code ?? 'GVN1');
    result.sale = await prisma.sale.update({
      where: { id: saleId },
      data: { referansNo },
    });
  }

  let deliveryWarning: string | null = null;

  try {
    // 1. Müşteriyi bul
    const customer = sale.customerId
      ? await prisma.customer.findUnique({ where: { id: sale.customerId } })
      : null;

    // 2. Odoo partner ID al veya oluştur
    let odooPartnerId = customer?.odooPartnerId ?? null;
    if (!odooPartnerId && customer) {
      odooPartnerId = await execute('res.partner', 'create', [
        {
          name: customer.name,
          phone: customer.phone ?? '',
          customer_rank: 1,
        },
      ]);
      await prisma.customer.update({
        where: { id: customer.id },
        data: { odooPartnerId },
      });
    }

    if (odooPartnerId && input.pricingInvoiceNote?.trim()) {
      try {
        await appendPartnerNote(odooPartnerId, input.pricingInvoiceNote.trim());
      } catch (e) {
        console.error('[Odoo] appendPartnerNote hatası:', e);
      }
    }

    // 3. Satış kalemlerini al
    const saleItems = await prisma.saleItem.findMany({
      where: { saleId, status: { not: ItemStatus.VOID } },
      include: { product: true },
    });

    if (input.kasaIndirimTutar > 0) {
      const indirimliToplam = saleItems.reduce(
        (s, it) => s + (Number(it.unitPrice) * it.qty - Number(it.discount)),
        0,
      );

      if (indirimliToplam > 0) {
        for (const item of saleItems) {
          const itemNet = Number(item.unitPrice) * item.qty - Number(item.discount);
          const pay = itemNet / indirimliToplam;
          const ekstraIndirim = input.kasaIndirimTutar * pay;
          const yeniDiscount = new Prisma.Decimal(Number(item.discount) + ekstraIndirim);
          await prisma.saleItem.update({
            where: { id: item.id },
            data: { discount: yeniDiscount },
          });
          item.discount = yeniDiscount;
        }
        await recalcSaleTotals(prisma, saleId);
      }
    }

    // 4. Ödeme journal map
    const JOURNAL_MAP: Record<string, number> = {
      CASH: 17,
      CARD: 18,
      BANK_TRANSFER: 19,
      SGK: 20,
      VAKIF: 21,
    };

    // 5. order_line oluştur
    for (const item of saleItems) {
      const m = (input.lensOrderMeasurements ?? []).find((x: any) => x.saleItemId === item.id);
      if (m) {
        await prisma.saleItem.update({
          where: { id: item.id },
          data: { lensOrderMeasurement: m },
        });
      }
    }

    const branch = await prisma.branch.findUnique({
      where: { id: sale.branchId },
      select: { code: true, odooLocationId: true },
    });
    const branchCode = branch?.code ?? 'GVN1';
    const odooCompanyId = getCompanyIdFromLokasyon(branchCode) ?? ODOO_TAX_CHART_COMPANY_ID;
    const taxCompanyId = ODOO_TAX_CHART_COMPANY_ID;

    const orderLines: Array<[0, 0, Record<string, unknown>]> = [];
    for (const item of saleItems.filter((it) => it.odooProductId)) {
      const odooProductId = parseInt(item.odooProductId!, 10);
      const taxRate = await readProductSaleTaxRate(odooProductId, taxCompanyId);
      const { taxId: odooTaxId, priceUnit } = await resolvePosLineTax({
        companyId: odooCompanyId,
        taxRate,
        unitPriceInclusive: Number(item.unitPrice),
      });
      const base = item.odooProductName ?? item.product?.name ?? 'Ürün';
      const m = (input.lensOrderMeasurements ?? []).find((x: any) => x.saleItemId === item.id);
      let name = base;
      if (m) {
        const parts: string[] = [];
        if (m.rph) parts.push(`RPH:${m.rph}`);
        if (m.lph) parts.push(`LPH:${m.lph}`);
        if (m.corridor) parts.push(`Kor:${m.corridor}`);
        if (m.rightDia) parts.push(`RDia:${m.rightDia}`);
        if (m.leftDia) parts.push(`LDia:${m.leftDia}`);
        if (m.vertex) parts.push(`Vtx:${m.vertex}`);
        if (m.pantoscopic) parts.push(`Pan:${m.pantoscopic}`);
        if (m.frameBow) parts.push(`FBow:${m.frameBow}`);
        if (parts.length > 0) name = `${base} | ${parts.join(', ')}`;
      }
      orderLines.push([
        0,
        0,
        {
          ...(odooTaxId ? { tax_id: [[6, 0, [odooTaxId]]] } : {}),
          product_id: parseInt(item.odooProductId!, 10),
          product_uom_qty: item.qty,
          // resolvePosLineTax: dahil vergi varsa fiyat aynı; yoksa matraha çevrilir — toplam değişmez
          price_unit: priceUnit,
          discount:
            Number(item.unitPrice) * item.qty > 0
              ? Math.min(100, (Number(item.discount) / (Number(item.unitPrice) * item.qty)) * 100)
              : 0,
          name,
        },
      ]);
    }

    if (orderLines.length === 0) {
      const fallback = await resolvePosLineTax({
        companyId: odooCompanyId,
        taxRate: 20,
        unitPriceInclusive: Number(sale.netTotal),
      });
      orderLines.push([
        0,
        0,
        {
          ...(fallback.taxId ? { tax_id: [[6, 0, [fallback.taxId]]] } : {}),
          product_id: 1,
          product_uom_qty: 1,
          price_unit: fallback.priceUnit,
          discount: 0,
          name: 'POS Satışı',
        },
      ]);
    }

    const warehouseId = await resolveWarehouseIdForCompany(odooCompanyId);
    const odooOrderVals: Record<string, unknown> = {
      partner_id: odooPartnerId ?? 1,
      note: `POS Satış ID: ${saleId}`,
      order_line: orderLines,
      company_id: odooCompanyId,
      ...(warehouseId ? { warehouse_id: warehouseId } : {}),
    };

    const odooOrderId = await execute(
      'sale.order',
      'create',
      [odooOrderVals],
      {},
      odooCompanyId,
    );
    await execute('sale.order', 'action_confirm', [[odooOrderId]], {}, odooCompanyId);

    const stockLocationId = branch?.odooLocationId ?? resolveBranchStockLocationId(branchCode);
    const pickingResult = await validateSalePickingsFromBranch(odooOrderId, stockLocationId, odooCompanyId);
    if (!pickingResult.ok) {
      deliveryWarning = `Stok teslimatı tamamlanamadı: ${pickingResult.errors.join('; ')}`;
    }

    try {
      await execute(
        'sale.advance.payment.inv',
        'create_invoices',
        [
          [
            await execute(
              'sale.advance.payment.inv',
              'create',
              [{ advance_payment_method: 'delivered' }],
              { context: { active_ids: [odooOrderId], active_model: 'sale.order', active_id: odooOrderId } },
            ),
          ],
        ],
        { context: { active_ids: [odooOrderId], active_model: 'sale.order', active_id: odooOrderId } },
      ).catch(() => {});

      await new Promise((r) => setTimeout(r, 2000));

      const invoiceFields = ['id', 'state', 'name'];
      const [orderData] = await execute('sale.order', 'read', [[odooOrderId]], {
        fields: ['name', 'invoice_ids'],
      });
      const orderName = orderData?.name ?? '';
      let invoiceIds: number[] = orderData?.invoice_ids ?? [];

      console.log('[Odoo] Fatura aranıyor:', orderName, 'invoice_ids:', invoiceIds);

      let invoices: Array<{ id: number; state: string; name: string }> = [];
      if (invoiceIds.length > 0) {
        invoices = await execute('account.move', 'read', [invoiceIds], { fields: invoiceFields });
      } else if (orderName) {
        invoices = await execute(
          'account.move',
          'search_read',
          [
            [
              ['invoice_origin', '=', orderName],
              ['move_type', '=', 'out_invoice'],
            ],
          ],
          { fields: invoiceFields, limit: 1 },
        );
      }

      console.log('[Odoo] Bulunan faturalar:', JSON.stringify(invoices), 'invoice found:', invoices.length > 0);

      if (invoices && invoices.length > 0) {
        const invoiceId = invoices[0].id;
        if (invoices[0].state === 'draft') {
          await execute('account.move', 'write', [
            [invoiceId],
            {
              invoice_date: new Date().toISOString().split('T')[0],
            },
          ]);
          await execute('account.move', 'action_post', [[invoiceId]]).catch((e) =>
            console.error('[Odoo] Fatura onay hatası:', e),
          );
        }

        const createdPaymentIds: number[] = [];
        for (let i = 0; i < result.payments.length; i++) {
          const payment = result.payments[i];
          const inputPayment = input.payments[i];
          const bankName = inputPayment?.bankName ?? null;

          // OPEN_ACCOUNT Odoo'ya ödeme olarak gönderilmez — borç kaydıdır
          if (payment.paymentType === PaymentType.OPEN_ACCOUNT) continue;

          const JOURNAL_MAP: Record<string, number> = {
            CASH: 17,
            CARD: 18,
            BANK_TRANSFER: 19,
            TRANSFER: 19,
            HAVALE: 19,
            SGK: 20,
            VAKIF: 21,
            OPEN_ACCOUNT: 15,
          };
          const journalId = JOURNAL_MAP[payment.paymentType] ?? 17;
          try {
            const paymentId = await execute('account.payment', 'create', [
              {
                payment_type: 'inbound',
                partner_type: 'customer',
                partner_id: odooPartnerId ?? 1,
                amount: Number(payment.grossAmount),
                journal_id: journalId,
                ref:
                  payment.paymentType === PaymentType.TRANSFER && bankName
                    ? `POS HAVALE ${bankName} - ${saleId}`
                    : `POS ${payment.paymentType} - ${saleId}`,
                date: new Date().toISOString().split('T')[0],
              },
            ]);
            await execute('account.payment', 'action_post', [[paymentId]]).catch(() => {});
            createdPaymentIds.push(paymentId);
            console.log('[Odoo] Ödeme oluşturuldu:', paymentId, payment.paymentType);
          } catch (e) {
            console.error('[Odoo] Ödeme hatası:', e);
          }
        }

        for (const paymentId of createdPaymentIds) {
          try {
            const paymentMoves = await execute('account.payment', 'read', [[paymentId]], {
              fields: ['move_id'],
            });
            if (paymentMoves?.[0]?.move_id?.[0]) {
              const paymentMoveId = paymentMoves[0].move_id[0];
              const invoiceLines = await execute(
                'account.move.line',
                'search_read',
                [
                  [
                    ['move_id', '=', invoiceId],
                    ['account_type', 'in', ['asset_receivable']],
                    ['reconciled', '=', false],
                  ],
                ],
                { fields: ['id'], limit: 1 },
              );
              const paymentLines = await execute(
                'account.move.line',
                'search_read',
                [
                  [
                    ['move_id', '=', paymentMoveId],
                    ['account_type', 'in', ['asset_receivable']],
                    ['reconciled', '=', false],
                  ],
                ],
                { fields: ['id'], limit: 1 },
              );
              if (invoiceLines?.[0] && paymentLines?.[0]) {
                await execute('account.move.line', 'reconcile', [
                  [invoiceLines[0].id, paymentLines[0].id],
                ]).catch((e) => console.error('[Odoo] Mutabakat hatası:', e));
              }
            }
          } catch (e) {
            console.error('[Odoo] Bağlama hatası:', e);
          }
        }
      }
    } catch (invErr) {
      console.error('[Odoo] Fatura/ödeme hatası:', invErr);
    }

    // 10. PostgreSQL güncelle
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        odooSaleOrderId: odooOrderId,
        odooSynced: true,
        odooSyncError: deliveryWarning,
      },
    });
  } catch (err) {
    console.error('[Odoo] Satış sync hatası:', err);
    deliveryWarning = String(err);
    await prisma.sale
      .update({
        where: { id: saleId },
        data: { odooSyncError: String(err) },
      })
      .catch(() => {});
  }

  if (input.faturaKesilsin !== false) {
    tetikleSatisEFatura(saleId).catch((err) => {
      console.error('[e-Fatura] Satış onay tetikleme hatası:', err);
    });
  }

  // Kasiyer ekranında görünür olsun diye stok/Odoo senkron uyarısını cevaba ekle
  result.sale = { ...result.sale, odooSyncError: deliveryWarning ?? result.sale.odooSyncError };

  return result;
}

export async function voidSale(saleId: string, userId: string, role: Role, input: VoidSaleInputType) {
  if (role !== Role.STORE_MANAGER && role !== Role.ADMIN) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Bu işlem için yetkiniz yok.');
  }

  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (sale.status === SaleStatus.VOID) throw codeError('SALE_ALREADY_VOID', 'Satış zaten iptal.');

  let odooCancelled = false;
  let odooCancelError: string | null = null;

  if (sale.odooSaleOrderId) {
    try {
      const [orderData] = await execute('sale.order', 'read', [[sale.odooSaleOrderId]], {
        fields: ['invoice_ids', 'invoice_status'],
      });
      const hasInvoice = (orderData?.invoice_ids ?? []).length > 0;

      if (!hasInvoice) {
        try {
          await execute('sale.order', 'action_cancel', [[sale.odooSaleOrderId]], {
            context: { disable_cancel_warning: true },
          });
          odooCancelled = true;
        } catch (e) {
          odooCancelled = false;
          odooCancelError = String(e);
        }
      } else {
        odooCancelled = false;
        odooCancelError = 'Fatura zaten kesilmiş — Odoo iptali için resmi iade süreci gerekiyor';

        const alicilar = await prisma.user.findMany({
          where: { role: { in: [Role.ADMIN, Role.ACCOUNTANT] }, isActive: true },
          select: { id: true },
        });
        if (alicilar.length) {
          await createBildirimler(
            alicilar.map((u) => u.id),
            {
              baslik: 'Satış iptal edildi — Odoo\'da manuel işlem gerekli',
              mesaj: `Satış #${saleId} POS'ta iptal edildi ancak Odoo'da zaten fatura/ödeme kaydı var. Lütfen resmi iade faturası (credit note) sürecini Odoo/Uyumsoft üzerinden başlatın.`,
              link: `/admin/satislar/${saleId}`,
              tip: 'GENEL',
            },
          );
        }
      }
    } catch (e) {
      odooCancelled = false;
      odooCancelError = String(e);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: SaleStatus.VOID,
        voidReason: input.voidReason,
        voidUserId: userId,
        voidAt: new Date(),
        odooCancelled,
        odooCancelError,
      },
    });
    await tx.saleItem.updateMany({
      where: { saleId },
      data: { status: ItemStatus.VOID },
    });
    return s;
  });

  return updated;
}

export async function getSales(branchId: string, filters?: any) {
  const q = typeof filters?.q === 'string' ? filters.q.trim() : '';
  // Metin arama (müşteri adı/telefon/referans no) yapılıyorsa, satış hangi şubede
  // yapılmış olursa olsun bulunabilmeli — bu yüzden şube kapsaması kaldırılıyor
  // (customerId filtresiyle aynı mantık).
  const where: any = filters?.customerId || q ? {} : { branchId };
  if (filters?.status) where.status = filters.status;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  if (q) {
    where.OR = [
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q } } },
      { referansNo: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { name: true, phone: true } },
      items: { select: { status: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    // Arama (q) yapılırken sonuç sayısı sınırlanmaz — eşleşen TÜM satışlar döner.
    // Arama yokken (düz liste) performans için son 100 kayıtla sınırlı kalır.
    ...(q ? {} : { take: 100 }),
  });

  // Sürecin en gerisindeki kalem durumu satış listesine "süreç durumu" olarak yansır
  // (PENDING/ORDERED en öncelikli — henüz bitmemiş olanı gösterir).
  const ITEM_STATUS_PRIORITY: Record<string, number> = {
    PENDING: 0,
    ORDERED: 1,
    IN_LAB: 2,
    READY: 3,
    DELIVERED: 4,
  };
  function rollupItemStatus(items: { status: string }[]): string | null {
    const active = items.filter((i) => i.status !== 'VOID');
    if (!active.length) return null;
    return active.reduce((worst, it) => {
      const wp = ITEM_STATUS_PRIORITY[worst] ?? 0;
      const ip = ITEM_STATUS_PRIORITY[it.status] ?? 0;
      return ip < wp ? it.status : worst;
    }, active[0].status);
  }

  return sales.map((s) => ({
    ...s,
    itemsCount: s._count.items,
    totalAmount: s.netTotal,
    itemDurum: rollupItemStatus(s.items),
    items: undefined,
    _count: undefined,
  }));
}

export async function updateDraftMeta(saleId: string, input: UpdateDraftMetaInputType) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (sale.status !== SaleStatus.DRAFT) {
    throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');
  }

  const existing =
    sale.draftMeta && typeof sale.draftMeta === 'object' && !Array.isArray(sale.draftMeta)
      ? (sale.draftMeta as Record<string, unknown>)
      : {};

  const draftMeta: Record<string, unknown> = { ...existing };
  if (input.step !== undefined) draftMeta.step = input.step;
  if (input.pricing !== undefined) draftMeta.pricing = input.pricing;
  if (input.payments !== undefined) draftMeta.payments = input.payments;
  if (input.measurements !== undefined) draftMeta.measurements = input.measurements;
  draftMeta.updatedAt = new Date().toISOString();

  return prisma.sale.update({
    where: { id: saleId },
    data: { draftMeta: draftMeta as Prisma.InputJsonValue },
  });
}

export async function getSaleById(saleId: string) {
  const existing = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { status: true },
  });
  if (!existing) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (existing.status === SaleStatus.DRAFT) {
    await recalcSaleTotals(prisma, saleId);
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      items: {
        where: { status: { not: ItemStatus.VOID } },
        include: { prescription: true, frames: true, product: true },
      },
      payments: true,
    },
  });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      name:
        item.product?.name === '__ODOO_PLACEHOLDER__'
          ? (item.odooProductName ?? 'Odoo Ürünü')
          : (item.product?.name ?? 'Ürün'),
    })),
  };
}

