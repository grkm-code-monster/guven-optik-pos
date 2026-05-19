import { Prisma, ShiftStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CreateCashMovementInputType } from './cashMovement.types';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export async function createCashMovement(
  userId: string,
  branchId: string,
  shiftId: string,
  input: CreateCashMovementInputType,
) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.status !== ShiftStatus.OPEN || shift.branchId !== branchId) {
    throw codeError('SHIFT_NOT_OPEN', 'Vardiya açık olmalı.');
  }

  return prisma.cashMovement.create({
    data: {
      userId,
      branchId,
      shiftId,
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      description: input.description,
    },
  });
}

export async function getCashMovements(shiftId: string) {
  return prisma.cashMovement.findMany({
    where: { shiftId },
    orderBy: { createdAt: 'asc' },
  });
}

