import {
  CashMovementType,
  ItemStatus,
  PaymentType,
  Prisma,
  ProductCategory,
  SaleStatus,
  ShiftStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../database/prisma';

const ODOO_OPTIK_CAM_CATEGORY_IDS = new Set([
  4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41,
]);

type DashboardKategori =
  | 'GUNES_GOZLUGU'
  | 'CAM'
  | 'LENS'
  | 'OPTIK_CERCEVE'
  | 'AKSESUAR'
  | 'SOLUSYON';

const EMPTY_KATEGORI: Record<DashboardKategori, number> = {
  GUNES_GOZLUGU: 0,
  CAM: 0,
  LENS: 0,
  OPTIK_CERCEVE: 0,
  AKSESUAR: 0,
  SOLUSYON: 0,
};

const PRODUCT_CATEGORY_MAP: Partial<Record<ProductCategory, DashboardKategori>> = {
  [ProductCategory.SUNGLASSES_READY]: 'GUNES_GOZLUGU',
  [ProductCategory.SUNGLASSES_RX]: 'GUNES_GOZLUGU',
  [ProductCategory.LENS_RX]: 'CAM',
  [ProductCategory.OPTICAL_FRAME_READY]: 'OPTIK_CERCEVE',
  [ProductCategory.OPTICAL_FRAME_RX]: 'OPTIK_CERCEVE',
  [ProductCategory.CONTACT_LENS_READY]: 'LENS',
  [ProductCategory.CONTACT_LENS_RX]: 'LENS',
  [ProductCategory.SOLUTION]: 'SOLUSYON',
  [ProductCategory.ACCESSORY]: 'AKSESUAR',
};

function zeroExtras() {
  return {
    netCiro: '0',
    kasaNakit: '0',
    toplamBanka: '0',
    toplamSgkHakki: '0',
    toplamVakifOdemesi: '0',
    satisAdedi: 0,
    ortalamaSepet: '0',
    kategoriBreakdown: { ...EMPTY_KATEGORI },
    kampanyaBreakdown: [] as Array<{ type: string; count: number }>,
    temsilciBreakdown: [] as Array<{ repName: string; saleCount: number; ciro: string }>,
  };
}

function resolveItemKategori(item: {
  odooCategoryId: number | null;
  odooProductName: string | null;
  product: { category: ProductCategory; name: string } | null;
}): DashboardKategori {
  const pc = item.product?.category;
  if (pc && PRODUCT_CATEGORY_MAP[pc]) {
    return PRODUCT_CATEGORY_MAP[pc]!;
  }

  const catId = item.odooCategoryId;
  if (catId != null) {
    if (ODOO_OPTIK_CAM_CATEGORY_IDS.has(catId)) return 'CAM';
    if (catId === 6) return 'OPTIK_CERCEVE';
    if (catId === 8) return 'AKSESUAR';
    if (catId === 7) {
      const n = (item.odooProductName ?? item.product?.name ?? '').toLowerCase();
      if (n.includes('kontakt') || n.includes('lens')) return 'LENS';
      return 'GUNES_GOZLUGU';
    }
  }

  const name = (item.odooProductName ?? item.product?.name ?? '').toLowerCase();
  if (/güneş|gunes|gözlük|gozluk/.test(name)) return 'GUNES_GOZLUGU';
  if (/solüsyon|solusyon/.test(name)) return 'SOLUSYON';
  if (/aksesuar/.test(name)) return 'AKSESUAR';
  if (/çerçeve|cerceve|frame/.test(name)) return 'OPTIK_CERCEVE';
  if (/kontakt/.test(name) || (/\blens\b/.test(name) && !/cam/.test(name))) return 'LENS';
  if (/cam|progresif|bifokal/.test(name)) return 'CAM';
  return 'AKSESUAR';
}

function buildDerivedMetrics(params: {
  totalSales: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  totalCommission: Prisma.Decimal;
  cashTotal: Prisma.Decimal;
  cashOut: Prisma.Decimal;
  cardNet: Prisma.Decimal;
  transferTotal: Prisma.Decimal;
  totalNet: Prisma.Decimal;
  saleCount: number;
  toplamSgkHakki: Prisma.Decimal;
  toplamVakifOdemesi: Prisma.Decimal;
  kategoriBreakdown: Record<DashboardKategori, number>;
  kampanyaBreakdown: Array<{ type: string; count: number }>;
  temsilciBreakdown: Array<{ repName: string; saleCount: number; ciro: string }>;
}) {
  const netCiro = params.totalSales.minus(params.taxTotal).minus(params.totalCommission);
  const kasaNakit = params.cashTotal.minus(params.cashOut);
  const toplamBanka = params.cardNet.plus(params.transferTotal).minus(params.totalCommission);
  const ortalamaSepet =
    params.saleCount > 0 ? params.totalNet.div(params.saleCount) : new Prisma.Decimal(0);

  return {
    netCiro: netCiro.toString(),
    kasaNakit: kasaNakit.toString(),
    toplamBanka: toplamBanka.toString(),
    toplamSgkHakki: params.toplamSgkHakki.toString(),
    toplamVakifOdemesi: params.toplamVakifOdemesi.toString(),
    satisAdedi: params.saleCount,
    ortalamaSepet: ortalamaSepet.toString(),
    kategoriBreakdown: params.kategoriBreakdown,
    kampanyaBreakdown: params.kampanyaBreakdown,
    temsilciBreakdown: params.temsilciBreakdown,
  };
}

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

function dayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const paidSalesSelect = {
  id: true,
  netTotal: true,
  grossTotal: true,
  taxTotal: true,
  discountTotal: true,
  sgkAmount: true,
  createdAt: true,
  userId: true,
  user: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  items: {
    select: {
      qty: true,
      odooCategoryId: true,
      odooProductName: true,
      unitPrice: true,
      product: { select: { category: true, name: true } },
    },
  },
  payments: {
    select: {
      paymentType: true,
      grossAmount: true,
      netAmount: true,
      commissionAmount: true,
      installment: true,
      bankId: true,
    },
  },
} as const;

type PaidSaleForDetail = Prisma.SaleGetPayload<{ select: typeof paidSalesSelect }>;

function resolveDeliveryDate(items: PaidSaleForDetail['items']): string | null {
  for (const item of items) {
    const raw = (item as { deliveryDate?: Date | string | null }).deliveryDate;
    if (!raw) continue;
    if (raw instanceof Date) return raw.toISOString();
    return String(raw);
  }
  return null;
}

async function buildSalesDetail(paidSales: PaidSaleForDetail[]) {
  const bankIds = Array.from(
    new Set(
      paidSales
        .flatMap((s) => s.payments.map((p) => p.bankId))
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const banks = bankIds.length
    ? await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } })
    : [];
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const sorted = [...paidSales].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted.map((sale) => ({
    saleId: sale.id,
    createdAt: sale.createdAt.toISOString(),
    deliveryDate: resolveDeliveryDate(sale.items),
    customerName: sale.customer?.name ?? '—',
    grossTotal: sale.grossTotal.toString(),
    netTotal: sale.netTotal.toString(),
    taxExcluded: sale.taxTotal
      ? (Number(sale.netTotal) - Number(sale.taxTotal)).toFixed(2)
      : sale.netTotal.toString(),
    discountPct: sale.grossTotal.greaterThan(0)
      ? ((Number(sale.discountTotal) / Number(sale.grossTotal)) * 100).toFixed(1)
      : '0',
    sgkAmount: sale.sgkAmount?.toString() ?? '0',
    repName: sale.user?.name ?? '—',
    cashAmount: sale.payments
      .filter((p) => p.paymentType === PaymentType.CASH)
      .reduce((s, p) => s + Number(p.grossAmount), 0)
      .toFixed(2),
    cardPayments: sale.payments
      .filter((p) => p.paymentType === PaymentType.CARD)
      .map((p) => ({
        bankName: p.bankId ? (bankNameById.get(p.bankId) ?? '—') : '—',
        installment: p.installment ?? 1,
        grossAmount: p.grossAmount.toString(),
        commissionAmount: p.commissionAmount?.toString() ?? '0',
      })),
    transferAmount: sale.payments
      .filter((p) => p.paymentType === PaymentType.TRANSFER)
      .reduce((s, p) => s + Number(p.grossAmount), 0)
      .toFixed(2),
    itemSummary: sale.items.map((i) => i.odooProductName ?? i.product?.name ?? '—').join(', '),
  }));
}

export async function getDailyReport(branchId: string, date: Date) {
  const { start, end } = dayRange(date);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  let shift = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });

  if (!shift) {
    shift = await prisma.shift.findFirst({
      where: {
        branchId,
        openedAt: { gte: start },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  if (!shift) {
    return {
      date: date.toISOString(),
      branchId,
      branchName: branch?.name ?? '',
      shiftId: null,
      shiftOpenedAt: null,
      openCash: '0',
      totalSales: '0',
      totalDiscount: '0',
      totalNet: '0',
      cashTotal: '0',
      cardGross: '0',
      cardNet: '0',
      totalCommission: '0',
      transferTotal: '0',
      openAccountTotal: '0',
      taxTotal: '0',
      cashIn: '0',
      cashOut: '0',
      advanceTotal: '0',
      expectedCash: '0',
      physicalCash: null,
      diff: null,
      saleCount: 0,
      bankBreakdown: [],
      salesDetail: [],
      ...zeroExtras(),
    };
  }

  const paidSaleWhere = {
    branchId,
    shiftId: shift.id,
    status: SaleStatus.PAID,
  };

  const paidSales = await prisma.sale.findMany({
    where: paidSaleWhere,
    select: paidSalesSelect,
    orderBy: { createdAt: 'asc' },
  });

  const salesAgg = await prisma.sale.aggregate({
    where: paidSaleWhere,
    _sum: {
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
      taxTotal: true,
    },
    _count: { _all: true },
  });

  const cashAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.CASH },
    _sum: { grossAmount: true },
  });
  const cardAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.CARD },
    _sum: { grossAmount: true, netAmount: true, commissionAmount: true },
  });
  const transferAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.TRANSFER },
    _sum: { grossAmount: true },
  });
  const openAccountAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.OPEN_ACCOUNT },
    _sum: { grossAmount: true },
  });

  const cashInAgg = await prisma.cashMovement.aggregate({
    where: {
      shiftId: shift.id,
      type: CashMovementType.CASH_IN,
      NOT: { description: { startsWith: 'SALE_CASH_PAYMENT:' } },
    },
    _sum: { amount: true },
  });
  const cashOutAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.CASH_OUT },
    _sum: { amount: true },
  });
  const advanceAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.ADVANCE },
    _sum: { amount: true },
  });

  const openCash = shift.openCash ?? new Prisma.Decimal(0);
  const totalSales = salesAgg._sum.grossTotal ?? new Prisma.Decimal(0);
  const totalDiscount = salesAgg._sum.discountTotal ?? new Prisma.Decimal(0);
  const totalNet = salesAgg._sum.netTotal ?? new Prisma.Decimal(0);
  const taxTotal = salesAgg._sum.taxTotal ?? new Prisma.Decimal(0);

  const cashTotal = cashAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardGross = cardAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardNet = cardAgg._sum.netAmount ?? new Prisma.Decimal(0);
  const totalCommission = cardAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const transferTotal = transferAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const openAccountTotal = openAccountAgg._sum.grossAmount ?? new Prisma.Decimal(0);

  const cashIn = cashInAgg._sum.amount ?? new Prisma.Decimal(0);
  const cashOut = cashOutAgg._sum.amount ?? new Prisma.Decimal(0);
  const advanceTotal = advanceAgg._sum.amount ?? new Prisma.Decimal(0);

  const expectedCash = openCash.plus(cashTotal).plus(cashIn).minus(cashOut).minus(advanceTotal);

  const bankGrouped = await prisma.payment.groupBy({
    by: ['bankId', 'installment'],
    where: {
      paymentType: PaymentType.CARD,
      bankId: { not: null },
      sale: { shiftId: shift.id, status: SaleStatus.PAID },
    },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });

  const bankIds = Array.from(new Set(bankGrouped.map((b) => b.bankId).filter((x): x is string => Boolean(x))));
  const banks = await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } });
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const bankBreakdown = bankGrouped.map((b) => ({
    bankName: bankNameById.get(b.bankId as string) ?? '',
    installment: b.installment ?? 1,
    gross: (b._sum.grossAmount ?? new Prisma.Decimal(0)).toString(),
    commission: (b._sum.commissionAmount ?? new Prisma.Decimal(0)).toString(),
    net: (b._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
  }));

  const saleCount = salesAgg._count._all;

  const kategoriBreakdown: Record<DashboardKategori, number> = { ...EMPTY_KATEGORI };
  for (const sale of paidSales) {
    for (const item of sale.items) {
      const key = resolveItemKategori(item);
      kategoriBreakdown[key] += item.qty ?? 1;
    }
  }

  let toplamSgkHakki = new Prisma.Decimal(0);
  let toplamVakifOdemesi = new Prisma.Decimal(0);
  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();

  for (const sale of paidSales) {
    if (sale.sgkAmount) {
      toplamSgkHakki = toplamSgkHakki.plus(sale.sgkAmount);
    }
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const kampanyaBreakdown: Array<{ type: string; count: number }> = [];
  const temsilciBreakdown = Array.from(repMap.values())
    .map((r) => ({
      repName: r.repName,
      saleCount: r.saleCount,
      ciro: r.ciro.toString(),
    }))
    .sort((a, b) => Number(b.ciro) - Number(a.ciro));

  const derived = buildDerivedMetrics({
    totalSales,
    taxTotal,
    totalCommission,
    cashTotal,
    cashOut,
    cardNet,
    transferTotal,
    totalNet,
    saleCount,
    toplamSgkHakki,
    toplamVakifOdemesi,
    kategoriBreakdown,
    kampanyaBreakdown,
    temsilciBreakdown,
  });

  return {
    date,
    branchId,
    branchName: branch.name,
    shiftId: shift.id,
    shiftOpenedAt: shift.openedAt,
    openCash: openCash.toString(),
    totalSales: totalSales.toString(),
    totalDiscount: totalDiscount.toString(),
    totalNet: totalNet.toString(),
    cashTotal: cashTotal.toString(),
    cardGross: cardGross.toString(),
    cardNet: cardNet.toString(),
    totalCommission: totalCommission.toString(),
    transferTotal: transferTotal.toString(),
    openAccountTotal: openAccountTotal.toString(),
    taxTotal: taxTotal.toString(),
    cashIn: cashIn.toString(),
    cashOut: cashOut.toString(),
    advanceTotal: advanceTotal.toString(),
    expectedCash: expectedCash.toString(),
    physicalCash: shift.physicalCash ? shift.physicalCash.toString() : null,
    diff: shift.diff ? shift.diff.toString() : null,
    saleCount,
    bankBreakdown,
    salesDetail: await buildSalesDetail(paidSales),
    ...derived,
  };
}

export async function getPersonalDailyReport(
  userId: string,
  branchId: string,
  date: Date,
) {
  const { start, end } = dayRange(date);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  let shift = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });

  if (!shift) {
    shift = await prisma.shift.findFirst({
      where: {
        branchId,
        openedAt: { gte: start },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  if (!shift) {
    return {
      date: date.toISOString(),
      branchId,
      branchName: branch?.name ?? '',
      shiftId: null,
      shiftOpenedAt: null,
      openCash: '0',
      totalSales: '0',
      totalDiscount: '0',
      totalNet: '0',
      cashTotal: '0',
      cardGross: '0',
      cardNet: '0',
      totalCommission: '0',
      transferTotal: '0',
      openAccountTotal: '0',
      taxTotal: '0',
      cashIn: '0',
      cashOut: '0',
      advanceTotal: '0',
      expectedCash: '0',
      physicalCash: null,
      diff: null,
      saleCount: 0,
      bankBreakdown: [],
      salesDetail: [],
      ...zeroExtras(),
    };
  }

  const paidSaleWhere = {
    branchId,
    shiftId: shift.id,
    status: SaleStatus.PAID,
    userId,
  };

  const paidSales = await prisma.sale.findMany({
    where: paidSaleWhere,
    select: paidSalesSelect,
    orderBy: { createdAt: 'asc' },
  });

  const salesAgg = await prisma.sale.aggregate({
    where: paidSaleWhere,
    _sum: {
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
      taxTotal: true,
    },
    _count: { _all: true },
  });

  const personalPaymentSaleWhere = {
    shiftId: shift.id,
    status: SaleStatus.PAID,
    userId,
  };

  const cashAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.CASH,
    },
    _sum: { grossAmount: true },
  });
  const cardAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.CARD,
    },
    _sum: { grossAmount: true, netAmount: true, commissionAmount: true },
  });
  const transferAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.TRANSFER,
    },
    _sum: { grossAmount: true },
  });
  const openAccountAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.OPEN_ACCOUNT,
    },
    _sum: { grossAmount: true },
  });

  const cashInAgg = await prisma.cashMovement.aggregate({
    where: {
      shiftId: shift.id,
      type: CashMovementType.CASH_IN,
      NOT: { description: { startsWith: 'SALE_CASH_PAYMENT:' } },
    },
    _sum: { amount: true },
  });
  const cashOutAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.CASH_OUT },
    _sum: { amount: true },
  });
  const advanceAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.ADVANCE },
    _sum: { amount: true },
  });

  const openCash = shift.openCash ?? new Prisma.Decimal(0);
  const totalSales = salesAgg._sum.grossTotal ?? new Prisma.Decimal(0);
  const totalDiscount = salesAgg._sum.discountTotal ?? new Prisma.Decimal(0);
  const totalNet = salesAgg._sum.netTotal ?? new Prisma.Decimal(0);
  const taxTotal = salesAgg._sum.taxTotal ?? new Prisma.Decimal(0);

  const cashTotal = cashAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardGross = cardAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardNet = cardAgg._sum.netAmount ?? new Prisma.Decimal(0);
  const totalCommission = cardAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const transferTotal = transferAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const openAccountTotal = openAccountAgg._sum.grossAmount ?? new Prisma.Decimal(0);

  const cashIn = cashInAgg._sum.amount ?? new Prisma.Decimal(0);
  const cashOut = cashOutAgg._sum.amount ?? new Prisma.Decimal(0);
  const advanceTotal = advanceAgg._sum.amount ?? new Prisma.Decimal(0);

  const expectedCash = openCash.plus(cashTotal).plus(cashIn).minus(cashOut).minus(advanceTotal);

  const bankGrouped = await prisma.payment.groupBy({
    by: ['bankId', 'installment'],
    where: {
      paymentType: PaymentType.CARD,
      bankId: { not: null },
      sale: personalPaymentSaleWhere,
    },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });

  const bankIds = Array.from(new Set(bankGrouped.map((b) => b.bankId).filter((x): x is string => Boolean(x))));
  const banks = await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } });
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const bankBreakdown = bankGrouped.map((b) => ({
    bankName: bankNameById.get(b.bankId as string) ?? '',
    installment: b.installment ?? 1,
    gross: (b._sum.grossAmount ?? new Prisma.Decimal(0)).toString(),
    commission: (b._sum.commissionAmount ?? new Prisma.Decimal(0)).toString(),
    net: (b._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
  }));

  const saleCount = salesAgg._count._all;

  const kategoriBreakdown: Record<DashboardKategori, number> = { ...EMPTY_KATEGORI };
  for (const sale of paidSales) {
    for (const item of sale.items) {
      const key = resolveItemKategori(item);
      kategoriBreakdown[key] += item.qty ?? 1;
    }
  }

  let toplamSgkHakki = new Prisma.Decimal(0);
  const toplamVakifOdemesi = new Prisma.Decimal(0);
  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();

  for (const sale of paidSales) {
    if (sale.sgkAmount) {
      toplamSgkHakki = toplamSgkHakki.plus(sale.sgkAmount);
    }
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const kampanyaBreakdown: Array<{ type: string; count: number }> = [];
  const temsilciBreakdown = Array.from(repMap.values())
    .map((r) => ({
      repName: r.repName,
      saleCount: r.saleCount,
      ciro: r.ciro.toString(),
    }))
    .sort((a, b) => Number(b.ciro) - Number(a.ciro));

  const derived = buildDerivedMetrics({
    totalSales,
    taxTotal,
    totalCommission,
    cashTotal,
    cashOut,
    cardNet,
    transferTotal,
    totalNet,
    saleCount,
    toplamSgkHakki,
    toplamVakifOdemesi,
    kategoriBreakdown,
    kampanyaBreakdown,
    temsilciBreakdown,
  });

  return {
    date,
    branchId,
    branchName: branch.name,
    shiftId: shift.id,
    shiftOpenedAt: shift.openedAt,
    openCash: openCash.toString(),
    totalSales: totalSales.toString(),
    totalDiscount: totalDiscount.toString(),
    totalNet: totalNet.toString(),
    cashTotal: cashTotal.toString(),
    cardGross: cardGross.toString(),
    cardNet: cardNet.toString(),
    totalCommission: totalCommission.toString(),
    transferTotal: transferTotal.toString(),
    openAccountTotal: openAccountTotal.toString(),
    taxTotal: taxTotal.toString(),
    cashIn: cashIn.toString(),
    cashOut: cashOut.toString(),
    advanceTotal: advanceTotal.toString(),
    expectedCash: expectedCash.toString(),
    physicalCash: shift.physicalCash ? shift.physicalCash.toString() : null,
    diff: shift.diff ? shift.diff.toString() : null,
    saleCount,
    bankBreakdown,
    salesDetail: await buildSalesDetail(paidSales),
    ...derived,
  };
}

export async function generateDailyExcel(branchId: string, date: Date) {
  const report = await getDailyReport(branchId, date);

  const wb = new ExcelJS.Workbook();
  const sheetName = `Günlük Kasa - ${date.toISOString().slice(0, 10)}`;
  const ws = wb.addWorksheet(sheetName.slice(0, 31));

  const shiftOpenedAtText = report.shiftOpenedAt
    ? (() => {
        const shiftOpenedAt = new Date(report.shiftOpenedAt);
        const dd = String(shiftOpenedAt.getDate()).padStart(2, '0');
        const mm = String(shiftOpenedAt.getMonth() + 1).padStart(2, '0');
        const yyyy = String(shiftOpenedAt.getFullYear());
        const hh = String(shiftOpenedAt.getHours()).padStart(2, '0');
        const min = String(shiftOpenedAt.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yyyy} ${hh}:${min}'de açıldı`;
      })()
    : '';

  ws.addRow(['GÜVEN OPTİK - Günlük Kasa Raporu']);
  ws.addRow([]);
  ws.addRow(['Tarih', date.toISOString().slice(0, 10)]);
  ws.addRow(['Şube', report.branchName]);
  ws.addRow(['Vardiya', shiftOpenedAtText]);
  ws.addRow([]);

  ws.addRow(['── SATIŞ ──']);
  ws.addRow(['Toplam Satış (brüt)', report.totalSales]);
  ws.addRow(['Toplam İndirim', report.totalDiscount]);
  ws.addRow(['Toplam KDV', report.taxTotal]);
  ws.addRow(['Net Satış', report.totalNet]);
  ws.addRow([]);

  ws.addRow(['── ÖDEME DAĞILIMI ──']);
  ws.addRow(['Nakit', report.cashTotal]);
  ws.addRow(['Kart (Brüt)', report.cardGross]);
  ws.addRow(['Kart (Net)', report.cardNet]);
  ws.addRow(['Komisyon', report.totalCommission]);
  ws.addRow(['Havale', report.transferTotal]);
  ws.addRow(['Açık Hesap', report.openAccountTotal]);
  ws.addRow([]);

  ws.addRow(['── BANKA KIRILIMLARI ──']);
  ws.addRow(['Banka', 'Taksit', 'Brüt', 'Komisyon', 'Net']);
  for (const b of report.bankBreakdown) {
    ws.addRow([b.bankName, b.installment, b.gross, b.commission, b.net]);
  }
  ws.addRow([]);

  ws.addRow(['── KASA ──']);
  ws.addRow(['Açılış Kasası', report.openCash]);
  ws.addRow(['Nakit Giriş', report.cashIn]);
  ws.addRow(['Nakit Çıkış', report.cashOut]);
  ws.addRow(['Avans', report.advanceTotal]);
  ws.addRow(['Beklenen Kasa', report.expectedCash]);
  ws.addRow(['Fiziki Kasa', report.physicalCash ?? '']);
  ws.addRow(['Fark', report.diff ?? '']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function getPatronOzet({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    status: SaleStatus.PAID,
    createdAt: { gte: baslangic, lte: bitis },
  };
  if (subeId) where.branchId = subeId;

  const sales = await prisma.sale.findMany({
    where,
    include: {
      payments: true,
      items: { include: { product: true } },
      customer: true,
    },
  });

  const netTotal = sales.reduce((s, sale) => s + Number(sale.netTotal), 0);
  const satisAdedi = sales.length;
  const ortalamaSepet = satisAdedi > 0 ? netTotal / satisAdedi : 0;

  const nakit = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.CASH).reduce((s, p) => s + Number(p.netAmount), 0);
  const kart = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.CARD).reduce((s, p) => s + Number(p.netAmount), 0);
  const acikHesap = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT).reduce((s, p) => s + Number(p.netAmount), 0);
  const sgk = sales.reduce((s, sale) => s + Number(sale.sgkAmount ?? 0), 0);

  const yeniMusteriIds = new Set<string>();
  for (const sale of sales) {
    if (sale.customerId) {
      const prev = await prisma.sale.count({ where: { customerId: sale.customerId, status: SaleStatus.PAID, createdAt: { lt: baslangic } } });
      if (prev === 0) yeniMusteriIds.add(sale.customerId);
    }
  }

  const kdvToplam = sales.reduce((s, sale) => s + (Number(sale.netTotal) - Number(sale.grossTotal)), 0);

  const subeBreakdown: Record<string, { ciro: number; satisAdedi: number; subeAdi: string }> = {};
  for (const sale of sales) {
    if (!sale.branchId) continue;
    if (!subeBreakdown[sale.branchId]) subeBreakdown[sale.branchId] = { ciro: 0, satisAdedi: 0, subeAdi: sale.branchId };
    subeBreakdown[sale.branchId].ciro += Number(sale.netTotal);
    subeBreakdown[sale.branchId].satisAdedi++;
  }

  return {
    netTotal,
    satisAdedi,
    ortalamaSepet,
    nakit,
    kart,
    acikHesap,
    sgk,
    kdvToplam,
    yeniMusteriSayisi: yeniMusteriIds.size,
    subeBreakdown: Object.values(subeBreakdown),
  };
}

export async function getPersonelPerformans({ baslangic, bitis }: { baslangic: Date; bitis: Date }) {
  const sales = await prisma.sale.findMany({
    where: { status: SaleStatus.PAID, createdAt: { gte: baslangic, lte: bitis } },
    include: { user: true, payments: true },
  });

  const byUser: Record<string, { ad: string; satisAdedi: number; ciro: number }> = {};
  for (const sale of sales) {
    const uid = sale.userId ?? 'bilinmiyor';
    const ad = sale.user?.name ?? sale.user?.username ?? 'Bilinmiyor';
    if (!byUser[uid]) byUser[uid] = { ad, satisAdedi: 0, ciro: 0 };
    byUser[uid].satisAdedi++;
    byUser[uid].ciro += Number(sale.netTotal);
  }

  return Object.values(byUser).sort((a, b) => b.ciro - a.ciro);
}

export async function getKategoriBreakdown({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    sale: { status: SaleStatus.PAID, createdAt: { gte: baslangic, lte: bitis } },
    status: { not: ItemStatus.VOID },
  };
  if (subeId) where.sale.branchId = subeId;

  const items = await prisma.saleItem.findMany({
    where,
    include: { product: true },
  });

  const breakdown: Record<string, { ciro: number; adet: number }> = {};
  for (const item of items) {
    const kat = resolveItemKategori(item as any);
    if (!breakdown[kat]) breakdown[kat] = { ciro: 0, adet: 0 };
    breakdown[kat].ciro += Number(item.lineTotal);
    breakdown[kat].adet += Number(item.qty);
  }

  return breakdown;
}

export async function getGunlukSeri({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    status: SaleStatus.PAID,
    createdAt: { gte: baslangic, lte: bitis },
  };
  if (subeId) where.branchId = subeId;

  const sales = await prisma.sale.findMany({ where, select: { createdAt: true, netTotal: true } });

  const byDay: Record<string, number> = {};
  for (const sale of sales) {
    const gun = sale.createdAt.toISOString().split('T')[0];
    byDay[gun] = (byDay[gun] ?? 0) + Number(sale.netTotal);
  }

  return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([tarih, ciro]) => ({ tarih, ciro }));
}

