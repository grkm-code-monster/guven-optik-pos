import { z } from 'zod';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const OpenShiftInput = z.object({
  openCash: decimalString,
  note: z.string().optional(),
});

export type OpenShiftInputType = z.infer<typeof OpenShiftInput>;

export const CloseShiftInput = z.object({
  physicalCash: decimalString,
  diffReason: z.string().optional(),
});

export type CloseShiftInputType = z.infer<typeof CloseShiftInput>;

