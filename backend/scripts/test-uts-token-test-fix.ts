/**
 * Madde 4 — düzeltilmiş testUtsSubeToken doğrulaması
 * npx tsx backend/scripts/test-uts-token-test-fix.ts
 */
import { prisma } from '../src/database/prisma';
import { resolveBranchVknForUtsTest, testUtsSubeToken } from '../src/modules/uts/uts.service';

async function main() {
  console.log('=== Madde 4: Token Test Et düzeltmesi doğrulama ===\n');

  const kayitlar = await prisma.utsSube.findMany({
    include: { branch: { select: { code: true, vkn: true } } },
    orderBy: { branch: { code: 'asc' } },
  });

  for (const u of kayitlar) {
    let vkn = '—';
    try {
      vkn = await resolveBranchVknForUtsTest(u.branch);
    } catch {
      vkn = 'BULUNAMADI';
    }

    const oncekiAktif = u.aktif;
    const sonuc = await testUtsSubeToken(u.branchId);
    const guncel = await prisma.utsSube.findUnique({ where: { branchId: u.branchId } });

    console.log(`${u.branch.code.padEnd(8)} VKN=${vkn}`);
    console.log(`  önce aktif=${oncekiAktif} → sonuç: ${sonuc.success ? '✅' : '❌'} ${sonuc.mesaj}`);
    console.log(`  sonra aktif=${guncel?.aktif} ortam=${guncel?.ortam}`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
