/**
 * FAZ 1 test: WORKSHOP_STAFF rol + status geçiş kuralları + hasAtolye
 * Çalıştır: npx tsx scripts/test-workshop-status-faz1.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { ItemStatus, LinkType, PrismaClient, ProductCategory, Role } from '@prisma/client';
import { updateSaleItemStatus } from '../src/modules/sales/sale.service';

const prisma = new PrismaClient();

function isForbidden(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as Error & { code: string }).code === 'FORBIDDEN_STATUS_TRANSITION';
}

async function expectForbidden(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.error(`❌ ${label}: 403 bekleniyordu, başarılı oldu`);
    return false;
  } catch (err) {
    if (isForbidden(err)) {
      console.log(`✅ ${label}: 403 FORBIDDEN_STATUS_TRANSITION`);
      return true;
    }
    console.error(`❌ ${label}: beklenmeyen hata`, err);
    return false;
  }
}

async function expectSuccess(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`✅ ${label}: başarılı`);
    return true;
  } catch (err) {
    console.error(`❌ ${label}: başarısız`, err);
    return false;
  }
}

async function main() {
  let ok = true;

  const roleEnum = await prisma.$queryRaw<Array<{ role_value: string }>>`
    SELECT enumlabel AS role_value FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND enumlabel = 'WORKSHOP_STAFF'
  `;
  if (roleEnum.length !== 1) {
    console.error('❌ WORKSHOP_STAFF enum DB\'de yok');
    process.exit(1);
  }
  console.log('✅ WORKSHOP_STAFF enum mevcut');

  const gvn1 = await prisma.branch.findFirst({ where: { code: 'GVN1' } });
  if (!gvn1) {
    console.error('❌ GVN1 şubesi bulunamadı');
    process.exit(1);
  }
  await prisma.branch.update({ where: { id: gvn1.id }, data: { hasAtolye: true } });

  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } });
  const inLabOpts = { atolyeBranchId: gvn1.id, userId: admin?.id };

  const item = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      OR: [
        { linkType: { in: [LinkType.FRAME_LENS, LinkType.CUSTOMER_FRAME] } },
        { product: { category: ProductCategory.LENS_RX } },
      ],
    },
    include: { sale: { select: { id: true } } },
  });
  if (!item) {
    console.error('❌ Test için lab adayı PAID satış kalemi bulunamadı');
    process.exit(1);
  }
  console.log(`ℹ️  Test kalemi: ${item.id} (satış ${item.sale.id}, mevcut durum: ${item.status})`);

  const originalStatus = item.status;

  ok &&= await expectForbidden(
    'SALES_STAFF → IN_LAB',
    () => updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.SALES_STAFF),
  );

  ok &&= await expectSuccess(
    'STORE_MANAGER → IN_LAB',
    () => updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.STORE_MANAGER, false, inLabOpts),
  );

  ok &&= await expectSuccess(
    'STORE_MANAGER → READY',
    () => updateSaleItemStatus(item.id, ItemStatus.READY, Role.STORE_MANAGER),
  );

  const pinHash = await bcrypt.hash('123456', 10);
  const workshopUser = await prisma.user.upsert({
    where: { username: 'test_workshop_gvn1' },
    create: {
      name: 'Test Atölye GVN1',
      username: 'test_workshop_gvn1',
      pin: pinHash,
      role: Role.WORKSHOP_STAFF,
      branchId: gvn1.id,
      isActive: true,
    },
    update: {
      pin: pinHash,
      role: Role.WORKSHOP_STAFF,
      branchId: gvn1.id,
      isActive: true,
    },
  });
  console.log(`✅ WORKSHOP_STAFF test kullanıcısı: ${workshopUser.username}`);

  ok &&= await expectSuccess(
    'WORKSHOP_STAFF → IN_LAB',
    () => updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.WORKSHOP_STAFF, false, inLabOpts),
  );

  ok &&= await expectSuccess(
    'WORKSHOP_STAFF → READY',
    () => updateSaleItemStatus(item.id, ItemStatus.READY, Role.WORKSHOP_STAFF),
  );

  ok &&= await expectForbidden(
    'WORKSHOP_STAFF → DELIVERED',
    () => updateSaleItemStatus(item.id, ItemStatus.DELIVERED, Role.WORKSHOP_STAFF),
  );

  ok &&= await expectSuccess(
    'WAREHOUSE_MANAGER → IN_LAB',
    () => updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.WAREHOUSE_MANAGER, false, inLabOpts),
  );

  if (originalStatus !== ItemStatus.IN_LAB) {
    await updateSaleItemStatus(item.id, originalStatus, Role.STORE_MANAGER);
  } else {
    await updateSaleItemStatus(item.id, ItemStatus.ORDERED, Role.STORE_MANAGER);
  }
  console.log(`ℹ️  Kalem durumu geri alındı`);

  const gvn1Check = await prisma.branch.findUnique({
    where: { id: gvn1.id },
    select: { code: true, hasAtolye: true },
  });
  if (gvn1Check?.hasAtolye === true) {
    console.log(`✅ GVN1 hasAtolye = true (${gvn1Check.code})`);
  } else {
    console.error('❌ GVN1 hasAtolye doğrulanamadı');
    ok = false;
  }

  console.log(ok ? '\n🎉 Tüm testler geçti' : '\n⚠️  Bazı testler başarısız');
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
