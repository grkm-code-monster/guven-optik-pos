/**
 * FAZ 5 test: Günlük Kasa raporunda LabIncident özeti
 * Çalıştır: npx tsx scripts/test-lab-incident-daily-report-faz5.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getDailyReport } from '../src/modules/reports/report.service';

const prisma = new PrismaClient();

function todayRange() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function yesterdayRange() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  let ok = true;

  const gvn1 = await prisma.branch.findFirst({ where: { code: 'GVN1' } });
  const gvn2 = await prisma.branch.findFirst({ where: { code: 'GVN2' } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
  const saleItem = await prisma.saleItem.findFirst({
    include: { sale: { include: { customer: true } } },
  });

  if (!gvn1 || !gvn2 || !admin || !saleItem) {
    console.error('❌ GVN1, GVN2, admin veya saleItem eksik');
    process.exit(1);
  }

  const testIds: string[] = [];
  const today = todayRange();

  const before = await getDailyReport(gvn1.id, today);

  const seeds = [
    { incidentType: 'LENS_BROKEN', resolutionType: 'OZEL_SIPARIS', ozelSiparisId: 'test-ozel-1' },
    { incidentType: 'FRAME_BROKEN', resolutionType: 'NONE', ozelSiparisId: null },
    { incidentType: 'MEASUREMENT_SHIFT', resolutionType: 'NONE', ozelSiparisId: null },
  ] as const;

  for (const s of seeds) {
    const row = await prisma.labIncident.create({
      data: {
        saleItemId: saleItem.id,
        atolyeBranchId: gvn1.id,
        reportedByUserId: admin.id,
        incidentType: s.incidentType,
        resolutionType: s.resolutionType,
        ozelSiparisId: s.ozelSiparisId,
        note: 'FAZ5 test',
      },
    });
    testIds.push(row.id);
  }

  try {
    const report = await getDailyReport(gvn1.id, today);
    const lab = report.labIncidents;
    const b = before.labIncidents ?? { toplam: 0, lensBroken: 0, frameBroken: 0, measurementShift: 0 };

    if (
      lab?.toplam === b.toplam + 3
      && lab.lensBroken === b.lensBroken + 1
      && lab.frameBroken === b.frameBroken + 1
      && lab.measurementShift === b.measurementShift + 1
      && lab.kayitlar.length === b.toplam + 3
    ) {
      console.log(`✅ Test 1: +3 olay eklendi → toplam=${lab.toplam} (cam/çerçeve/ölçüm +1)`);
    } else {
      console.error('❌ Test 1: beklenen özet', { before: b, after: lab });
      ok = false;
    }

    const yesterdayReport = await getDailyReport(gvn1.id, yesterdayRange());
    if ((yesterdayReport.labIncidents?.toplam ?? 0) === 0) {
      console.log('✅ Test 2a: Dün için GVN1 → olay yok');
    } else {
      console.error('❌ Test 2a: dün raporunda olay görünmemeliydi');
      ok = false;
    }

    const otherBranchReport = await getDailyReport(gvn2.id, today);
    const otherTotal = otherBranchReport.labIncidents?.toplam ?? 0;
    const otherTodayIncidents = await prisma.labIncident.count({
      where: {
        atolyeBranchId: gvn2.id,
        createdAt: { gte: today, lte: new Date(today.getTime() + 86400000 - 1) },
      },
    });
    if (otherTotal === otherTodayIncidents) {
      console.log(`✅ Test 2b: GVN2 bugün → toplam=${otherTotal} (regresyon yok)`);
    } else {
      console.error('❌ Test 2b: GVN2 raporu GVN1 olaylarını içeriyor olabilir');
      ok = false;
    }

    if (report.totalSales !== undefined && report.saleCount !== undefined) {
      console.log('✅ Mevcut Günlük Kasa alanları korundu (totalSales, saleCount)');
    }
  } finally {
    await prisma.labIncident.deleteMany({ where: { id: { in: testIds } } });
  }

  console.log(ok ? '\n✅ FAZ 5 testleri geçti' : '\n❌ FAZ 5 testlerinde hata var');
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
