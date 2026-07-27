/**
 * FAZ 2 test: Laboratuvara gönderim (atolyeBranchId, lab eligibility)
 * Çalıştır: npx tsx scripts/test-atolye-gonderim-faz2.ts
 */
import 'dotenv/config';
import { ItemStatus, LinkType, PrismaClient, ProductCategory, Role } from '@prisma/client';
import { updateSaleItemStatus, getAtolyeBranches } from '../src/modules/sales/sale.service';
import { isLabEligibleSaleItem } from '../src/modules/sales/sale-item-lab.util';

const prisma = new PrismaClient();

function code(err: unknown): string | null {
  return err instanceof Error && 'code' in err ? (err as Error & { code: string }).code : null;
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

  const labItem = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      OR: [
        { linkType: { in: [LinkType.FRAME_LENS, LinkType.CUSTOMER_FRAME] } },
        { product: { category: ProductCategory.LENS_RX } },
      ],
    },
    include: { product: { select: { category: true } } },
  });

  const accessoryItem = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      linkType: null,
      product: { category: { not: ProductCategory.LENS_RX } },
    },
    include: { product: { select: { category: true } } },
  });

  if (!labItem) {
    console.error('❌ Lab adayı kalem bulunamadı');
    process.exit(1);
  }

  if (!isLabEligibleSaleItem(labItem)) {
    console.error('❌ Lab kalemi isLabEligibleSaleItem=false');
    process.exit(1);
  }
  console.log(`ℹ️  Lab kalemi: ${labItem.id} (${labItem.product?.category})`);

  const originalLab = {
    status: labItem.status,
    atolyeBranchId: labItem.atolyeBranchId,
    sentToLabAt: labItem.sentToLabAt,
    sentToLabByUserId: labItem.sentToLabByUserId,
  };

  // Test 3: atolyeBranchId olmadan IN_LAB
  try {
    await updateSaleItemStatus(labItem.id, ItemStatus.IN_LAB, Role.STORE_MANAGER, false, {
      userId: admin.id,
    });
    console.error('❌ atolyeBranchId olmadan IN_LAB: hata bekleniyordu');
    ok = false;
  } catch (err) {
    if (code(err) === 'ATOLYE_BRANCH_REQUIRED') {
      console.log('✅ atolyeBranchId olmadan IN_LAB → ATOLYE_BRANCH_REQUIRED');
    } else {
      console.error('❌ Beklenmeyen hata (no branch):', err);
      ok = false;
    }
  }

  // Test 4: hasAtolye=false şube
  try {
    await updateSaleItemStatus(labItem.id, ItemStatus.IN_LAB, Role.STORE_MANAGER, false, {
      atolyeBranchId: gvn2.id,
      userId: admin.id,
    });
    console.error('❌ hasAtolye=false şube ile IN_LAB: hata bekleniyordu');
    ok = false;
  } catch (err) {
    if (code(err) === 'ATOLYE_BRANCH_INVALID') {
      console.log('✅ hasAtolye=false şube → ATOLYE_BRANCH_INVALID');
    } else {
      console.error('❌ Beklenmeyen hata (invalid branch):', err);
      ok = false;
    }
  }

  // Test 1: başarılı IN_LAB + alanlar
  try {
    const updated = await updateSaleItemStatus(labItem.id, ItemStatus.IN_LAB, Role.STORE_MANAGER, false, {
      atolyeBranchId: gvn1.id,
      userId: admin.id,
    });
    if (updated.status !== ItemStatus.IN_LAB) throw new Error('status not IN_LAB');
    if (updated.atolyeBranchId !== gvn1.id) throw new Error('atolyeBranchId wrong');
    if (!updated.sentToLabAt) throw new Error('sentToLabAt missing');
    if (updated.sentToLabByUserId !== admin.id) throw new Error('sentToLabByUserId wrong');
    console.log('✅ Lab kalemi IN_LAB + atolyeBranchId + sentToLabAt + sentToLabByUserId');
  } catch (err) {
    console.error('❌ Başarılı IN_LAB testi:', err);
    ok = false;
  }

  const branches = await getAtolyeBranches();
  if (branches.length >= 1 && branches.some((b) => b.code === 'GVN1')) {
    console.log(`✅ getAtolyeBranches: ${branches.length} şube (GVN1 dahil)`);
  } else {
    console.error('❌ getAtolyeBranches beklenen sonuç');
    ok = false;
  }

  // Test 2: aksesuar / lab dışı kalem
  if (accessoryItem) {
    if (isLabEligibleSaleItem(accessoryItem)) {
      console.log('⚠️  Aksesuar adayı aslında lab-eligible, NOT_LAB test atlandı');
    } else {
      try {
        await updateSaleItemStatus(accessoryItem.id, ItemStatus.IN_LAB, Role.STORE_MANAGER, false, {
          atolyeBranchId: gvn1.id,
          userId: admin.id,
        });
        console.error('❌ Lab dışı kalem IN_LAB: hata bekleniyordu');
        ok = false;
      } catch (err) {
        if (code(err) === 'NOT_LAB_ELIGIBLE_ITEM') {
          console.log(`✅ Lab dışı kalem (${accessoryItem.product?.category}) → NOT_LAB_ELIGIBLE_ITEM`);
        } else {
          console.error('❌ Beklenmeyen hata (not eligible):', err);
          ok = false;
        }
      }
    }
  } else {
    console.log('⚠️  Lab dışı kalem bulunamadı, senaryo 2 atlandı');
  }

  await prisma.saleItem.update({
    where: { id: labItem.id },
    data: {
      status: originalLab.status,
      atolyeBranchId: originalLab.atolyeBranchId,
      sentToLabAt: originalLab.sentToLabAt,
      sentToLabByUserId: originalLab.sentToLabByUserId,
    },
  });

  console.log(ok ? '\n🎉 FAZ 2 testleri geçti' : '\n⚠️  Bazı testler başarısız');
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
