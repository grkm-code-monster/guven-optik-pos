/**
 * 06.11.2026 — Bir KART ödemesinin bankasını (ve isteğe bağlı taksit/POS) düzeltir; komisyonu ödemenin
 * KENDİ tarihindeki oranla yeniden hesaplar. Tutar ve tarih değişmez. Odoo'ya dokunulmaz (Odoo'da kart
 * ödemeleri bankaya göre değil ödeme türüne göre tek yevmiyeye işleniyor).
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/odeme-banka-degistir.ts --musteri KAYAHAN --tutar 23000 --banka garanti [--taksit 3] [--pos "GVN2"] [--uygula]
 *   (birden fazla kart ödemesi eşleşirse --id <paymentId>)
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { calculateCommission } from '../src/modules/payments/commission.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function main() {
  const id = d('--id'), musteri = d('--musteri'), tutar = d('--tutar'), bankaAdi = d('--banka'), posAdi = d('--pos');
  if (!bankaAdi) throw new Error('--banka zorunlu');
  if (!id && (!musteri || !tutar)) throw new Error('--id ya da (--musteri ve --tutar) zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const odemeler = await prisma.payment.findMany({
    where: { paymentType: 'CARD', ...(id ? { id } : { grossAmount: Number(tutar), sale: { customer: { name: { contains: musteri!, mode: 'insensitive' } } } }) },
    include: { sale: { include: { customer: true } } },
  });
  if (odemeler.length !== 1) {
    console.log(`${odemeler.length} kart ödemesi bulundu (tam 1 olmalı; --id ile seçin):`);
    for (const p of odemeler) console.log(`  ${p.id} ${p.sale.customer?.name} ${p.grossAmount} ${z(p.createdAt)}`);
    return;
  }
  const p = odemeler[0];
  const bankalar = await prisma.bank.findMany({ where: { name: { contains: bankaAdi, mode: 'insensitive' } } });
  if (bankalar.length !== 1) {
    const tum = await prisma.bank.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    console.log(`⚠️ DURDU: "${bankaAdi}" ile ${bankalar.length} banka eşleşti. Bankalar: ${tum.map((b) => b.name).join(', ')}`);
    return;
  }
  const banka = bankalar[0];
  const taksit = Number(d('--taksit') ?? p.installment ?? 1);
  const sube = p.tahsilatBranchId ?? p.sale.branchId;
  const poslar = await prisma.posDevice.findMany({
    where: { bankId: banka.id, isActive: true, ...(posAdi ? { name: { contains: posAdi, mode: 'insensitive' } } : { branchId: sube }) },
  });
  const pos = poslar.length === 1 ? poslar[0] : null;
  const eskiBanka = p.bankId ? (await prisma.bank.findUnique({ where: { id: p.bankId } }))?.name : '—';
  const k = await calculateCommission(banka.id, taksit, p.grossAmount.toString(), p.createdAt);
  console.log(`\nÖDEME ${p.sale.customer?.name} | ${p.grossAmount} TL | ${z(p.createdAt)}`);
  console.log(`  banka ${eskiBanka} / ${p.installment} taksit / komisyon ${p.commissionAmount}  →  ${banka.name} / ${taksit} taksit / komisyon ${k.commissionAmount} (%${(Number(k.commissionRate) * 100).toFixed(2)})`);
  console.log(`  POS: ${pos ? pos.name : poslar.length ? `${poslar.length} POS eşleşti — --pos ile seçin` : 'bu bankanın şubede POS kaydı yok (boş bırakılır)'}`);
  if (poslar.length > 1) { console.log('\n⚠️ DURDU: POS seçilemedi'); return; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: p.id },
      data: {
        bankId: banka.id, posDeviceId: pos?.id ?? null, installment: taksit,
        commissionRate: new Prisma.Decimal(k.commissionRate), commissionAmount: new Prisma.Decimal(k.commissionAmount), netAmount: new Prisma.Decimal(k.netAmount),
      },
    }),
    prisma.auditLog.create({
      data: { userId: p.createdByUserId ?? p.sale.userId, action: 'ODEME_BANKA_DEGISTIR', entity: 'Payment', entityId: p.id, payload: { eskiBanka, yeniBanka: banka.name, taksit, eskiKomisyon: p.commissionAmount?.toString() ?? null, yeniKomisyon: k.commissionAmount, script: true } },
    }),
  ]);
  console.log('✓ Banka ve komisyon güncellendi');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
