import { ProductCategory, ProductGroup, ProductType } from '@prisma/client';
import { z } from 'zod';

export const ProductQueryInput = z.object({
  type: z.nativeEnum(ProductType).optional(),
  category: z.nativeEnum(ProductCategory).optional(),
  group: z.nativeEnum(ProductGroup).optional(),
  q: z.string().min(2).optional(),
  barcode: z.string().min(1).optional(),
});

export type ProductQueryInputType = z.infer<typeof ProductQueryInput>;

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const CreateProductInput = z.object({
  name: z.string().min(2),
  productType: z.nativeEnum(ProductType),
  category: z.nativeEnum(ProductCategory),
  subCategory: z.string().optional(),
  group: z.nativeEnum(ProductGroup).optional(),
  price: decimalString,
  taxRate: decimalString.optional().default('20'),
  brand: z.string().optional(),
  model: z.string().optional(),
  barcode: z.string().optional(),
});

export type CreateProductInputType = z.infer<typeof CreateProductInput>;

