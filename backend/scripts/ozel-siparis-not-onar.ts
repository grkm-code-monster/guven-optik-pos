/**
 * 19.11.2026 — Otomatik durum notu ("Otomatik: Teslim alındıktan 15 dk sonra", "Ürün girişi GRS-…")
 * yüzünden asıl notu silinmiş özel siparişlerin notunu yeniden yazar: satıştaki o cama bağlı
 * özel işlemlerden ("ÖZEL İŞLEM: Renklendirme (…) — Firmaya not: …"). Özel işlem yoksa
 * otomatik not temizlenir (o not zaten sipariş geçmişinde duruyor).
 *
 *   npx ts-node --transpile-only scripts/ozel-siparis-not-onar.ts [--confirm]
 */
import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../src/database/prisma';

const confirm = process.argv.includes('--confirm');
const OZEL_ISLEM_KATEGORI = 82;

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const ss = await prisma.ozelSiparis.findMany({
    where: { OR: [{ notlar: { startsWith: 'Otomatik: Teslim alındıktan' } }, { notlar: { startsWith: 'Ürün girişi GRS-' } }] },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Notu ezilmiş sipariş: ${ss.length}\n`);
  const kayit: unknown[] = [];
  for (const s of ss) {
    let yeni: string | null = null;
    if (s.saleItemId) {
      const islemler = await prisma.saleItem.findMany({
        where: { linkedItemId: s.saleItemId, linkType: null, status: { not: 'VOID' }, odooCategoryId: OZEL_ISLEM_KATEGORI },
        select: { odooProductName: true, maintenanceNature: true, maintenanceDescription: true, product: { select: { name: true } } },
      });
      if (islemler.length) {
        yeni = islemler.map((it) => {
          const ad = it.odooProductName || it.product?.name || 'Özel İşlem';
          const nit = it.maintenanceNature?.trim();
          const not = it.maintenanceDescription?.trim();
          return `ÖZEL İŞLEM: ${ad}${nit ? ` (${nit})` : ''}${not ? ` — Firmaya not: ${not}` : ''}`;
        }).join(' | ');
      }
    }
    console.log(`${s.musteriAdi} | ${s.subeId} | ${s.urunAdi}`);
    console.log(`   şimdiki not: ${s.notlar}`);
    console.log(`   yeni not   : ${yeni ?? '(boş — özel işlem yok)'}`);
    if (confirm) {
      await prisma.$transaction([
        prisma.ozelSiparis.update({ where: { id: s.id }, data: { notlar: yeni } }),
        prisma.ozelSiparisLog.create({ data: { siparisId: s.id, eskiDurum: s.durum, yeniDurum: s.durum, notlar: `Not onarıldı (otomatik notla ezilmişti). Eski: ${s.notlar}` } }),
      ]);
      kayit.push({ id: s.id, eski: s.notlar, yeni });
    }
  }
  if (confirm) {
    const dosya = `/root/ozel-siparis-not-onar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
    console.log(`\nTAMAM — ${kayit.length} sipariş notu yazıldı. Kayıt: ${dosya}`);
  } else console.log('\n--- KURU --- Hiçbir şey değişmedi.');
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
