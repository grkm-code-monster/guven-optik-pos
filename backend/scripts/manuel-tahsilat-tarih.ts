/**
 * 05.11.2026 — Manuel / kağıt üstü eski borç tahsilatının TARİHİNİ değiştirir.
 * Gün sonu raporu bu tahsilatları vardiyanın açık olduğu saat aralığına göre gösterir
 * (buildManuelTahsilatRows) → createdAt hedef günün vardiya aralığına, shiftId o vardiyaya çekilir.
 * Nakit ise bağlı CashMovement (MANUEL_TAHSILAT:<müşteri>) da taşınır.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/manuel-tahsilat-tarih.ts --musteri "YELİZ KUMRAL" --tutar 10000 --tarih 2026-11-04 [--saat 15:00] [--kapali-vardiya] [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function main() {
  const musteri = d('--musteri'), tutar = Number(d('--tutar')), tarih = d('--tarih');
  if (!musteri || !tutar || !tarih) throw new Error('--musteri, --tutar, --tarih zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "ManuelTahsilat" WHERE "customerAdi" ILIKE ${'%' + musteri + '%'} AND "tutar" = ${tutar} ORDER BY "createdAt" DESC`;
  if (rows.length !== 1) {
    console.log(`${rows.length} kayıt bulundu (tam 1 olmalı):`);
    for (const r of rows) console.log(`  ${r.id} ${r.customerAdi} ${r.tutar} ${r.odemeTuru} ${z(r.createdAt)} "${r.aciklama ?? ''}"`);
    return;
  }
  const t = rows[0];
  const sube = await prisma.branch.findUnique({ where: { id: t.branchId } });
  const saatEski = new Date(t.createdAt).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }).slice(0, 8);
  let yeni = new Date(`${tarih}T${(d('--saat') ?? saatEski).padEnd(8, ':00').slice(0, 8)}+03:00`);
  const gunBas = new Date(`${tarih}T00:00:00+03:00`), gunSon = new Date(`${tarih}T23:59:59+03:00`);
  const vardiya = await prisma.shift.findFirst({ where: { branchId: t.branchId, openedAt: { gte: gunBas, lte: gunSon } }, orderBy: { openedAt: 'desc' }, include: { user: { select: { name: true } } } });
  if (vardiya && (yeni < vardiya.openedAt || (vardiya.closedAt && yeni > vardiya.closedAt))) {
    yeni = new Date(+vardiya.openedAt + 60_000);
    console.log('  (saat vardiya dışında kalıyordu; vardiya açılışından 1 dk sonraya alındı)');
  }
  console.log(`\nTAHSİLAT ${t.customerAdi} | ${t.tutar} TL | ${t.odemeTuru} | şube ${sube?.code} | "${t.aciklama ?? ''}"`);
  console.log(`  tarih: ${z(t.createdAt)} → ${z(yeni)}`);
  console.log(`  vardiya → ${vardiya ? `${z(vardiya.openedAt)}→${z(vardiya.closedAt)} ${vardiya.status} (${vardiya.user.name})` : 'YOK'}`);
  const nakit = t.odemeTuru === 'CASH' ? await prisma.cashMovement.findMany({ where: { description: { startsWith: `MANUEL_TAHSILAT:${t.customerId}:` }, amount: tutar, shiftId: t.shiftId ?? undefined } }) : [];
  if (t.odemeTuru === 'CASH') console.log(`  nakit kasa hareketi: ${nakit.length} adet (taşınacak)`);
  if (!vardiya) { console.log(`\n⚠️ DURDU: ${sube?.code} şubesinde ${tarih} vardiyası yok.`); return; }
  if (vardiya.status !== 'OPEN' && !argv.includes('--kapali-vardiya')) { console.log(`\n⚠️ DURDU: ${tarih} vardiyası KAPANMIŞ — o günün raporuna eklenecek (onaylıyorsanız --kapali-vardiya).`); return; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }
  await prisma.$transaction([
    // 06.11.2026: ham SQL tarihi TR saatiyle yazıyordu → Prisma'nın kendi update'i (UTC)
    prisma.manuelTahsilat.update({ where: { id: t.id }, data: { createdAt: yeni, shiftId: vardiya.id } }),
    ...nakit.map((c) => prisma.cashMovement.update({ where: { id: c.id }, data: { createdAt: yeni, shiftId: vardiya.id } })),
  ]);
  console.log('✓ Tahsilat tarihi ve vardiyası güncellendi');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
