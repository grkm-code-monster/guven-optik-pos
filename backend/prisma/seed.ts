import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { seedProductsIfMissing } from '../src/modules/products/product.service';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'PILOT01' },
    create: {
      name: 'Pilot Şube',
      code: 'PILOT01',
      isActive: true,
    },
    update: {},
  });

  const pinHash = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      name: 'Sistem Yöneticisi',
      username: 'admin',
      pin: pinHash,
      role: Role.ADMIN,
      branchId: branch.id,
      isActive: true,
    },
    update: {
      pin: pinHash,
      isActive: true,
      role: Role.ADMIN,
      branchId: branch.id,
    },
  });

  await seedProductsIfMissing();

  const garanti = await prisma.bank.findFirst({ where: { name: 'Garanti Bankası' } });
  const yapiKredi = await prisma.bank.findFirst({ where: { name: 'Yapı Kredi' } });
  const ziraat = await prisma.bank.findFirst({ where: { name: 'Ziraat Bankası' } });

  const banks = [
    garanti ?? (await prisma.bank.create({ data: { name: 'Garanti Bankası', isActive: true } })),
    yapiKredi ?? (await prisma.bank.create({ data: { name: 'Yapı Kredi', isActive: true } })),
    ziraat ?? (await prisma.bank.create({ data: { name: 'Ziraat Bankası', isActive: true } })),
  ];

  const startDate = new Date();

  const rates: Record<string, Array<{ installment: number; rate: string }>> = {
    'Garanti Bankası': [
      { installment: 1, rate: '0.0200' },
      { installment: 3, rate: '0.0400' },
      { installment: 6, rate: '0.0650' },
      { installment: 9, rate: '0.0900' },
      { installment: 12, rate: '0.1200' },
    ],
    'Yapı Kredi': [
      { installment: 1, rate: '0.0250' },
      { installment: 3, rate: '0.0450' },
      { installment: 6, rate: '0.0700' },
      { installment: 12, rate: '0.1300' },
    ],
    'Ziraat Bankası': [
      { installment: 1, rate: '0.0180' },
      { installment: 3, rate: '0.0380' },
      { installment: 6, rate: '0.0600' },
    ],
  };

  for (const bank of banks) {
    const bankRates = rates[bank.name] ?? [];
    for (const r of bankRates) {
      const existingRate = await prisma.installmentRate.findFirst({
        where: { bankId: bank.id, installment: r.installment, startDate },
      });
      if (!existingRate) {
        await prisma.installmentRate.create({
          data: {
            bankId: bank.id,
            installment: r.installment,
            commissionRate: new Prisma.Decimal(r.rate),
            startDate,
          },
        });
      }
    }

    const existingPos = await prisma.posDevice.findFirst({
      where: { bankId: bank.id, branchId: branch.id, isActive: true },
    });
    if (!existingPos) {
      await prisma.posDevice.create({
        data: {
          bankId: bank.id,
          branchId: branch.id,
          name: `${bank.name} POS 1`,
          isActive: true,
        },
      });
    }
  }

  const gvnSubeler = [
    { name: 'Güven Optik 1959 - 1', code: 'GVN1', sirketId: 3, sirketAdi: 'ADESE', pdksPlaceId: 5732 },
    { name: 'Güven Optik 1959 - 2', code: 'GVN2', sirketId: 2, sirketAdi: 'NG', pdksPlaceId: 5727 },
    { name: 'Güven Optik 1959 - 3', code: 'GVN3', sirketId: 3, sirketAdi: 'ADESE', pdksPlaceId: 5733 },
    { name: 'Güven Optik 1959 - 5', code: 'GVN5', sirketId: 4, sirketAdi: 'POTENTIAL', pdksPlaceId: 5735 },
    { name: 'Güven Optik 1959 - 6', code: 'GVN6', sirketId: 3, sirketAdi: 'ADESE' },
    { name: 'Güven Optik 1959 - 7', code: 'GVN7', sirketId: 3, sirketAdi: 'ADESE' },
    { name: 'Güven Optik 1959 - 8', code: 'GVN8', sirketId: 3, sirketAdi: 'ADESE' },
    { name: 'Güven Optik 1959 - 9', code: 'GVN9', sirketId: 3, sirketAdi: 'ADESE', pdksPlaceId: 5734 },
    { name: 'Güven Optik 1959 - 10', code: 'GVN10', sirketId: 2, sirketAdi: 'NG' },
    { name: 'Ana Depo', code: 'ANADEPO', sirketId: 2, sirketAdi: 'NG' },
    { name: 'Yönetim', code: 'YONETIM', sirketId: 1, sirketAdi: 'GÜVEN OPTİK 1959', pdksPlaceId: 8027 },
  ];

  for (const sube of gvnSubeler) {
    await prisma.branch.upsert({
      where: { code: sube.code },
      update: sube,
      create: { ...sube, isActive: true },
    });
  }

  console.log('Seed OK: branch PILOT01, user admin / PIN 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
