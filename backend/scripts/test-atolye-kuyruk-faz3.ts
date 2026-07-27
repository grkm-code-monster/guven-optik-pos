/**
 * FAZ 3 test: Atölye kuyruğu endpoint + erişim kuralları
 * Çalıştır: npx tsx scripts/test-atolye-kuyruk-faz3.ts
 */
import 'dotenv/config';
import { ItemStatus, LinkType, PrismaClient, ProductCategory, Role } from '@prisma/client';
import { getAtolyeKuyruk, updateSaleItemStatus } from '../src/modules/sales/sale.service';
import type { JwtPayload } from '../src/modules/auth/auth.types';

const prisma = new PrismaClient();

function code(err: unknown): string | null {
  return err instanceof Error && 'code' in err ? (err as Error & { code: string }).code : null;
}

function jwt(user: {
  id: string;
  role: Role;
  branchId: string;
  canWorkAtolye?: boolean;
}): JwtPayload {
  return {
    userId: user.id,
    role: user.role,
    branchId: user.branchId,
    shiftId: null,
    canWorkAtolye: user.canWorkAtolye ?? false,
  };
}

async function main() {
  let ok = true;

  const gvn1 = await prisma.branch.findFirst({ where: { code: 'GVN1' } });
  const gvn2 = await prisma.branch.findFirst({ where: { code: 'GVN2' } });
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } });
  if (!gvn1?.hasAtolye || !gvn2 || !admin) {
    console.error('❌ GVN1 (hasAtolye), GVN2 veya admin kullanıcı eksik');
    process.exit(1);
  }

  let workshopUser = await prisma.user.findFirst({
    where: { username: 'test_workshop_gvn1', role: Role.WORKSHOP_STAFF, branchId: gvn1.id },
  });
  if (!workshopUser) {
    console.error('❌ test_workshop_gvn1 kullanıcısı yok — önce test-workshop-status-faz1.ts çalıştırın');
    process.exit(1);
  }

  const salesStaff = await prisma.user.findFirst({
    where: { role: Role.SALES_STAFF, isActive: true, canWorkAtolye: false },
  });

  const labItem = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      OR: [
        { linkType: { in: [LinkType.FRAME_LENS, LinkType.CUSTOMER_FRAME] } },
        { product: { category: ProductCategory.LENS_RX } },
      ],
    },
  });

  if (!labItem || !salesStaff) {
    console.error('❌ Lab kalemi veya SALES_STAFF (canWorkAtolye=false) bulunamadı');
    process.exit(1);
  }

  const original = {
    status: labItem.status,
    atolyeBranchId: labItem.atolyeBranchId,
    sentToLabAt: labItem.sentToLabAt,
    sentToLabByUserId: labItem.sentToLabByUserId,
  };

  await updateSaleItemStatus(labItem.id, ItemStatus.IN_LAB, Role.ADMIN, false, {
    atolyeBranchId: gvn1.id,
    userId: admin.id,
  });

  // Test 1: WORKSHOP_STAFF GVN1 → sadece GVN1 IN_LAB kalemler
  try {
    const queue = await getAtolyeKuyruk(jwt(workshopUser), gvn1.id, ItemStatus.IN_LAB);
    const foreign = queue.filter((i) => i.atolyeBranchId !== gvn1.id);
    const hasTarget = queue.some((i) => i.id === labItem.id);
    if (foreign.length > 0 || !hasTarget) {
      console.error('❌ Test 1: GVN1 kuyruğu beklenen kalemleri içermiyor');
      ok = false;
    } else {
      console.log(`✅ Test 1: WORKSHOP_STAFF GVN1 → ${queue.length} IN_LAB kalem (hepsi GVN1)`);
    }
  } catch (err) {
    console.error('❌ Test 1 hata:', err);
    ok = false;
  }

  // Test 3: WORKSHOP_STAFF başka şube kuyruğunu göremez
  try {
    await getAtolyeKuyruk(jwt(workshopUser), gvn2.id, ItemStatus.IN_LAB);
    console.error('❌ Test 3: farklı şube kuyruğu erişilebilir olmamalıydı');
    ok = false;
  } catch (err) {
    if (code(err) === 'FORBIDDEN_ATOLYE_BRANCH') {
      console.log('✅ Test 3: WORKSHOP_STAFF farklı şube → FORBIDDEN_ATOLYE_BRANCH');
    } else {
      console.error('❌ Test 3 beklenmeyen hata:', err);
      ok = false;
    }
  }

  // Test 4: SALES_STAFF canWorkAtolye=false → 403
  try {
    await getAtolyeKuyruk(jwt(salesStaff), gvn1.id, ItemStatus.IN_LAB);
    console.error('❌ Test 4: SALES_STAFF erişmemeliydi');
    ok = false;
  } catch (err) {
    if (code(err) === 'INSUFFICIENT_PERMISSION') {
      console.log('✅ Test 4: SALES_STAFF → INSUFFICIENT_PERMISSION');
    } else {
      console.error('❌ Test 4 beklenmeyen hata:', err);
      ok = false;
    }
  }

  // Test 2: Hazır → READY + Bugün Tamamlanan sekmesinde
  try {
    await updateSaleItemStatus(labItem.id, ItemStatus.READY, Role.WORKSHOP_STAFF);
    const inLab = await getAtolyeKuyruk(jwt(workshopUser), gvn1.id, ItemStatus.IN_LAB);
    const readyToday = await getAtolyeKuyruk(jwt(workshopUser), gvn1.id, ItemStatus.READY);
    const stillInLab = inLab.some((i) => i.id === labItem.id);
    const inReady = readyToday.some((i) => i.id === labItem.id);
    if (stillInLab || !inReady) {
      console.error('❌ Test 2: READY geçişi veya bugün tamamlanan listesi hatalı');
      ok = false;
    } else {
      console.log('✅ Test 2: Hazır → READY, Bugün Tamamlanan listesinde görünüyor');
    }
  } catch (err) {
    console.error('❌ Test 2 hata:', err);
    ok = false;
  }

  // Restore
  await prisma.saleItem.update({
    where: { id: labItem.id },
    data: original,
  });

  console.log(ok ? '\n✅ FAZ 3 testleri geçti' : '\n❌ FAZ 3 testlerinde hata var');
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
