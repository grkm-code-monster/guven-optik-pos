/**
 * 05.11.2026 — Bir CİRO DÜZELTME kaydının tarihini başka bir günün vardiyasına çeker
 * (ör. 04.11'de yapılmış indirim bugün sisteme girildiyse). Sadece Payment.createdAt değişir;
 * kasa formu ciro düzeltmeyi vardiyanın açık olduğu saat aralığına göre gösterir.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/ciro-duzeltme-tarih.ts --musteri "DİKGÖZ" --tarih 2026-11-04 [--tutar 5000] [--saat 18:00] [--kapali-vardiya] [--uygula]
 *   (birden fazla kayıt eşleşirse hepsi listelenir; --id <payment id> ile tek tek)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function main() {
  const id = d('--id'), musteri = d('--musteri'), tarih = d('--tarih'), tutar = d('--tutar');
  if (!tarih || (!id && !musteri)) throw new Error('--tarih ve (--id ya da --musteri) zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const kayitlar = await prisma.payment.findMany({
    where: {
      paymentType: 'CIRO_DUZELTME' as any,
      ...(id ? { id } : { sale: { customer: { name: { contains: musteri!, mode: 'insensitive' } } } }),
      ...(tutar ? { grossAmount: Number(tutar) } : {}),
    },
    include: { sale: { select: { id: true, branchId: true, createdAt: true, customer: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!kayitlar.length) { console.log('Eşleşen ciro düzeltme kaydı yok.'); return; }
  const gunBas = new Date(`${tarih}T00:00:00+03:00`), gunSon = new Date(`${tarih}T23:59:59+03:00`);
  const islemler: Array<{ id: string; yeni: Date }> = [];
  for (const k of kayitlar) {
    const vardiya = await prisma.shift.findFirst({ where: { branchId: k.sale.branchId, openedAt: { gte: gunBas, lte: gunSon } }, orderBy: { openedAt: 'desc' } });
    const sube = await prisma.branch.findUnique({ where: { id: k.sale.branchId }, select: { code: true } });
    console.log(`\n${k.sale.customer?.name} · −${k.grossAmount} TL · "${k.aciklama ?? ''}" · şube ${sube?.code} · şimdiki tarih ${z(k.createdAt)} · id ${k.id}`);
    if (!vardiya) { console.log(`  ⚠️ ATLANDI: ${sube?.code} şubesinde ${tarih} vardiyası yok.`); continue; }
    if (vardiya.status !== 'OPEN' && !argv.includes('--kapali-vardiya')) { console.log(`  ⚠️ ATLANDI: ${tarih} vardiyası KAPANMIŞ (onaylıyorsanız --kapali-vardiya).`); continue; }
    let yeni = new Date(`${tarih}T${(d('--saat') ?? '18:00').padEnd(8, ':00').slice(0, 8)}+03:00`);
    if (yeni < vardiya.openedAt || (vardiya.closedAt && yeni > vardiya.closedAt)) {
      yeni = new Date(+(vardiya.closedAt ?? vardiya.openedAt) - 60_000);
      if (yeni < vardiya.openedAt) yeni = new Date(+vardiya.openedAt + 60_000);
    }
    if (yeni <= k.sale.createdAt) { console.log('  ⚠️ ATLANDI: yeni tarih satıştan önce olamaz.'); continue; }
    console.log(`  → ${z(yeni)} (vardiya ${z(vardiya.openedAt)} → ${z(vardiya.closedAt)})`);
    islemler.push({ id: k.id, yeni });
  }
  if (!UYGULA) { console.log(`\nKURU ÇALIŞMA — ${islemler.length} kayıt taşınacak. Uygulamak için --uygula ekleyin.`); return; }
  await prisma.$transaction(islemler.map((i) => prisma.payment.update({ where: { id: i.id }, data: { createdAt: i.yeni } })));
  console.log(`✓ ${islemler.length} ciro düzeltme kaydı taşındı`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
