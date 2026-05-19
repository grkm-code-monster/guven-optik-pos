import { CashMovementType, PaymentType, Prisma, SaleStatus, ShiftStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../database/prisma';

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

export async function getDailyReport(branchId: string, date: Date) {
  const { start, end } = dayRange(date);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  const shift = await prisma.shift.findFirst({
    where: {
      branchId,
      status: { in: [ShiftStatus.OPEN, ShiftStatus.CLOSED] },
      openedAt: { gte: start, lte: end },
    },
    orderBy: { openedAt: 'desc' },
  });

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
    };
  }

  const salesAgg = await prisma.sale.aggregate({
    where: {
      branchId,
      shiftId: shift.id,
      status: SaleStatus.PAID,
    },
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
    saleCount: salesAgg._count._all,
    bankBreakdown,
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

