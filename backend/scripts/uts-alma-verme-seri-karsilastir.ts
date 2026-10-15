/**
 * TEŞHİS (salt-okunur) — Task #14/#15 bağlantısı: UTS "Tekil Ürün bulunamadı"
 * (H002) hatası veren VERME denemelerinde kullanılan barkod için, SİSTEMDE
 * daha önce kayıtlı bir ALMA bildirimi var mı, varsa o ALMA'daki seri/lot
 * değerleri VERME'de kullanılanla AYNI MI diye karşılaştırır.
 *
 * Hipotez: ALMA (mal kabul) ve VERME (mal çıkış) sırasında aynı fiziksel
 * ürünün karekodu FARKLI zamanlarda okutuluyor; eğer GS1 ayrıştırma (bkz.
 * parseGs1DataMatrix.ts, Task #15) iki okutmada farklı seri/lot çıkarırsa,
 * UTS'nin gözünde "elimizdeki tekil ürün" ile "göndermeye çalıştığımız tekil
 * ürün" eşleşmez ve H002 döner.
 *
 * Kullanım:
 *   npm run uts-alma-verme-seri-karsilastir
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

async function main() {
  const h002Bildirimler = await prisma.utsBildirim.findMany({
    where: { tip: 'VERME', durum: 'HATA', hataDetay: { contains: 'UTS-H002' } },
    include: { kalemler: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`Toplam H002 (Tekil Ürün bulunamadı) hatalı VERME bildirimi: ${h002Bildirimler.length}\n`);

  for (const b of h002Bildirimler) {
    for (const k of b.kalemler) {
      console.log(`VERME denemesi #${b.id} (${b.createdAt.toISOString()}) — barkod: ${k.barkod} — seri: ${k.seriNo ?? '-'} — lot: ${k.lotNo ?? '-'}`);

      const almalar = await prisma.utsBildirim.findMany({
        where: { tip: 'ALMA', kalemler: { some: { barkod: k.barkod } } },
        include: { kalemler: { where: { barkod: k.barkod } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (almalar.length === 0) {
        console.log(`  ⚠️  Bu barkod için SİSTEMDE HİÇ ALMA bildirimi yok — ürün hiç "giriş" yapılmamış olabilir.`);
        continue;
      }

      for (const a of almalar) {
        for (const ak of a.kalemler) {
          const seriEslesiyor = (ak.seriNo ?? '') === (k.seriNo ?? '');
          const lotEslesiyor = (ak.lotNo ?? '') === (k.lotNo ?? '');
          const uyari = !seriEslesiyor || !lotEslesiyor ? '  ❌ UYUŞMUYOR' : '  ✓ aynı';
          console.log(`  ALMA #${a.id} (${a.createdAt.toISOString()}, durum: ${a.durum}) — seri: ${ak.seriNo ?? '-'} — lot: ${ak.lotNo ?? '-'}${uyari}`);
        }
      }
      console.log('');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
