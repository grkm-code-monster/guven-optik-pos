/**
 * Şirket ayar kaydı + singleton prisma stres testi
 *   npx tsx scripts/test-sirket-ayar.ts
 */
import { prisma } from '../src/database/prisma';

const NG_AYARLAR: Record<string, string> = {
  sirket_vergi_dairesi: 'Milas',
  sirket_il: 'MUĞLA',
  sirket_ilce: 'MİLAS',
  sirket_telefon: '05436694331',
  sirket_eposta: 'muhasebe.guvenoptik@gmail.com',
  sirket_adres: 'İsmet Paşa Mah. Atatürk Bulvarı No:44/1-2 Milas/Muğla',
};

async function upsertSirketAyar(sirketId: string, ayarlar: Record<string, string>) {
  for (const [anahtar, deger] of Object.entries(ayarlar)) {
    if (!deger || deger === '••••••••') continue;
    await prisma.sirketAyar.upsert({
      where: { sirketId_anahtar: { sirketId, anahtar } },
      create: { sirketId, anahtar, deger: String(deger) },
      update: { deger: String(deger) },
    });
  }
}

async function main() {
  console.log('=== POST sirket-ayar/ng (upsert mantığı) ===');
  await upsertSirketAyar('ng', NG_AYARLAR);

  const okunan = await prisma.sirketAyar.findMany({
    where: {
      sirketId: 'ng',
      anahtar: { in: Object.keys(NG_AYARLAR) },
    },
  });
  const map = Object.fromEntries(okunan.map((a) => [a.anahtar, a.deger]));
  console.log('GET geri okuma:');
  for (const [k, v] of Object.entries(NG_AYARLAR)) {
    console.log(`  ${k}: ${map[k] === v ? 'OK' : `HATA (got ${map[k]})`}`);
  }

  console.log('\n=== 20 paralel sorgu (singleton) ===');
  const tasks = Array.from({ length: 20 }, (_, i) =>
    prisma.sirketAyar.findMany({
      where: { sirketId: i % 2 === 0 ? 'ng' : 'adese' },
      take: 5,
    }),
  );
  const t0 = Date.now();
  await Promise.all(tasks);
  console.log(`20 paralel findMany: ${Date.now() - t0}ms — hata yok`);

  const finans = await Promise.all(
    Array.from({ length: 5 }, () => prisma.finansalVarlik.findMany({ take: 3 })),
  );
  console.log(`5x finansalVarlik: ${finans.length} batch OK`);
}

main()
  .catch((e) => {
    console.error('HATA:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
