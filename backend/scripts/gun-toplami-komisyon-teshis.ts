/**
 * 22.10.2026 — "Gün Toplamı" kutusu komisyonu düşmüyor gibi görünüyor
 * ("Vergi Hariç" toplamıyla birebir aynı çıkıyor, oysa banka komisyonu
 * kadar daha düşük olması gerekiyordu). SALT OKUNUR teşhis.
 *
 * isOpenAccountCollection bayrağının (bkz. report.service.ts buildSalesDetail,
 * isSameCalendarDay) bugünün kendi satışlarındaki kart ödemeleri için neden
 * true (yanlış) dönüyor olabileceğini anlamak için, her kart ödemesinin
 * payment.createdAt'ini sale.createdAt ile karşılaştırıp gösterir.
 *
 * Kullanım:
 *   npm run gun-toplami-komisyon-teshis -- 2026-10-22
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { PaymentType, SaleStatus } from '@prisma/client';

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function main() {
  const tarihArg = process.argv[2];
  const gun = tarihArg ? new Date(tarihArg + 'T00:00:00') : new Date();
  gun.setHours(0, 0, 0, 0);
  const gunSonu = new Date(gun);
  gunSonu.setDate(gunSonu.getDate() + 1);

  console.log(`Sunucu zaman dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}, process.env.TZ=${process.env.TZ ?? '(ayarlanmamış)'}`);
  console.log(`Şu an sunucu saati: ${new Date().toString()}`);
  console.log('');

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: [SaleStatus.PAID, SaleStatus.DRAFT] },
      createdAt: { gte: gun, lt: gunSonu },
    },
    include: {
      customer: { select: { name: true } },
      payments: { where: { paymentType: PaymentType.CARD } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let toplamKomisyon = 0;
  let acikHesapSayilanKomisyon = 0;
  let normalSayilanKomisyon = 0;

  for (const sale of sales) {
    if (!sale.payments.length) continue;
    console.log(`Satış #${sale.id.slice(0, 8)}  ${sale.customer?.name ?? '—'}  sale.createdAt=${sale.createdAt.toISOString()} (yerel: ${sale.createdAt.toString()})`);
    for (const p of sale.payments) {
      const ayniGun = isSameCalendarDay(p.createdAt, sale.createdAt);
      const komisyon = Number(p.commissionAmount ?? 0);
      toplamKomisyon += komisyon;
      if (ayniGun) normalSayilanKomisyon += komisyon;
      else acikHesapSayilanKomisyon += komisyon;
      console.log(
        `  payment.createdAt=${p.createdAt.toISOString()} (yerel: ${p.createdAt.toString()})  ` +
          `aynı takvim günü mü: ${ayniGun}  komisyon: ${komisyon.toFixed(2)} TL  ` +
          `-> isOpenAccountCollection=${!ayniGun}`,
      );
    }
  }

  console.log('');
  console.log(`Toplam kart komisyonu: ${toplamKomisyon.toFixed(2)} TL`);
  console.log(`"Aynı gün" sayılıp Gün Toplamı'ndan düşülmesi gereken: ${normalSayilanKomisyon.toFixed(2)} TL`);
  console.log(`"Açık hesap tahsilatı" sayılıp HARİÇ TUTULAN: ${acikHesapSayilanKomisyon.toFixed(2)} TL`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
