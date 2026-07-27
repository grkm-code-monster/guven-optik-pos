import { Prisma } from '@prisma/client';
import { ODOO_TAX_CHART_COMPANY_ID, readProductSaleTaxRate } from '../odoo/odoo-tax.util';

/** Satış kalemi için KDV oranı: POS seçimi → Odoo ürün → yerel ürün → varsayılan */
export async function resolveSaleItemTaxRate(opts: {
  inputTaxRate?: number | null;
  odooProductId?: string | null;
  productTaxRate?: Prisma.Decimal | number | string | null;
}): Promise<number> {
  if (opts.inputTaxRate != null && Number.isFinite(Number(opts.inputTaxRate)) && Number(opts.inputTaxRate) >= 0) {
    return Number(opts.inputTaxRate);
  }
  if (opts.odooProductId) {
    const pid = parseInt(String(opts.odooProductId), 10);
    if (Number.isFinite(pid)) {
      return readProductSaleTaxRate(pid, ODOO_TAX_CHART_COMPANY_ID);
    }
  }
  const local = Number(opts.productTaxRate ?? 0);
  if (local > 0) return local;
  return 20;
}

/** POS birim fiyatları KDV dahildir (Odoo price_include=true ile aynı standart). */
export function calcInclusiveLineAmounts(opts: {
  unitPrice: Prisma.Decimal | number | string;
  qty: number;
  discount: Prisma.Decimal | number | string;
  taxRate: Prisma.Decimal | number | string;
}): { taxAmount: Prisma.Decimal; lineTotal: Prisma.Decimal } {
  const unitPrice = new Prisma.Decimal(opts.unitPrice);
  const discount = new Prisma.Decimal(opts.discount);
  const taxRate = new Prisma.Decimal(opts.taxRate);
  const base = unitPrice.times(opts.qty);
  const lineTotal = base.minus(discount);
  const rate = taxRate.toNumber();
  if (rate <= 0) {
    return { taxAmount: new Prisma.Decimal(0), lineTotal };
  }
  const taxAmount = lineTotal.times(taxRate).div(taxRate.plus(100));
  return { taxAmount, lineTotal };
}

/** KDV dahil tutardan gömülü KDV ve matrah ayırır */
export function splitInclusiveVat(inclusiveAmount: number, taxRatePercent: number): {
  matrah: number;
  kdvTutar: number;
  inclusive: number;
} {
  const inclusive = inclusiveAmount;
  if (taxRatePercent <= 0) {
    return { matrah: inclusive, kdvTutar: 0, inclusive };
  }
  const matrah = inclusive / (1 + taxRatePercent / 100);
  const kdvTutar = inclusive - matrah;
  return { matrah, kdvTutar, inclusive };
}
