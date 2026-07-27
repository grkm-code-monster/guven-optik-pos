import { z } from 'zod';
import type { Role } from '@prisma/client';

export const LoginInput = z.object({
  username: z.string().min(1),
  pin: z.string().min(1),
});

export type LoginInputType = z.infer<typeof LoginInput>;

export const VerifyManagerPinInput = z.object({
  pin: z.string().min(1),
  branchId: z.string().uuid(),
});

export type VerifyManagerPinInputType = z.infer<typeof VerifyManagerPinInput>;

export type JwtPayload = {
  userId: string;
  role: Role;
  branchId: string;
  shiftId: string | null;
  canWorkAtolye: boolean;
  ekYetkiler: string[];
};
