/**
 * Referans numarası üretim testi
 *   npx tsx scripts/test-referans-no.ts
 */
import { ProductCategory, ProductType } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { createProduct } from '../src/modules/products/product.service';
import {
  generateSatisReferansNo,
  generateUrunReferansNo,
} from '../src/modules/shared/referans-no.util';

const ODOO_PLACEHOLDER_NAME = '__ODOO_PLACEHOLDER__';

async function testParallelSatis() {
  const branches = ['GVN2', 'GVN3'];
  const perBranch = 3;
  const tasks: Promise<string>[] = [];
  for (const b of branches) {
    for (let i = 0; i < perBranch; i++) {
      tasks.push(generateSatisReferansNo(b));
    }
  }
  const nums = await Promise.all(tasks);
  const unique = new Set(nums);
  console.log('\n=== Paralel satış referansları ===');
  console.log('Üretilen:', nums);
  console.log('Benzersiz:', unique.size, '/', nums.length, unique.size === nums.length ? 'OK' : 'ÇAKIŞMA');

  for (const b of branches) {
    const branchNums = nums.filter((n) => n.includes(`-${b}-`));
    console.log(` ${b}:`, branchNums);
  }
}

async function testSequentialUrun() {
  const nums: string[] = [];
  for (let i = 0; i < 3; i++) {
    nums.push(await generateUrunReferansNo());
  }
  console.log('\n=== Ardışık ürün referansları ===');
  console.log(nums.join('\n'));
}

async function testCreateProduct() {
  const p = await createProduct({
    name: `Test Referans Ürün ${Date.now()}`,
    productType: ProductType.READY,
    category: ProductCategory.ACCESSORY,
    price: '99.99',
    taxRate: '20',
  });
  console.log('\n=== createProduct ===');
  console.log('referansNo:', p.referansNo);
  await prisma.product.delete({ where: { id: p.id } });
  console.log('(test ürün silindi)');
}

async function testPlaceholder() {
  const ph = await prisma.product.findFirst({ where: { name: ODOO_PLACEHOLDER_NAME } });
  console.log('\n=== Placeholder ürün ===');
  console.log('var:', !!ph, 'referansNo:', ph?.referansNo ?? '(yok)');
}

async function main() {
  await testParallelSatis();
  await testSequentialUrun();
  await testCreateProduct();
  await testPlaceholder();
  console.log('\nBitti.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
