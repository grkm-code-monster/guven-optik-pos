/**
 * Transfer post-action log teşhisi
 * npx ts-node scripts/diag-transfer-aksiyon-log.ts [TRANSFER-xxx]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

async function main() {
  const argRef = process.argv[2]?.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await prisma.transferAksiyonLog.findMany({
    where: argRef
      ? { transferRef: argRef }
      : { createdAt: { gte: today } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(argRef ? `Loglar: ${argRef}` : `Bugünün logları (${today.toISOString().slice(0, 10)})`);
  console.log(`Kayıt sayısı: ${logs.length}\n`);

  if (!logs.length) {
    console.log('Kayıt yok — post-action hiç çalışmamış veya farklı transferRef kullanılmış olabilir.');
    await prisma.$disconnect();
    return;
  }

  for (const l of logs) {
    console.log(`[${l.createdAt.toISOString()}] ${l.transferRef}`);
    console.log(`  aksiyon=${l.aksiyon} durum=${l.durum}`);
    if (l.mesaj) console.log(`  mesaj: ${l.mesaj}`);
    if (l.kayitId) console.log(`  kayitId: ${l.kayitId}`);
    console.log('');
  }

  const refs = [...new Set(logs.map((l) => l.transferRef))];
  for (const ref of refs) {
    const bildirimler = await prisma.bildirim.findMany({
      where: { mesaj: { contains: ref } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    console.log(`Bildirim (${ref}): ${bildirimler.length}`);
    for (const b of bildirimler) {
      console.log(`  - ${b.createdAt.toISOString()} ${b.baslik}`);
    }
  }

  console.log(`\nE_IRSALIYE_TRANSFER_ENABLED=${process.env.E_IRSALIYE_TRANSFER_ENABLED ?? '(tanımsız)'}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
