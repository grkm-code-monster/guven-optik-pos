import { CashMovementType, PaymentType, Prisma, Role, SaleStatus, ShiftStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CloseShiftInputType, OpenShiftInputType } from './shift.types';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export async function openShift(userId: string, branchId: string, input: OpenShiftInputType) {
  const existingOpen = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
  });

  if (existingOpen) {
    throw codeError('SHIFT_ALREADY_OPEN', 'Açık vardiya mevcut, önce kapatın.');
  }

  const shift = await prisma.shift.create({
    data: {
      userId,
      branchId,
      openCash: new Prisma.Decimal(input.openCash),
      status: ShiftStatus.OPEN,
    },
  });

  return shift;
}

export async function getCurrentShift(branchId: string) {
  return prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });
}

export async function ensureOpenShift(userId: string, branchId: string) {
  const existing = await getCurrentShift(branchId);
  if (existing) return existing;

  return prisma.shift.create({
    data: {
      userId,
      branchId,
      openCash: new Prisma.Decimal(0),
      status: ShiftStatus.OPEN,
    },
  });
}

async function calculateExpectedCash(
  shift: { id: string; branchId: string; openedAt: Date; closedAt: Date | null },
  openCash: Prisma.Decimal,
) {
  const shiftId = shift.id;
  const cashInAgg = await prisma.cashMovement.aggregate({
    where: { shiftId, type: CashMovementType.CASH_IN },
    _sum: { amount: true },
  });
  const cashOutAgg = await prisma.cashMovement.aggregate({
    where: { shiftId, type: CashMovementType.CASH_OUT },
    _sum: { amount: true },
  });
  const advanceAgg = await prisma.cashMovement.aggregate({
    where: { shiftId, type: CashMovementType.ADVANCE },
    _sum: { amount: true },
  });

  const cashIn = cashInAgg._sum.amount ?? new Prisma.Decimal(0);
  const cashOut = cashOutAgg._sum.amount ?? new Prisma.Decimal(0);
  const advance = advanceAgg._sum.amount ?? new Prisma.Decimal(0);

  // ÖNEMLİ (14.10.2026 — "sehven açık hesap" düzeltmesi): eskiden burada
  // `sale: { shiftId }` ile sadece BU vardiyada YAPILMIŞ satışların nakit ödemeleri
  // sayılıyordu. Ama geçmiş bir satışın açık hesap bakiyesi bu vardiya SIRASINDA
  // nakit tahsil edilirse, o ödeme ESKİ satışa (ve dolayısıyla ESKİ vardiyaya) bağlı
  // olduğu için bu sorguya hiç girmiyordu — kasadaki fiziki para fazla çıkıyor ama
  // sistem bunu "beklenmiyor" sayıyordu. Artık ödeme hangi satışa ait olursa olsun,
  // bu vardiyanın açık olduğu zaman aralığında tahsil edilmiş mi diye bakılıyor.
  const cashPayments = await prisma.payment.findMany({
    where: {
      paymentType: PaymentType.CASH,
      sale: { branchId: shift.branchId, status: SaleStatus.PAID },
      createdAt: {
        gte: shift.openedAt,
        ...(shift.closedAt ? { lte: shift.closedAt } : {}),
      },
    },
    select: { grossAmount: true },
  });

  const cashPaymentTotal = cashPayments.reduce(
    (acc, p) => acc.plus(p.grossAmount),
    new Prisma.Decimal(0),
  );

  return openCash.plus(cashIn).minus(cashOut).minus(advance).plus(cashPaymentTotal);
}

export async function closeShift(
  shiftId: string,
  userId: string,
  role: Role,
  input: CloseShiftInputType,
) {
  if (role !== Role.STORE_MANAGER && role !== Role.ADMIN) {
    throw codeError('INSUFFICIENT_PERMISSION', 'Bu işlem için yetkiniz yok.');
  }

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) {
    throw codeError('SHIFT_NOT_FOUND', 'Vardiya bulunamadı.');
  }

  if (shift.status === ShiftStatus.CLOSED) {
    throw codeError('SHIFT_ALREADY_CLOSED', 'Vardiya zaten kapalı.');
  }

  const openCash = shift.openCash ?? new Prisma.Decimal(0);
  const expectedCash = await calculateExpectedCash(shift, openCash);

  const physicalCash = new Prisma.Decimal(input.physicalCash);
  const diff = physicalCash.minus(expectedCash);

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      physicalCash,
      diff,
      diffReason: input.diffReason,
      status: ShiftStatus.CLOSED,
      closedAt: new Date(),
    },
  });

  return updated;
}

const OTOMATIK_KAPATMA_NOTU = 'OTOMATİK KAPATMA — vardiya 23:59\'da elle kapatılmadığı için sistem tarafından kapatıldı. Fiziki kasa sayılmadı, beklenen tutar esas alındı.';

/** Gün sonunda (23:59) hâlâ açık kalan vardiyaları elle sayım beklemeden kapatır. */
export async function autoCloseOpenShifts(now: Date = new Date()) {
  const acikVardiyalar = await prisma.shift.findMany({
    where: { status: ShiftStatus.OPEN },
  });

  let kapatilan = 0;
  for (const shift of acikVardiyalar) {
    const openCash = shift.openCash ?? new Prisma.Decimal(0);
    const expectedCash = await calculateExpectedCash(shift, openCash);

    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        physicalCash: expectedCash,
        diff: new Prisma.Decimal(0),
        diffReason: OTOMATIK_KAPATMA_NOTU,
        status: ShiftStatus.CLOSED,
        closedAt: now,
      },
    });
    kapatilan++;
  }

  return kapatilan;
}

