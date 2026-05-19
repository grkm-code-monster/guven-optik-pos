import { ItemStatus, Prisma, ProductCategory, ProductGroup, ProductType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CreateProductInputType, ProductQueryInputType } from './product.types';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export async function getProducts(query: ProductQueryInputType) {
  const where: any = { isActive: true };

  if (query.type) where.productType = query.type;
  if (query.category) where.category = query.category;
  if (query.group) where.group = query.group;
  if (query.barcode) where.barcode = query.barcode;

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { brand: { contains: query.q, mode: 'insensitive' } },
      { model: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  return prisma.product.findMany({
    where,
    take: 50,
    orderBy: { name: 'asc' },
  });
}

export async function getProductByBarcode(barcode: string) {
  const product = await prisma.product.findUnique({
    where: { barcode },
  });

  if (!product || !product.isActive) {
    throw codeError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı.');
  }

  return product;
}

export async function getFavoriteProducts() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const grouped = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: {
      status: { not: ItemStatus.VOID },
      sale: { createdAt: { gte: since } },
    },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: 20,
  });

  const ids = grouped.map((g) => g.productId);
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
}

export async function createProduct(input: CreateProductInputType) {
  if (input.barcode) {
    const existing = await prisma.product.findUnique({ where: { barcode: input.barcode } });
    if (existing) {
      throw codeError('PRODUCT_BARCODE_EXISTS', 'Bu barkod zaten kayıtlı.');
    }
  }

  return prisma.product.create({
    data: {
      name: input.name,
      productType: input.productType,
      category: input.category,
      subCategory: input.subCategory,
      group: input.group,
      price: new Prisma.Decimal(input.price),
      taxRate: new Prisma.Decimal(input.taxRate),
      brand: input.brand,
      model: input.model,
      barcode: input.barcode,
      isActive: true,
    },
  });
}

export async function seedProductsIfMissing() {
  const seed: Array<{
    name: string;
    productType: ProductType;
    category: ProductCategory;
    group?: ProductGroup;
    brand?: string;
    model?: string;
    price: string;
  }> = [
    { name: 'Ray-Ban RB2140', productType: ProductType.READY, category: ProductCategory.SUNGLASSES_READY, group: ProductGroup.UPPER, brand: 'Ray-Ban', model: 'RB2140', price: '4500' },
    { name: 'Güneş Gözlüğü Orta', productType: ProductType.READY, category: ProductCategory.SUNGLASSES_READY, group: ProductGroup.MID, price: '1200' },
    { name: 'Optik Çerçeve Üst', productType: ProductType.READY, category: ProductCategory.OPTICAL_FRAME_READY, group: ProductGroup.UPPER, price: '3800' },
    { name: 'Freshlook Renkli Lens', productType: ProductType.READY, category: ProductCategory.CONTACT_LENS_READY, brand: 'Freshlook', price: '450' },
    { name: 'Solüsyon 360ml', productType: ProductType.READY, category: ProductCategory.SOLUTION, price: '280' },
    { name: 'Gözlük Bezi', productType: ProductType.READY, category: ProductCategory.ACCESSORY, price: '50' },

    { name: 'Optik Çerçeve Üst Grup', productType: ProductType.PRESCRIBED, category: ProductCategory.OPTICAL_FRAME_RX, group: ProductGroup.UPPER, price: '4200' },
    { name: 'Optik Çerçeve Orta Grup', productType: ProductType.PRESCRIBED, category: ProductCategory.OPTICAL_FRAME_RX, group: ProductGroup.MID, price: '1800' },
    { name: 'Üst Progressif Cam', productType: ProductType.PRESCRIBED, category: ProductCategory.LENS_RX, group: ProductGroup.PROGRESSIVE_UPPER, price: '8500' },
    { name: 'Orta Progressif Cam', productType: ProductType.PRESCRIBED, category: ProductCategory.LENS_RX, group: ProductGroup.PROGRESSIVE_MID, price: '4200' },
    { name: 'Stok Cam Tek Odak', productType: ProductType.PRESCRIBED, category: ProductCategory.LENS_RX, group: ProductGroup.SINGLE_STOCK, price: '800' },
    { name: 'Günlük Lens', productType: ProductType.PRESCRIBED, category: ProductCategory.CONTACT_LENS_RX, group: ProductGroup.CONTACT_DAILY, price: '350' },
    { name: 'Güneş Çerçeve Üst', productType: ProductType.PRESCRIBED, category: ProductCategory.SUNGLASSES_RX, group: ProductGroup.UPPER, price: '5200' },
  ];

  for (const p of seed) {
    const existing = await prisma.product.findFirst({
      where: {
        name: p.name,
        productType: p.productType,
        category: p.category,
        isActive: true,
      },
    });
    if (existing) continue;

    await prisma.product.create({
      data: {
        name: p.name,
        productType: p.productType,
        category: p.category,
        group: p.group,
        brand: p.brand,
        model: p.model,
        price: new Prisma.Decimal(p.price),
        taxRate: new Prisma.Decimal('20'),
        isActive: true,
      },
    });
  }
}

