/**
 * canWorkAtolye bayrağı testi
 * Çalıştır: npx tsx scripts/test-can-work-atolye.ts
 */
import 'dotenv/config';
import { ItemStatus, PrismaClient, Role } from '@prisma/client';
import { updateSaleItemStatus } from '../src/modules/sales/sale.service';

const prisma = new PrismaClient();

function isForbidden(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as Error & { code: string }).code === 'FORBIDDEN_STATUS_TRANSITION';
}

async function main() {
  let ok = true;

  const salesStaff = await prisma.user.findFirst({ where: { role: Role.SALES_STAFF, isActive: true } });
  if (!salesStaff) {
    console.error('❌ SALES_STAFF kullanıcı bulunamadı');
    process.exit(1);
  }

  const gvn1 = await prisma.branch.findFirst({ where: { code: 'GVN1' } });
  if (!gvn1) {
    console.error('❌ GVN1 bulunamadı');
    process.exit(1);
  }
  await prisma.branch.update({ where: { id: gvn1.id }, data: { hasAtolye: true } });
  const inLabOpts = { atolyeBranchId: gvn1.id, userId: salesStaff.id };

  const item = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      OR: [
        { linkType: { in: ['FRAME_LENS', 'CUSTOMER_FRAME'] } },
        { product: { category: 'LENS_RX' } },
      ],
    },
  });
  if (!item) {
    console.error('❌ Test kalemi bulunamadı');
    process.exit(1);
  }

  const originalStatus = item.status;

  await prisma.user.update({
    where: { id: salesStaff.id },
    data: { canWorkAtolye: false },
  });

  try {
    await updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.SALES_STAFF, false);
    console.error('❌ canWorkAtolye=false SALES_STAFF → IN_LAB: 403 bekleniyordu');
    ok = false;
  } catch (err) {
    if (isForbidden(err)) {
      console.log('✅ canWorkAtolye=false SALES_STAFF → IN_LAB: 403');
    } else {
      console.error('❌ Beklenmeyen hata (false)', err);
      ok = false;
    }
  }

  await prisma.user.update({
    where: { id: salesStaff.id },
    data: { canWorkAtolye: true },
  });

  try {
    await updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.SALES_STAFF, true, inLabOpts);
    console.log('✅ canWorkAtolye=true SALES_STAFF → IN_LAB: başarılı');
  } catch (err) {
    console.error('❌ canWorkAtolye=true SALES_STAFF → IN_LAB başarısız', err);
    ok = false;
  }

  try {
    await updateSaleItemStatus(item.id, ItemStatus.READY, Role.SALES_STAFF, true);
    console.log('✅ canWorkAtolye=true SALES_STAFF → READY: başarılı');
  } catch (err) {
    console.error('❌ canWorkAtolye=true SALES_STAFF → READY başarısız', err);
    ok = false;
  }

  try {
    await updateSaleItemStatus(item.id, ItemStatus.DELIVERED, Role.SALES_STAFF, true);
    console.log('✅ canWorkAtolye=true SALES_STAFF → DELIVERED: başarılı (rol matrisi)');
  } catch (err) {
    console.error('❌ canWorkAtolye=true SALES_STAFF → DELIVERED başarısız', err);
    ok = false;
  }

  await updateSaleItemStatus(item.id, originalStatus, Role.STORE_MANAGER, false);
  await prisma.user.update({
    where: { id: salesStaff.id },
    data: { canWorkAtolye: false },
  });

  const col = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'canWorkAtolye'
  `;
  if (col.length === 1) {
    console.log('✅ User.canWorkAtolye kolonu mevcut');
  } else {
    console.error('❌ User.canWorkAtolye kolonu yok');
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
