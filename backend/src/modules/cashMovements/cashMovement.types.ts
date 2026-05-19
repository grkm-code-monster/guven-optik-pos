import { CashMovementType } from '@prisma/client';
import { z } from 'zod';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const CreateCashMovementInput = z.object({
  type: z.nativeEnum(CashMovementType),
  amount: decimalString.refine((v) => Number(v) > 0, { message: 'amount must be positive' }),
  description: z.string().min(5),
});

export type CreateCashMovementInputType = z.infer<typeof CreateCashMovementInput>;

