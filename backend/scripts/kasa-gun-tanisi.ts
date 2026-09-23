/**
 * Teşhis: bir şube için belirli bir tarih aralığındaki vardiyaları ve satışları
 * ham haliyle listeler. "Günlük Kasa Raporu" boş/sıfır görünüyor sorununu
 * kesin teşhis etmek için (23.09.2026).
 *
 * Kullanım:
 *   npm run kasa-gun-tanisi -- --sube=GVN2 --tarih=2026-09-22
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const pre = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pre));
  return found ? found.slice(pre.length) : undefined;
}

async function main() {
  const subeKodu = arg('sube');
  const tarihStr = arg('tarih');
  if (!subeKodu || !tarihStr) {
    console.error('Kullanım: npm run kasa-gun-tanisi -- --sube=GVN2 --tarih=2026-09-22');
    process.exit(1);
  }

  const branch = await prisma.branch.findFirst({ where: { code: subeKodu } });
  if (!branch) {
    console.error(`Şube bulunamadı: ${subeKodu}`);
    process.exit(1);
  }
  console.log(`Şube: ${branch.name} (${branch.id})`);

  const gun = new Date(tarihStr + 'T00:00:00');
  const start = new Date(gun);
  start.setHours(0, 0, 0, 0);
  const end = new Date(gun);
  end.setHours(23, 59, 59, 999);
  console.log(`İstenen gün aralığı: ${start.toISOString()} .. ${end.toISOString()}`);

  // Geniş pencere: istenen günden 3 gün önce - 2 gün sonrasına kadar tüm vardiyalar
  const genisStart = new Date(start);
  genisStart.setDate(genisStart.getDate() - 3);
  const genisEnd = new Date(end);
  genisEnd.setDate(genisEnd.getDate() + 2);

  const shiftler = await prisma.shift.findMany({
    where: { branchId: branch.id, openedAt: { gte: genisStart, lte: genisEnd } },
    orderBy: { openedAt: 'asc' },
  });

  console.log(`\n--- Vardiyalar (${genisStart.toISOString().slice(0,10)} .. ${genisEnd.toISOString().slice(0,10)}) ---`);
  for (const s of shiftler) {
    console.log(
      `  id=${s.id} status=${s.status} openedAt=${s.openedAt.toISOString()} closedAt=${s.closedAt?.toISOString() ?? '-'}`,
    );
  }
  if (shiftler.length === 0) console.log('  (hiç vardiya bulunamadı bu pencerede)');

  // İstenen günün [start,end) aralığında AÇILMIŞ olan vardiya var mı?
  const gunIcindeAcilan = shiftler.filter((s) => s.openedAt >= start && s.openedAt <= end);
  console.log(`\nİstenen gün içinde AÇILAN vardiya sayısı: ${gunIcindeAcilan.length}`);

  // İstenen günü KAPSAYAN (openedAt <= end AND (closedAt is null OR closedAt >= start)) vardiyalar
  const gunuKapsayan = shiftler.filter(
    (s) => s.openedAt <= end && (!s.closedAt || s.closedAt >= start),
  );
  console.log(`İstenen günü KAPSAYAN (açık kaldığı süre gün ile kesişen) vardiya sayısı: ${gunuKapsayan.length}`);
  for (const s of gunuKapsayan) {
    console.log(`  -> id=${s.id} openedAt=${s.openedAt.toISOString()} closedAt=${s.closedAt?.toISOString() ?? '-'}`);
  }

  // İstenen gün için PAID satışlar (shiftId'den bağımsız, doğrudan createdAt'e göre)
  const satislar = await prisma.sale.findMany({
    where: { branchId: branch.id, createdAt: { gte: start, lte: end }, status: 'PAID' as any },
    select: { id: true, createdAt: true, shiftId: true, netTotal: true, userId: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\n--- İstenen gün içinde createdAt'e göre PAID satışlar: ${satislar.length} ---`);
  const shiftIdSet = new Set<string>();
  for (const s of satislar) {
    shiftIdSet.add(s.shiftId);
    console.log(`  satis=${s.id} createdAt=${s.createdAt.toISOString()} shiftId=${s.shiftId} net=${s.netTotal}`);
  }
  console.log(`\nBu satışların bağlı olduğu FARKLI shiftId sayısı: ${shiftIdSet.size}`);
  console.log([...shiftIdSet].join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
