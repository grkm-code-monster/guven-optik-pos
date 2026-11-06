/**
 * 06.11.2026 — Satışta girilmesi unutulan SGK reçete bedelini SONRADAN ekler (sadece POS).
 * Müşterinin ödediği tutar değişmez; satış tutarı reçete bedeli kadar artar (kalem indirimlerinden
 * orantılı geri alınır), KDV yeniden hesaplanır, satışa bir SGK ödemesi eklenir. Böylece satış,
 * reçeteyle baştan girilmiş bir satışla aynı yapıya gelir. ODOO'YA VE FATURAYA DOKUNULMAZ
 * (kullanıcı kararı).
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/satis-sgk-ekle.ts --satis GVNS-20261106-GVN2-00002 --sgk 126.14 [--uygula]
 */
import 'dotenv/config';
import { Prisma, ItemStatus, PaymentType, SaleStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { calcInclusiveLineAmounts } from '../src/modules/sales/sale-tax.util';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

async function main() {
  const ref = d('--satis');
  const sgkStr = d('--sgk');
  if (!ref || !sgkStr) throw new Error('--satis <REF|id> ve --sgk <tutar> zorunlu');
  const sgk = D(sgkStr).toDecimalPlaces(2);
  if (sgk.lte(0)) throw new Error('--sgk sıfırdan büyük olmalı');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const s = await prisma.sale.findFirst({
    where: { OR: [{ referansNo: ref }, { id: ref }] },
    include: { items: true, payments: true, customer: true },
  });
  if (!s) { console.log(`⚠️ DURDU: satış bulunamadı (${ref})`); return; }
  console.log(`\nSATIŞ ${s.customer?.name} | ${s.referansNo} | ${z(s.createdAt)} | ${s.status}`);
  console.log(`  brüt ${s.grossTotal} | indirim ${s.discountTotal} | net ${s.netTotal} | KDV ${s.taxTotal} | SGK ${s.sgkAmount ?? 0} | Vakıf ${s.prescriptionAmount ?? 0}`);
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${p.grossAmount} ${z(p.createdAt)}`);

  if (s.status !== SaleStatus.PAID) { console.log('⚠️ DURDU: satış PAID değil'); return; }
  if (D(s.sgkAmount ?? 0).gt(0) || s.payments.some((p) => p.paymentType === PaymentType.SGK)) {
    console.log('⚠️ DURDU: bu satışta zaten SGK tutarı/ödemesi var'); return;
  }
  const odenen = s.payments.reduce((a, p) => a.plus(p.grossAmount), D(0));
  if (odenen.minus(s.netTotal).abs().gt(0.05)) {
    console.log(`⚠️ DURDU: ödemeler toplamı (${odenen}) satış tutarıyla (${s.netTotal}) uyuşmuyor`); return;
  }

  const kalemler = s.items.filter((i) => i.status !== ItemStatus.VOID);
  const kalemToplami = kalemler.reduce((a, i) => a.plus(i.lineTotal), D(0));
  if (kalemToplami.minus(s.netTotal).abs().gt(0.05)) {
    console.log(`⚠️ DURDU: kalem toplamı (${kalemToplami}) satış tutarıyla (${s.netTotal}) uyuşmuyor`); return;
  }
  const toplamIndirim = kalemler.reduce((a, i) => a.plus(i.discount), D(0));
  if (toplamIndirim.lt(sgk)) {
    console.log(`⚠️ DURDU: kalemlerdeki toplam indirim (${toplamIndirim}) reçete bedelinden (${sgk}) az — orantılı dağıtılamıyor`); return;
  }

  // Reçete bedelini kalem indirimlerinden, indirim büyüklüğüne orantılı geri al (son kalem kuruş farkını alır).
  const indirimli = kalemler.filter((i) => D(i.discount).gt(0));
  let kalan = sgk;
  const yeni = new Map<string, { discount: Prisma.Decimal; lineTotal: Prisma.Decimal; taxAmount: Prisma.Decimal }>();
  indirimli.forEach((i, idx) => {
    const pay = idx === indirimli.length - 1 ? kalan : sgk.times(i.discount).div(toplamIndirim).toDecimalPlaces(2);
    kalan = kalan.minus(pay);
    const discount = D(i.discount).minus(pay);
    const r = calcInclusiveLineAmounts({ unitPrice: i.unitPrice, qty: i.qty, discount, taxRate: i.taxRate ?? 0 });
    yeni.set(i.id, { discount, lineTotal: r.lineTotal.toDecimalPlaces(2), taxAmount: r.taxAmount.toDecimalPlaces(2) });
  });
  if (indirimli.some((i) => yeni.get(i.id)!.discount.lt(0))) { console.log('⚠️ DURDU: bir kalemin indirimi eksiye düşüyor'); return; }

  const yeniNet = D(s.netTotal).plus(sgk);
  const yeniIndirim = D(s.discountTotal).minus(sgk);
  const yeniKdv = kalemler.reduce((a, i) => a.plus(yeni.get(i.id)?.taxAmount ?? i.taxAmount), D(0));
  const yeniKalemToplami = kalemler.reduce((a, i) => a.plus(yeni.get(i.id)?.lineTotal ?? i.lineTotal), D(0));

  console.log('\nKALEMLER (değişecek olanlar):');
  for (const i of indirimli) {
    const y = yeni.get(i.id)!;
    console.log(`  ${i.odooProductName ?? i.productId} | indirim ${i.discount} → ${y.discount} | toplam ${i.lineTotal} → ${y.lineTotal} | KDV %${i.taxRate} ${i.taxAmount} → ${y.taxAmount}`);
  }
  console.log(`\nSATIŞ: net ${s.netTotal} → ${yeniNet} | indirim ${s.discountTotal} → ${yeniIndirim} | KDV ${s.taxTotal} → ${yeniKdv} | SGK 0 → ${sgk}`);
  console.log(`  kalem toplamı ${yeniKalemToplami} (satış neti ${yeniNet} ile ${yeniKalemToplami.minus(yeniNet).abs().lte(0.05) ? 'tutuyor ✓' : 'TUTMUYOR'})`);
  const musteriOdemesi = s.payments[0];
  console.log(`  eklenecek ödeme: SGK ${sgk} (tarih ${z(musteriOdemesi?.createdAt ?? s.createdAt)}) — müşteri ödemesi aynı kalır`);
  console.log(`  müşteri payı ${odenen} (değişmez) · Odoo / fatura: DOKUNULMUYOR`);
  if (yeniKalemToplami.minus(yeniNet).abs().gt(0.05)) { console.log('\n⚠️ DURDU: kalem toplamı tutmuyor'); return; }

  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }

  await prisma.$transaction([
    ...indirimli.map((i) => prisma.saleItem.update({ where: { id: i.id }, data: yeni.get(i.id)! })),
    prisma.sale.update({ where: { id: s.id }, data: { netTotal: yeniNet, discountTotal: yeniIndirim, taxTotal: yeniKdv, sgkAmount: sgk } }),
    prisma.payment.create({
      data: {
        saleId: s.id, paymentType: PaymentType.SGK, grossAmount: sgk, netAmount: sgk,
        createdAt: musteriOdemesi?.createdAt ?? s.createdAt, createdByUserId: musteriOdemesi?.createdByUserId ?? null,
        aciklama: 'Sonradan eklenen reçete bedeli (script)',
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: s.userId, action: 'SATIS_SGK_EKLE', entity: 'Sale', entityId: s.id,
        payload: { sgk: sgk.toString(), eskiNet: s.netTotal.toString(), yeniNet: yeniNet.toString(), eskiKdv: s.taxTotal.toString(), yeniKdv: yeniKdv.toString(), script: true },
      },
    }),
  ]);
  console.log('\n✓ Reçete bedeli eklendi (Odoo/fatura değişmedi)');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
