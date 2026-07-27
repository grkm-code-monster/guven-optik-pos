import { prisma } from '../src/database/prisma';

async function main() {
  const rows = await prisma.utsDisFirma.findMany({ include: { lokasyonlar: true } });
  console.log(`UtsDisFirma count: ${rows.length}`);
  for (const r of rows) {
    console.log(`- ${r.ad} vkn=${r.vkn} kurumNo=${r.kurumNo}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
