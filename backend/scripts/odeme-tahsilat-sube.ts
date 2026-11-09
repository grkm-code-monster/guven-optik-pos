/**
 * 09.11.2026 — Bir ödemenin (açık hesap tahsilatı) ALINDIĞI şubeyi (Payment.tahsilatBranchId) değiştirir.
 * Örnek: Halil Özler'in 09.11 kart tahsilatı, Sude'nin kullanıcısı o saatte hâlâ GVN1'de olduğu için
 * GVN1'e yazıldı; para GVN2'de alındı. Tutar, tarih, banka, komisyon DEĞİŞMEZ.
 * Nakit ödemede, ödemeye bağlı kasa hareketi (CashMovement) de hedef şubenin o saatte açık vardiyasına taşınır.
 * Odoo'ya dokunulmaz.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/odeme-tahsilat-sube.ts --musteri "HALİL ÖZLER" --tutar 4400 --hedef GVN2 [--uygula]
 *   (birden fazla ödeme eşleşirse --id <paymentId>)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function main() {
  const id = d('--id'), musteri = d('--musteri'), tutar = d('--tutar'), hedefKod = (d('--hedef') ?? '').toUpperCase();
  if (!hedefKod) throw new Error('--hedef zorunlu (ör. GVN2)');
  if (!id && (!musteri || !tutar)) throw new Error('--id ya da (--musteri ve --tutar) zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const subeler = await prisma.branch.findMany();
  const kod = new Map(subeler.map((b) => [b.id, b.code]));
  const hedef = subeler.find((b) => b.code === hedefKod);
  if (!hedef) throw new Error(`Şube ${hedefKod} yok`);
  const odemeler = await prisma.payment.findMany({
    where: {
      paymentType: { in: ['CASH', 'CARD', 'TRANSFER'] },
      ...(id ? { id } : { grossAmount: Number(tutar), sale: { customer: { name: { contains: musteri!, mode: 'insensitive' } } } }),
    },
    include: { sale: { include: { customer: true } } },
    orderBy: { createdAt: 'asc' },
  });
  for (const p of odemeler)
    console.log(`  ${p.id} | ${z(p.createdAt)} | ${p.sale.customer?.name} | ${p.paymentType} ${p.grossAmount} | satış ${p.sale.referansNo} (${kod.get(p.sale.branchId)}) | tahsilat şubesi ${kod.get(p.tahsilatBranchId ?? '') ?? '(satış şubesi: ' + kod.get(p.sale.branchId) + ')'}`);
  if (odemeler.length !== 1) { console.log(`${odemeler.length} ödeme bulundu (tam 1 olmalı; --id ile seçin).`); return; }
  const p = odemeler[0];
  const simdiki = p.tahsilatBranchId ?? p.sale.branchId;
  if (simdiki === hedef.id) { console.log(`Zaten ${hedefKod}. Değişiklik yok.`); return; }
  const hareketler = p.paymentType === 'CASH' ? await prisma.cashMovement.findMany({ where: { description: { contains: p.id } } }) : [];
  let vardiya: { id: string } | null = null;
  if (hareketler.length) {
    vardiya = await prisma.shift.findFirst({
      where: { branchId: hedef.id, openedAt: { lte: p.createdAt }, OR: [{ closedAt: null }, { closedAt: { gte: p.createdAt } }] },
      orderBy: { openedAt: 'desc' },
    });
    console.log(`  nakit kasa hareketi: ${hareketler.length} adet → ${hedefKod} vardiyası ${vardiya?.id ?? 'YOK'}`);
    if (!vardiya) { console.log(`⚠️ DURDU: ${hedefKod}'de o saatte açık vardiya yok.`); return; }
  }
  console.log(`→ tahsilat şubesi ${kod.get(simdiki)} → ${hedefKod}`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — uygulamak için --uygula ekleyin.'); return; }
  await prisma.$transaction([
    prisma.payment.update({ where: { id: p.id }, data: { tahsilatBranchId: hedef.id } }),
    ...(hareketler.length && vardiya
      ? [prisma.cashMovement.updateMany({ where: { id: { in: hareketler.map((h) => h.id) } }, data: { branchId: hedef.id, shiftId: vardiya.id } })]
      : []),
  ]);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) await prisma.auditLog.create({ data: { userId: admin.id, action: 'ODEME_TAHSILAT_SUBE', entity: 'Payment', entityId: p.id, payload: { eski: kod.get(simdiki), yeni: hedefKod, tutar: String(p.grossAmount), script: true } } });
  console.log(`✓ Ödeme ${p.id} artık ${hedefKod} tahsilatı.`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
