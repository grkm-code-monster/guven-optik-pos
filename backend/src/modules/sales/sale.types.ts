import {
  LinkType,
  PaymentType,
  PrescriptionSource,
  PrescriptionType,
} from '@prisma/client';
import { z } from 'zod';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const CreateSaleInput = z.object({
  customerId: z.string().uuid(),
  shiftId: z.string().uuid(),
});
export type CreateSaleInputType = z.infer<typeof CreateSaleInput>;

export const PrescriptionInput = z.object({
  prescriptionType: z.nativeEnum(PrescriptionType),
  prescriptionSource: z.nativeEnum(PrescriptionSource).optional().default(PrescriptionSource.MANUAL),
  doctorName: z.string().optional(),
  prescriptionDate: z.string().datetime().optional(),
  eReceteCode: z.string().optional(),

  r_pd: decimalString.optional(),
  r_sph: decimalString.optional(),
  r_cyl: decimalString.optional(),
  r_aks: z.number().int().optional(),
  r_add: decimalString.optional(),

  l_pd: decimalString.optional(),
  l_sph: decimalString.optional(),
  l_cyl: decimalString.optional(),
  l_aks: z.number().int().optional(),
  l_add: decimalString.optional(),

  near_r_sph: decimalString.optional(),
  near_l_sph: decimalString.optional(),

  lens_r_sph: decimalString.optional(),
  lens_r_cyl: decimalString.optional(),
  lens_r_aks: z.number().int().optional(),
  lens_r_bc: decimalString.optional(),
  lens_r_dia: decimalString.optional(),
  lens_r_add: decimalString.optional(),
  lens_r_color: z.string().optional(),
  lens_r_brand: z.string().optional(),

  lens_l_sph: decimalString.optional(),
  lens_l_cyl: decimalString.optional(),
  lens_l_aks: z.number().int().optional(),
  lens_l_bc: decimalString.optional(),
  lens_l_dia: decimalString.optional(),
  lens_l_add: decimalString.optional(),
  lens_l_color: z.string().optional(),
  lens_l_brand: z.string().optional(),

  solution: z.string().optional(),
  solutionQty: z.number().int().optional(),
});
export type PrescriptionInputType = z.infer<typeof PrescriptionInput>;

export const FrameInput = z.object({
  sortOrder: z.number().int().optional().default(1),
  barcode: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  h: decimalString.optional(),
  cap: decimalString.optional(),
  vertex: decimalString.optional(),
  pantos: decimalString.optional(),
  frameAngle: decimalString.optional(),
});
export type FrameInputType = z.infer<typeof FrameInput>;

export const AddSaleItemInput = z.object({
  productId: z.string().min(1),
  odooProductId: z.string().optional().nullable(),
  odooProductName: z.string().optional().nullable(),
  odooCategoryId: z.number().int().optional(),
  lotNo: z.string().optional().nullable(),
  qty: z.number().int().min(1).optional().default(1),
  unitPrice: decimalString,
  discount: decimalString.optional().default('0'),
  taxRate: z.number().min(0).max(100).optional(),
  linkedItemId: z.string().uuid().optional(),
  linkType: z.nativeEnum(LinkType).optional(),
  pairWithItemId: z.string().uuid().optional(),
  prescription: PrescriptionInput.optional(),
  frames: z.array(FrameInput).optional(),
});
export type AddSaleItemInputType = z.infer<typeof AddSaleItemInput>;

export const UpdateSaleItemInput = AddSaleItemInput;
export type UpdateSaleItemInputType = z.infer<typeof UpdateSaleItemInput>;

export const PaymentInput = z.object({
  paymentType: z.nativeEnum(PaymentType),
  grossAmount: decimalString,
  bankId: z.string().uuid().optional(),
  posDeviceId: z.string().uuid().optional(),
  installment: z.number().int().optional(),
  bankName: z.string().optional(),
});
export type PaymentInputType = z.infer<typeof PaymentInput>;

export const ConfirmSaleInput = z.object({
  payments: z.array(PaymentInput).min(1),
  thirdPartyAmount: z.number().min(0).default(0), // SGK + Vakıf + Hediye çeki toplamı
  sgkAmount: z.number().min(0).default(0),
  vakifAmount: z.number().min(0).default(0),
  kasaIndirimTutar: z.number().min(0).default(0),
  lensOrderMeasurements: z.array(z.any()).optional(),
  pricingInvoiceNote: z.string().optional(),
  faturaKesilsin: z.boolean().default(true),
});
export type ConfirmSaleInputType = z.infer<typeof ConfirmSaleInput>;

export const VoidSaleInput = z.object({
  voidReason: z.string().min(5),
});
export type VoidSaleInputType = z.infer<typeof VoidSaleInput>;

export const UpdateDraftMetaInput = z.object({
  step: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(5.5),
    z.literal(6),
  ]).optional(),
  pricing: z.unknown().optional(),
  payments: z.unknown().optional(),
  measurements: z.unknown().optional(),
});
export type UpdateDraftMetaInputType = z.infer<typeof UpdateDraftMetaInput>;

