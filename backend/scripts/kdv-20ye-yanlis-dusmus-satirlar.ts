/**
 * 22.10.2026 KDV hatası teşhisi — SALT OKUNUR, hiçbir kayıt DEĞİŞTİRMEZ.
 *
 * Kök neden (düzeltildi — bkz. sale.service.ts recalcSaleTotals): kalem
 * eklenirken doğru atanan KDV oranı (örn. CAM/LENS kategorisi %10), her
 * recalcSaleTotals çağrısında (miktar/iskonto değişince, HATTA satış
 * onaylanırken/confirmSale'de bile) resolveSaleItemTaxRate'in
 * inputTaxRate'siz yeniden çalışmasıyla sessizce %20'ye düşüyordu —
 * çünkü yerel stok camların odooProductId'si yok ve Product.taxRate
 * veritabanında hâlâ şema varsayılanı %20.
 *
 * Bu script, verilen tarih için (varsayılan: bugün), KDV oranı %20 olarak
 * kayıtlı ama ÜRÜN KATEGORİSİ "bu hata yüzünden %20'ye düşmüş olabilir"
 * diye işaretlenen (LENS_RX / CAM) satış kalemlerini listeler. Her satır
 * için mevcut KDV tutarı ile "%10 olsaydı ne olurdu" karşılaştırması
 * gösterilir — böylece admin panelindeki "KDV Düzeltme" ekranından
 * (Satış Detay sayfası, sadece ADMIN) hangi kalemleri düzeltmesi
 * gerektiğini hızlıca görebilirsin.
 *
 * ÖNEMLİ: Bu script HİÇBİR ŞEYİ OTOMATİK DÜZELTMEZ. Sadece listeler.
 * Düzeltme, bilerek admin panelindeki "KDV Düzeltme" ekranından elle
 * yapılır (her düzeltme AuditLog'a yazılır, Odoo faturasına dokunulmaz).
 *
 * Kullanım:
 *   npm run kdv-20ye-yanlis-dusmus-satirlar -- 2026-10-22
 *   (tarih verilmezse bugünün tarihi kullanılır)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { ProductCategory, SaleStatus } from '@prisma/client';

const SUPHELI_KATEGORILER: ProductCategory[] = [
  ProductCategory.LENS_RX,
  ProductCategory.OPTICAL_FRAME_RX,
  ProductCategory.OPTICAL_FRAME_READY,
];

function paraFmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const tarihArg = process.argv[2];
  const gun = tarihArg ? new Date(tarihArg + 'T00:00:00') : new Date();
  gun.setHours(0, 0, 0, 0);
  const gunSonu = new Date(gun);
  gunSonu.setDate(gunSonu.getDate() + 1);

  console.log('='.repeat(78));
  console.log(`KDV %20'ye yanlış düşmüş olabilecek satırlar — ${gun.toLocaleDateString('tr-TR')}`);
  console.log('='.repeat(78));

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: [SaleStatus.PAID, SaleStatus.DRAFT] },
      createdAt: { gte: gun, lt: gunSonu },
    },
    include: {
      customer: { select: { name: true } },
      branch: { select: { code: true, name: true } },
      items: {
        include: { product: { select: { name: true, category: true, taxRate: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!sales.length) {
    console.log('\nBu tarihte hiç satış bulunamadı.');
    return;
  }

  let supheliSayisi = 0;
  let toplamEskiTax = 0;
  let toplamYeniTax = 0;

  for (const sale of sales) {
    const supheliKalemler = sale.items.filter((it) => {
      if (it.taxRate == null || Number(it.taxRate) !== 20) return false;
      const kategori = it.product?.category;
      return kategori != null && SUPHELI_KATEGORILER.includes(kategori);
    });
    if (!supheliKalemler.length) continue;

    console.log('');
    console.log(`Satış #${sale.id}  [${sale.branch?.code ?? '—'}]  ${sale.customer?.name ?? '—'}  (${sale.status})  ${sale.createdAt.toLocaleTimeString('tr-TR')}`);

    for (const it of supheliKalemler) {
      const unitPrice = Number(it.unitPrice);
      const qty = it.qty;
      const discount = Number(it.discount);
      const lineTotal = unitPrice * qty - discount;
      const eskiTax = Number(it.taxAmount);
      const yeniTax10 = (lineTotal * 10) / 110;

      supheliSayisi++;
      toplamEskiTax += eskiTax;
      toplamYeniTax += yeniTax10;

      console.log(
        `  - [${it.id}] ${it.product?.name ?? it.odooProductName ?? '—'} (kategori: ${it.product?.category})\n` +
          `      Satır toplamı (KDV dahil): ${paraFmt(lineTotal)} TL\n` +
          `      Şu an kayıtlı: KDV %${Number(it.taxRate)} -> KDV tutarı ${paraFmt(eskiTax)} TL, vergi hariç ${paraFmt(lineTotal - eskiTax)} TL\n` +
          `      %10 olsaydı:   KDV tutarı ${paraFmt(yeniTax10)} TL, vergi hariç ${paraFmt(lineTotal - yeniTax10)} TL  (fark: ${paraFmt(eskiTax - yeniTax10)} TL fazla alınmış görünüyor)`,
      );
    }
  }

  console.log('');
  console.log('='.repeat(78));
  if (supheliSayisi === 0) {
    console.log('Şüpheli satır bulunamadı (bu tarihte CAM/ÇERÇEVE kategorisinde %20 KDV\'li kalem yok).');
  } else {
    console.log(`Toplam ${supheliSayisi} şüpheli kalem bulundu.`);
    console.log(`Şu an kayıtlı toplam KDV: ${paraFmt(toplamEskiTax)} TL`);
    console.log(`%10 varsayımıyla olması gereken toplam KDV: ${paraFmt(toplamYeniTax)} TL`);
    console.log(`Fark: ${paraFmt(toplamEskiTax - toplamYeniTax)} TL (muhtemelen fazla hesaplanmış)`);
    console.log('');
    console.log('NOT: Bu liste bir TAHMİNDİR (kategoriye göre %10 varsayımı) — her satırı');
    console.log('gözle kontrol edip (gerçekten %10 KDV\'li bir ürün mü) admin panelindeki');
    console.log('Satış Detay > "KDV Düzeltme" ekranından elle düzeltmen gerekiyor.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
