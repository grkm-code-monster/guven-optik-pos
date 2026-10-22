/**
 * 22.10.2026 — "Gün Toplamı" hâlâ komisyon düşmüyor gibi görünüyor, SALT
 * OKUNUR teşhis. Önceki script (gun-toplami-komisyon-teshis.ts) DB'den
 * kendi isSameCalendarDay kopyasıyla hesaplayıp "aynı gün" diyordu — ama
 * asıl API'nin (getDailyReport) ürettiği salesDetail[].cardPayments[]
 * içindeki isOpenAccountCollection/commissionAmount alanlarının GERÇEKTEN
 * ne döndüğünü görmedik. Bu script, frontend'in çağırdığı SERVİS
 * FONKSİYONUNU (getDailyReport) doğrudan çağırıp salesDetail çıktısını
 * ham haliyle (JSON) basar.
 *
 * Kullanım:
 *   npm run gun-toplami-api-teshis -- GVN2 2026-10-22
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { getDailyReport } from '../src/modules/reports/report.service';

async function main() {
  const subeKodu = process.argv[2] || 'GVN2';
  const tarihArg = process.argv[3];
  const gun = tarihArg ? new Date(tarihArg + 'T12:00:00') : new Date();

  const branch = await prisma.branch.findFirst({ where: { code: { equals: subeKodu, mode: 'insensitive' } } });
  if (!branch) {
    console.log(`${subeKodu} şubesi bulunamadı.`);
    return;
  }

  const report = await getDailyReport(branch.id, gun);

  console.log(`shiftId: ${report.shiftId}`);
  console.log(`taxTotal (rapor genel): ${report.taxTotal}`);
  console.log(`totalCommission (rapor genel): ${report.totalCommission}`);
  console.log('');

  const salesDetail = (report as any).salesDetail as Array<any>;
  let toplamKomisyonTumu = 0;
  let toplamKomisyonAcikHesapHaric = 0;

  for (const row of salesDetail) {
    if (row.tip === 'MASRAF') continue;
    if (!row.cardPayments?.length) continue;
    console.log(`Satış ${row.saleId?.slice(0, 8)}  ${row.customerName}  netTotal=${row.netTotal}  taxExcluded=${row.taxExcluded}`);
    for (const p of row.cardPayments) {
      console.log(
        `   cardPayment: ${JSON.stringify(p)}`,
      );
      const komisyon = Number(p.commissionAmount);
      toplamKomisyonTumu += komisyon;
      if (!p.isOpenAccountCollection) toplamKomisyonAcikHesapHaric += komisyon;
    }
  }

  console.log('');
  console.log(`Toplam komisyon (tüm kart ödemeleri): ${toplamKomisyonTumu.toFixed(2)} TL`);
  console.log(`Toplam komisyon (açık hesap hariç, "commissionSalesOnly" mantığıyla): ${toplamKomisyonAcikHesapHaric.toFixed(2)} TL`);

  let taxFree = 0;
  for (const row of salesDetail) {
    if (row.tip === 'MASRAF') continue;
    taxFree += Number(row.taxExcluded);
  }
  console.log(`taxFree (satır bazlı Vergi Hariç toplamı): ${taxFree.toFixed(2)} TL`);
  console.log(`Beklenen Gün Toplamı (taxFree - commissionSalesOnly): ${(taxFree - toplamKomisyonAcikHesapHaric).toFixed(2)} TL`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
