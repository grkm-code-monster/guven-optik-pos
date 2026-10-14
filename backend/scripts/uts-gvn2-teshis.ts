/**
 * GVN2'nin UTS "verme bildirimi"nin neden UTS.gov.tr portalında görünmediğini
 * teşhis eder. SALT OKUNUR.
 *
 * Kontrol edilenler:
 *  1) GVN2 şubesinin UtsSube ayarı (ortam: test mi canlı mı, token var mı,
 *     aktif mi, en son kontrol zamanı).
 *  2) En son oluşturulan UtsBildirim kayıtları (özellikle VERME tipinde,
 *     ADESE OPTİK ile ilgili olanlar) — durum, hataDetay, utsBildirimId
 *     (UTS'nin dönmüş olduğu SNC kodu — bu DOLUYSA UTS gerçekten "kabul
 *     ettim" demiştir; BOŞSA bizim kod koşulsuz "GONDERILDI" yazmış olabilir
 *     ama UTS aslında hiçbir SNC üretmemiş olabilir).
 *
 * Kullanım:
 *   npm run uts-gvn2-teshis
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

async function main() {
  const branch = await prisma.branch.findFirst({ where: { code: { equals: 'GVN2', mode: 'insensitive' } } });
  if (!branch) {
    console.log('GVN2 şubesi bulunamadı.');
    return;
  }
  console.log(`GVN2 branch id: ${branch.id} — ad: ${branch.name}\n`);

  const utsSube = await prisma.utsSube.findUnique({ where: { branchId: branch.id } });
  if (!utsSube) {
    console.log('⚠️  Bu şube için UtsSube kaydı YOK — hiç UTS ayarı yapılmamış.');
  } else {
    console.log('UtsSube ayarı:');
    console.log(`  ortam: ${utsSube.ortam}  ${utsSube.ortam !== 'canli' ? '⚠️  CANLI DEĞİL — bu olabilir kök neden!' : '(canlı, doğru)'}`);
    console.log(`  aktif: ${utsSube.aktif}`);
    console.log(`  token var mı: ${utsSube.token ? 'evet (' + utsSube.token.length + ' karakter)' : 'HAYIR'}`);
    console.log(`  kurumNo: ${utsSube.kurumNo ?? '-'}`);
    console.log(`  sonKontrol: ${utsSube.sonKontrol ?? '-'}`);
  }

  console.log(`\nSon 15 UtsBildirim kaydı (bu şube):`);
  const bildirimler = await prisma.utsBildirim.findMany({
    where: { branchId: branch.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { kalemler: true },
  });

  for (const b of bildirimler) {
    console.log(`\n  #${b.id} — tip: ${b.tip} — durum: ${b.durum} — karsiAd: ${b.karsiAd ?? '-'} — karsiKurumNo: ${b.karsiKurumNo ?? '-'}`);
    console.log(`    oluşturma: ${b.createdAt.toISOString()} — gönderim: ${b.gonderimZamani?.toISOString() ?? '-'}`);
    console.log(`    utsBildirimId (UTS'nin SNC'si): ${b.utsBildirimId || '(BOŞ — UTS hiç SNC üretmemiş olabilir!)'}`);
    if (b.hataDetay) console.log(`    hataDetay: ${b.hataDetay}`);
    console.log(`    kalem sayısı: ${b.kalemler.length} — örnek barkod: ${b.kalemler[0]?.barkod ?? '-'}`);
  }

  if (!bildirimler.length) {
    console.log('  (Hiç UtsBildirim kaydı bulunamadı — bu da ilginç, demek ki transfer motoru hiç bildirim OLUŞTURMAMIŞ.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
