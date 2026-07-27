import { prisma } from '../src/database/prisma';

async function main() {
  const ayarlar = await prisma.sirketAyar.findMany({
    where: { anahtar: 'sirket_vkn' },
    select: { sirketId: true, deger: true },
  });
  console.log('SirketAyar sirket_vkn:', ayarlar);

  const subeler = await prisma.utsSube.findMany({
    include: { branch: { select: { code: true, name: true } } },
  });
  console.log('UtsSube:', subeler.map((s) => ({
    code: s.branch.code,
    kurumNo: s.kurumNo,
    aktif: s.aktif,
  })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
