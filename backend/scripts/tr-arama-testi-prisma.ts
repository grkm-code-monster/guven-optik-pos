/**
 * Prisma/Postgres (kendi DB'miz — Odoo'nunki değil) ILIKE/insensitive mode'un
 * Türkçe İ/ı/I/i karışıklığını doğru ele alıp almadığını test eder. SALT
 * OKUNUR — sadece var olan bir müşteriyi bulup çapraz arama dener.
 *
 * Kullanım:
 *   npm run tr-arama-testi-prisma
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // TR karakterli (İ/ı/Ö/Ü/Ş/Ç/Ğ) isimli birkaç müşteri bul.
  const ornekler = await prisma.customer.findMany({
    where: { name: { contains: 'İ' } },
    select: { id: true, name: true },
    take: 5,
  });
  console.log('İ harfi içeren örnek müşteriler:');
  for (const o of ornekler) console.log(`  ${o.id} — ${o.name}`);

  if (!ornekler.length) {
    console.log('Hiç İ harfli müşteri yok, test için uygun örnek bulunamadı.');
    return;
  }

  const hedef = ornekler[0];
  const kucukI = hedef.name.replace(/İ/g, 'i');
  console.log(`\nHedef: "${hedef.name}" — küçük "i" ile arama terimi: "${kucukI}"`);

  const sonuc = await prisma.customer.findMany({
    where: { id: hedef.id, name: { contains: kucukI, mode: 'insensitive' } },
    select: { id: true },
  });
  console.log(`Küçük "i" (mode:insensitive) ile aratınca hedef bulundu mu: ${sonuc.length > 0 ? 'EVET' : 'HAYIR'}`);

  const sonuc2 = await prisma.customer.findMany({
    where: { id: hedef.id, name: { contains: hedef.name.toUpperCase(), mode: 'insensitive' } },
    select: { id: true },
  });
  console.log(`Büyük harfle (JS toUpperCase, mode:insensitive) aratınca hedef bulundu mu: ${sonuc2.length > 0 ? 'EVET' : 'HAYIR'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
