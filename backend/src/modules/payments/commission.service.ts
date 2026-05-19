import Decimal from 'decimal.js';
import { prisma } from '../../database/prisma';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export async function calculateCommission(
  bankId: string,
  installment: number,
  grossAmount: string,
  date: Date,
) {
  const rate = await prisma.installmentRate.findFirst({
    where: {
      bankId,
      installment,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
  });

  if (!rate) {
    throw codeError('COMMISSION_RATE_NOT_FOUND', 'Komisyon oranı bulunamadı.');
  }

  const gross = new Decimal(grossAmount);
  const commissionRate = new Decimal(rate.commissionRate.toString());
  const commissionAmount = gross.mul(commissionRate);
  const netAmount = gross.sub(commissionAmount);

  return {
    commissionRate: commissionRate.toFixed(4),
    commissionAmount: commissionAmount.toFixed(2),
    netAmount: netAmount.toFixed(2),
  };
}

