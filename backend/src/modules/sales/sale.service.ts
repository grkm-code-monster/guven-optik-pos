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
import { createBildirimler } from '../bildirim/bildirim.service';
import { calculateCommission } from '../payments/commission.service';
import { tetikleSatisEFatura } from '../efatura/uyumsoft-efatura.service';
import type { AddSaleItemInputType, ConfirmSaleInputType, CreateSaleInputType, VoidSaleInputType } from './sale.types';

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

async function recalcSaleTotals(
  db: Prisma.TransactionClient | typeof prisma,
  saleId: string,
) {
  const items = await db.saleItem.findMany({
    where: { saleId, status: { not: ItemStatus.VOID } },
    select: { unitPrice: true, qty: true, discount: true, taxAmount: true },
  });

  const grossTotal = items.reduce(
    (acc, it) => acc.plus(it.unitPrice.times(it.qty)),
    new Prisma.Decimal(0),
  );
  const discountTotal = items.reduce((acc, it) => acc.plus(it.discount), new Prisma.Decimal(0));
  const taxTotal = items.reduce((acc, it) => acc.plus(it.taxAmount), new Prisma.Decimal(0));
  const netTotal = grossTotal.minus(discountTotal).plus(taxTotal);

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

  const { product, resolvedProductId, resolvedOdooProductId, resolvedOdooProductName, isOdooPlaceholder } =
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
  const taxRate =
    (input as any).taxRate != null
      ? new Prisma.Decimal((input as any).taxRate)
      : isOdooPlaceholder
        ? new Prisma.Decimal(20)
        : new Prisma.Decimal(product.taxRate.toString());

  const base = unitPrice.times(qty);
  const taxAmount = base.times(taxRate.div(100));
  const lineTotal = base.minus(discount).plus(taxAmount);

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

  const { product, resolvedProductId, resolvedOdooProductId, resolvedOdooProductName, isOdooPlaceholder } =
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
  const taxRate =
    (input as any).taxRate != null
      ? new Prisma.Decimal((input as any).taxRate)
      : isOdooPlaceholder
        ? new Prisma.Decimal(20)
        : new Prisma.Decimal(product.taxRate.toString());
  const base = unitPrice.times(qty);
  const taxAmount = base.times(taxRate.div(100));
  const lineTotal = base.minus(discount).plus(taxAmount);

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

export async function updateSaleItemStatus(
  saleItemId: string,
  status: ItemStatus,
  deliveryDate?: Date | null,
) {
  const saleItem = await prisma.saleItem.update({
    where: { id: saleItemId },
    data: {
      status,
      ...(deliveryDate !== undefined ? { deliveryDate } : {}),
    },
  });
  return saleItem;
}

export async function confirmSale(saleId: string, userId: string, role: Role, input: ConfirmSaleInputType) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');
  if (sale.status !== SaleStatus.DRAFT) throw codeError('SALE_NOT_EDITABLE', 'Satış düzenlenemez.');

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
    await tx.payment.createMany({ data: paymentsToCreate });
    if (cashMovementsToCreate.length) {
      await tx.cashMovement.createMany({ data: cashMovementsToCreate });
    }
    const updatedSale = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: SaleStatus.PAID,
        sgkAmount: input.sgkAmount > 0 ? new Prisma.Decimal(input.sgkAmount) : undefined,
        prescriptionAmount: input.vakifAmount > 0 ? new Prisma.Decimal(input.vakifAmount) : undefined,
      },
    });
    const payments = await tx.payment.findMany({ where: { saleId } });
    return { sale: updatedSale, payments };
  });

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

    const orderLines = saleItems
      .filter((item) => item.odooProductId)
      .map((item) => [
        0,
        0,
        {
          ...(typeof (item as any).odooTaxId === 'number' && (item as any).odooTaxId > 0
            ? { tax_id: [[6, 0, [(item as any).odooTaxId]]] }
            : {}),
          product_id: parseInt(item.odooProductId!, 10),
          product_uom_qty: item.qty,
          price_unit: Number(item.unitPrice),
          // KDV Odoo'da hesaplanmasın — fiyat KDV dahil
          discount:
            Number(item.unitPrice) * item.qty > 0
              ? Math.min(100, (Number(item.discount) / (Number(item.unitPrice) * item.qty)) * 100)
              : 0,
          name: (() => {
            const base = item.odooProductName ?? item.product?.name ?? 'Ürün';
            const m = (input.lensOrderMeasurements ?? []).find((x: any) => x.saleItemId === item.id);
            if (!m) return base;
            const parts: string[] = [];
            if (m.rph) parts.push(`RPH:${m.rph}`);
            if (m.lph) parts.push(`LPH:${m.lph}`);
            if (m.corridor) parts.push(`Kor:${m.corridor}`);
            if (m.rightDia) parts.push(`RDia:${m.rightDia}`);
            if (m.leftDia) parts.push(`LDia:${m.leftDia}`);
            if (m.vertex) parts.push(`Vtx:${m.vertex}`);
            if (m.pantoscopic) parts.push(`Pan:${m.pantoscopic}`);
            if (m.frameBow) parts.push(`FBow:${m.frameBow}`);
            if (parts.length === 0) return base;
            return `${base} | ${parts.join(', ')}`;
          })(),
        },
      ]);

    if (orderLines.length === 0) {
      orderLines.push([
        0,
        0,
        {
          product_id: 1,
          product_uom_qty: 1,
          price_unit: Number(sale.netTotal),
          discount: 0,
          name: 'POS Satışı',
        },
      ]);
    }

    // 6. Odoo sale.order oluştur ve onayla
    const odooOrderId = await execute('sale.order', 'create', [
      {
        partner_id: odooPartnerId ?? 1,
        note: `POS Satış ID: ${saleId}`,
        order_line: orderLines,
      },
    ]);
    await execute('sale.order', 'action_confirm', [[odooOrderId]]);

    try {
      const pickings = await execute(
        'stock.picking',
        'search_read',
        [[['sale_id', '=', odooOrderId], ['state', 'not in', ['done', 'cancel']]]],
        { fields: ['id', 'state'], limit: 10 },
      );
      for (const picking of pickings) {
        await execute('stock.picking', 'button_validate', [[picking.id]]);
      }
    } catch (deliveryErr) {
      console.error('[Odoo] Teslimat hatası:', deliveryErr);
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
        odooSyncError: null,
      },
    });
  } catch (err) {
    console.error('[Odoo] Satış sync hatası:', err);
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
  const where: any = filters?.customerId ? {} : { branchId };
  if (filters?.status) where.status = filters.status;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { name: true, phone: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return sales.map((s) => ({
    ...s,
    itemsCount: s._count.items,
    _count: undefined,
  }));
}

export async function getSaleById(saleId: string) {
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

