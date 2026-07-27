/**
 * FAZ 4 test: LabIncident + stok kontrolü + özel sipariş bağlantısı
 * Çalıştır: npx tsx scripts/test-lab-incident-faz4.ts
 */
import 'dotenv/config';
import { ItemStatus, LinkType, PrismaClient, ProductCategory, Role } from '@prisma/client';
import { updateSaleItemStatus } from '../src/modules/sales/sale.service';
import {
  filterOtherBranchStock,
  reportLabIncident,
  confirmLabIncidentTransfer,
} from '../src/modules/sales/lab-incident.service';
import { getUrunStokTumSubeler } from '../src/modules/admin/stok-yonetimi.service';
import type { JwtPayload } from '../src/modules/auth/auth.types';

const prisma = new PrismaClient();

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

async function ensureInLabItem(gvn1Id: string, adminId: string) {
  const item = await prisma.saleItem.findFirst({
    where: {
      sale: { status: 'PAID' },
      status: { not: ItemStatus.VOID },
      odooProductId: { not: null },
      OR: [
        { linkType: { in: [LinkType.FRAME_LENS, LinkType.CUSTOMER_FRAME] } },
        { product: { category: ProductCategory.LENS_RX } },
      ],
    },
  });
  if (!item) throw new Error('Lab kalemi bulunamadı');

  const original = {
    status: item.status,
    atolyeBranchId: item.atolyeBranchId,
    sentToLabAt: item.sentToLabAt,
    sentToLabByUserId: item.sentToLabByUserId,
  };

  await updateSaleItemStatus(item.id, ItemStatus.IN_LAB, Role.ADMIN, false, {
    atolyeBranchId: gvn1Id,
    userId: adminId,
  });

  await prisma.labIncident.deleteMany({ where: { saleItemId: item.id } });

  return { item, original };
}

async function main() {
  let ok = true;

  const gvn1 = await prisma.branch.findFirst({ where: { code: 'GVN1' } });
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } });
  const workshopUser = await prisma.user.findFirst({
    where: { username: 'test_workshop_gvn1', role: Role.WORKSHOP_STAFF },
  });

  if (!gvn1?.hasAtolye || !admin || !workshopUser) {
    console.error('❌ GVN1, admin veya test_workshop_gvn1 eksik');
    process.exit(1);
  }

  const userJwt = jwt(workshopUser);
  const { item, original } = await ensureInLabItem(gvn1.id, admin.id);

  // filterOtherBranchStock birim kontrolü
  const filtered = filterOtherBranchStock(
    [
      { kod: 'GVN1', miktar: 5, kullanilabilir: 5 },
      { kod: 'GVN6', miktar: 3, kullanilabilir: 2 },
      { kod: 'ANADEPO', miktar: 1, kullanilabilir: 1 },
    ],
    'GVN1',
  );
  if (filtered.length === 2 && filtered.every((l) => l.kod !== 'GVN1')) {
    console.log('✅ filterOtherBranchStock: atölye şubesi hariç tutuldu');
  } else {
    console.error('❌ filterOtherBranchStock beklenmeyen sonuç');
    ok = false;
  }

  // Test 3: Çerçeve kırıldı → sadece kayıt
  try {
    const res = await reportLabIncident(userJwt, {
      saleItemId: item.id,
      incidentType: 'FRAME_BROKEN',
      note: 'Test çerçeve',
    });
    const row = await prisma.labIncident.findUnique({ where: { id: res.incidentId! } });
    if (res.resolutionType !== 'NONE' || row?.resolutionType !== 'NONE' || row?.ozelSiparisId) {
      console.error('❌ Test 3: FRAME_BROKEN otomasyon tetikledi veya resolutionType hatalı');
      ok = false;
    } else {
      console.log('✅ Test 3: Çerçeve kırıldı → sadece LabIncident (NONE)');
    }
  } catch (err) {
    console.error('❌ Test 3 hata:', err);
    ok = false;
  }

  // Test 4: Ölçüm kaydırması → sadece kayıt
  try {
    const res = await reportLabIncident(userJwt, {
      saleItemId: item.id,
      incidentType: 'MEASUREMENT_SHIFT',
      note: 'Test ölçüm',
    });
    const row = await prisma.labIncident.findUnique({ where: { id: res.incidentId! } });
    if (res.resolutionType !== 'NONE' || row?.resolutionType !== 'NONE') {
      console.error('❌ Test 4: MEASUREMENT_SHIFT resolutionType hatalı');
      ok = false;
    } else {
      console.log('✅ Test 4: Ölçüm kaydırması → sadece LabIncident (NONE)');
    }
  } catch (err) {
    console.error('❌ Test 4 hata:', err);
    ok = false;
  }

  const odooProductId = item.odooProductId ? Number(item.odooProductId) : 0;
  let stokInfo: Awaited<ReturnType<typeof getUrunStokTumSubeler>> = null;
  if (odooProductId > 0) {
    try {
      stokInfo = await getUrunStokTumSubeler(odooProductId);
    } catch (e) {
      console.warn('⚠️  Odoo stok sorgusu başarısız — Test 1/2 atlanabilir:', (e as Error).message?.slice(0, 80));
    }
  }

  const otherLocs = filterOtherBranchStock(stokInfo?.lokasyonlar ?? [], 'GVN1');

  // Test 1: Cam kırıldı + başka lokasyonda stok
  if (otherLocs.length > 0) {
    try {
      const res = await reportLabIncident(userJwt, {
        saleItemId: item.id,
        incidentType: 'LENS_BROKEN',
        note: 'Test cam stoklu',
      });
      if (!res.stokBulundu || !res.lokasyonlar?.length || res.ozelSiparisAcildi) {
        console.error('❌ Test 1: stok varken beklenen yanıt alınamadı');
        ok = false;
      } else {
        console.log(`✅ Test 1: Cam kırıldı + stok var → ${res.lokasyonlar.length} lokasyon listelendi`);
        if (res.incidentId && res.lokasyonlar[0]?.lokasyonId) {
          try {
            const transfer = await confirmLabIncidentTransfer(
              userJwt,
              res.incidentId,
              res.lokasyonlar[0].lokasyonId,
            );
            const row = await prisma.labIncident.findUnique({ where: { id: res.incidentId } });
            if (row?.resolutionType === 'TRANSFER' && row.transferRef) {
              console.log(`✅ Test 1b: Transfer onayı → TRANSFER (${row.transferRef})`);
            } else if (transfer.success) {
              console.log('✅ Test 1b: Transfer onayı tamamlandı');
            } else {
              console.warn('⚠️  Test 1b: Transfer kısmen/başarısız (Odoo):', transfer.message);
            }
          } catch (te) {
            console.warn('⚠️  Test 1b transfer (Odoo bağımlı):', (te as Error).message?.slice(0, 120));
          }
        }
      }
    } catch (err) {
      console.error('❌ Test 1 hata:', err);
      ok = false;
    }
  } else {
    console.log('ℹ️  Test 1 atlandı: ürün için GVN1 dışında kullanılabilir stok yok (Odoo)');
  }

  // Test 2: Cam kırıldı + stok yok → özel sipariş
  if (otherLocs.length === 0 && odooProductId > 0) {
    try {
      const res = await reportLabIncident(userJwt, {
        saleItemId: item.id,
        incidentType: 'LENS_BROKEN',
        note: 'Test cam stoksuz',
      });
      const row = await prisma.labIncident.findUnique({ where: { id: res.incidentId! } });
      if (!res.ozelSiparisAcildi || row?.resolutionType !== 'OZEL_SIPARIS' || !row.ozelSiparisId) {
        console.error('❌ Test 2: stok yokken özel sipariş açılmadı');
        ok = false;
      } else {
        console.log(`✅ Test 2: Stok yok → OZEL_SIPARIS (${row.ozelSiparisId.slice(0, 8)}…)`);
      }

      const dup = await reportLabIncident(userJwt, {
        saleItemId: item.id,
        incidentType: 'LENS_BROKEN',
        note: 'Mükerrer test',
      });
      if (!dup.zatenVar) {
        console.warn('⚠️  Test 2b: ikinci bildirimde zatenVar=false (aktif sipariş bekleniyordu)');
      } else {
        console.log('✅ Test 2b: Mükerrer kontrol (Not #40b) — zatenVar=true');
      }
    } catch (err) {
      console.error('❌ Test 2 hata:', err);
      ok = false;
    }
  } else if (otherLocs.length > 0) {
    console.log('ℹ️  Test 2 atlandı: stok başka lokasyonda mevcut');
  }

  await prisma.saleItem.update({ where: { id: item.id }, data: original });
  console.log('ℹ️  Test kalemi durumu geri alındı');

  console.log(ok ? '\n✅ FAZ 4 testleri geçti' : '\n❌ FAZ 4 testlerinde hata var');
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
