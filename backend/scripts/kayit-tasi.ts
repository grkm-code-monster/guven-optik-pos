/**
 * 06.11.2026 — Kasa kayıtlarını doğru GÜNE ve/veya doğru ŞUBEYE taşır (geç girilmiş masraf/tahsilat,
 * yanlış şube hesabıyla girilmiş satış). VARSAYILAN KURU ÇALIŞMA — uygulamak için --uygula.
 *
 * Kullanım:
 *   Liste (id'leri görmek için):  --liste --tarih 2026-11-06 [--sube GVN2]
 *   Ödeme (açık hesap tahsilatı): --odeme <paymentId> [--sube GVN2] [--tarih 2026-11-03 [--saat 18:00]] [--kapali-vardiya] [--uygula]
 *   Masraf / kasa hareketi:       --masraf <cashMovementId> --tarih 2026-11-02 [--saat 18:00] [--kapali-vardiya] [--uygula]
 *   Satışın şubesi:               --satis <REF|saleId> --sube GVN2 [--kapali-vardiya] [--uygula]
 *
 * Satış şubesi taşınınca: Sale.branchId + Sale.shiftId (hedef şubenin AYNI GÜNKÜ vardiyası) ve satışın
 * nakit kasa hareketi taşınır. Odoo'ya (sipariş, stok, fatura) DOKUNULMAZ — stok çıkışı eski şubeden kalır.
 * Satış tarihi değişecekse ayrıca scripts/satis-tarih-degistir.ts kullanılır.
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const deger = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const bayrak = (b: string) => argv.includes(b);
const UYGULA = bayrak('--uygula');
const z = (d?: Date | null) => (d ? d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const tl = (v: unknown) => Number(v ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
const gunAraligi = (t: string) => ({ gte: new Date(`${t}T00:00:00+03:00`), lte: new Date(`${t}T23:59:59+03:00`) });
const gunu = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

async function subeBul(kod?: string) {
  if (!kod) return null;
  const b = await prisma.branch.findFirst({ where: { code: kod } });
  if (!b) throw new Error(`Şube bulunamadı: ${kod}`);
  return b;
}

async function gunVardiyasi(branchId: string, tarih: string) {
  return prisma.shift.findFirst({ where: { branchId, openedAt: gunAraligi(tarih) }, orderBy: { openedAt: 'desc' } });
}

/** Saat verilmişse o saat; değilse eski saat. Vardiya dışında kalırsa vardiya içine çekilir. */
function hedefZaman(eski: Date, tarih: string, saat: string | undefined, v: { openedAt: Date; closedAt: Date | null }) {
  const s = saat ?? eski.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }).slice(0, 5);
  let yeni = new Date(`${tarih}T${s.length === 5 ? s + ':00' : s}+03:00`);
  if (isNaN(+yeni)) throw new Error('Tarih/saat okunamadı');
  if (yeni < v.openedAt) yeni = new Date(+v.openedAt + 60_000);
  if (v.closedAt && yeni > v.closedAt) yeni = new Date(+v.closedAt - 60_000);
  return yeni;
}

function engelKontrol(engel: string[]) {
  if (engel.length) { console.log('\n⚠️ DURDU:\n  - ' + engel.join('\n  - ')); return true; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için aynı komutun sonuna --uygula ekleyin.'); return true; }
  return false;
}

async function liste() {
  const tarih = deger('--tarih');
  if (!tarih) throw new Error('--tarih zorunlu');
  const sube = await subeBul(deger('--sube'));
  const kodlar = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  const aralik = gunAraligi(tarih);
  const satislar = await prisma.sale.findMany({
    where: { status: 'PAID', createdAt: aralik, ...(sube ? { branchId: sube.id } : {}) },
    include: { customer: true, user: true, payments: true }, orderBy: { createdAt: 'asc' },
  });
  console.log(`\n=== SATIŞLAR ${tarih}`);
  for (const s of satislar)
    console.log(`  ${z(s.createdAt)} ${kodlar.get(s.branchId)} ${s.referansNo ?? s.id} | ${s.customer?.name} | net ${tl(s.netTotal)} | ${s.user?.name} | ${s.payments.map((p) => `${p.paymentType} ${tl(p.grossAmount)}`).join(' + ')}`);
  const odemeler = await prisma.payment.findMany({
    where: { createdAt: aralik, paymentType: { in: ['CASH', 'CARD', 'TRANSFER', 'CIRO_DUZELTME'] as any }, sale: { createdAt: { lt: aralik.gte } } },
    include: { sale: { include: { customer: true } } }, orderBy: { createdAt: 'asc' },
  });
  console.log(`\n=== AÇIK HESAP TAHSİLATLARI ${tarih} (eski satışlara)`);
  for (const p of odemeler) {
    const kasa = p.tahsilatBranchId ?? p.sale.branchId;
    if (sube && kasa !== sube.id) continue;
    console.log(`  ${z(p.createdAt)} kasa ${kodlar.get(kasa)} | ${p.sale.customer?.name} (satış ${gunu(p.sale.createdAt)}) | ${p.paymentType} ${tl(p.grossAmount)} | id ${p.id}`);
  }
  const hareketler = await prisma.cashMovement.findMany({ where: { createdAt: aralik, ...(sube ? { branchId: sube.id } : {}) }, orderBy: { createdAt: 'asc' } });
  console.log(`\n=== KASA HAREKETLERİ ${tarih}`);
  for (const c of hareketler) console.log(`  ${z(c.createdAt)} ${kodlar.get(c.branchId)} ${c.type} ${tl(c.amount)} | ${c.description.slice(0, 70)} | id ${c.id}`);
  const manuel = await prisma.manuelTahsilat.findMany({ where: { createdAt: aralik, ...(sube ? { branchId: sube.id } : {}) }, orderBy: { createdAt: 'asc' } });
  console.log(`\n=== MANUEL TAHSİLATLAR ${tarih}`);
  for (const m of manuel) console.log(`  ${z(m.createdAt)} ${kodlar.get(m.branchId)} ${m.customerAdi} ${m.odemeTuru} ${tl(m.tutar)} | id ${m.id}`);
}

async function odeme(id: string) {
  const p = await prisma.payment.findUnique({ where: { id }, include: { sale: { include: { customer: true } } } });
  if (!p) throw new Error('Ödeme bulunamadı');
  const hedefSube = await subeBul(deger('--sube'));
  const tarih = deger('--tarih');
  const eskiKasa = p.tahsilatBranchId ?? p.sale.branchId;
  const yeniKasa = hedefSube?.id ?? eskiKasa;
  const kodlar = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  console.log(`\nÖDEME ${p.sale.customer?.name} | ${p.paymentType} ${tl(p.grossAmount)} | ${z(p.createdAt)} | kasa ${kodlar.get(eskiKasa)} | satış ${gunu(p.sale.createdAt)} ${kodlar.get(p.sale.branchId)}`);
  const engel: string[] = [];
  const hedefGun = tarih ?? gunu(p.createdAt);
  const v = await gunVardiyasi(yeniKasa, hedefGun);
  if (!v) engel.push(`${kodlar.get(yeniKasa)} şubesinde ${hedefGun} vardiyası yok`);
  else if (v.status !== 'OPEN' && !bayrak('--kapali-vardiya')) engel.push(`${hedefGun} ${kodlar.get(yeniKasa)} vardiyası KAPANMIŞ (onaylıyorsanız --kapali-vardiya)`);
  const yeni = v ? (tarih ? hedefZaman(p.createdAt, tarih, deger('--saat'), v) : p.createdAt) : p.createdAt;
  if (yeni <= p.sale.createdAt) engel.push('Yeni tarih satıştan önce olamaz');
  // Bu ödemenin nakit kasa hareketi (açık hesap nakit tahsilatı)
  const nakit = p.paymentType === 'CASH'
    ? await prisma.cashMovement.findMany({
        where: {
          type: 'CASH_IN', amount: p.grossAmount, description: { startsWith: `OPEN_ACCOUNT_PAYMENT:${p.sale.customerId}:${p.saleId}` },
          createdAt: { gte: new Date(+p.createdAt - 120_000), lte: new Date(+p.createdAt + 120_000) },
        },
      })
    : [];
  console.log(`  → kasa ${kodlar.get(yeniKasa)} | ${z(yeni)}${v ? ` | vardiya ${z(v.openedAt)}→${z(v.closedAt)} ${v.status}` : ''}${nakit.length ? ` | nakit kasa hareketi de taşınır (${nakit.length})` : ''}`);
  if (engelKontrol(engel)) return;
  await prisma.$transaction([
    prisma.payment.update({ where: { id: p.id }, data: { createdAt: yeni, ...(hedefSube ? { tahsilatBranchId: hedefSube.id } : {}) } }),
    ...nakit.map((c) => prisma.cashMovement.update({ where: { id: c.id }, data: { createdAt: yeni, branchId: yeniKasa, shiftId: v!.id } })),
    prisma.auditLog.create({ data: { userId: p.createdByUserId ?? p.sale.userId, action: 'KAYIT_TASI_ODEME', entity: 'Payment', entityId: p.id, payload: { eskiTarih: p.createdAt.toISOString(), yeniTarih: yeni.toISOString(), eskiKasa, yeniKasa, script: true } } }),
  ]);
  console.log('✓ Ödeme taşındı');
}

async function masraf(id: string) {
  const c = await prisma.cashMovement.findUnique({ where: { id } });
  if (!c) throw new Error('Kasa hareketi bulunamadı');
  const tarih = deger('--tarih');
  if (!tarih) throw new Error('--tarih zorunlu');
  const kod = (await prisma.branch.findUnique({ where: { id: c.branchId } }))?.code;
  console.log(`\nKASA HAREKETİ ${kod} | ${c.type} ${tl(c.amount)} | ${c.description} | ${z(c.createdAt)}`);
  const engel: string[] = [];
  const v = await gunVardiyasi(c.branchId, tarih);
  if (!v) engel.push(`${kod} şubesinde ${tarih} vardiyası yok`);
  else if (v.status !== 'OPEN' && !bayrak('--kapali-vardiya')) engel.push(`${tarih} vardiyası KAPANMIŞ (onaylıyorsanız --kapali-vardiya)`);
  const yeni = v ? hedefZaman(c.createdAt, tarih, deger('--saat'), v) : c.createdAt;
  console.log(`  → ${z(yeni)}${v ? ` | vardiya ${z(v.openedAt)}→${z(v.closedAt)} ${v.status}` : ''}`);
  if (engelKontrol(engel)) return;
  await prisma.$transaction([
    prisma.cashMovement.update({ where: { id: c.id }, data: { createdAt: yeni, shiftId: v!.id } }),
    prisma.auditLog.create({ data: { userId: c.userId, action: 'KAYIT_TASI_MASRAF', entity: 'CashMovement', entityId: c.id, payload: { eskiTarih: c.createdAt.toISOString(), yeniTarih: yeni.toISOString(), script: true } } }),
  ]);
  console.log('✓ Kasa hareketi taşındı');
}

async function satis(ref: string) {
  const s = await prisma.sale.findFirst({ where: { OR: [{ referansNo: ref }, { id: ref }] }, include: { customer: true, payments: true } });
  if (!s) throw new Error('Satış bulunamadı');
  const hedef = await subeBul(deger('--sube'));
  if (!hedef) throw new Error('--sube zorunlu');
  const kodlar = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  const gun = gunu(s.createdAt);
  console.log(`\nSATIŞ ${s.referansNo ?? s.id} | ${s.status} | ${s.customer?.name} | net ${tl(s.netTotal)} | ${z(s.createdAt)} | şube ${kodlar.get(s.branchId)} → ${hedef.code}`);
  const engel: string[] = [];
  if (s.branchId === hedef.id) engel.push('Satış zaten bu şubede');
  const v = await gunVardiyasi(hedef.id, gun);
  if (!v) engel.push(`${hedef.code} şubesinde ${gun} vardiyası yok`);
  else if (v.status !== 'OPEN' && !bayrak('--kapali-vardiya')) engel.push(`${gun} ${hedef.code} vardiyası KAPANMIŞ (onaylıyorsanız --kapali-vardiya)`);
  const nakit = await prisma.cashMovement.findMany({ where: { description: { startsWith: `SALE_CASH_PAYMENT:${s.id}` } } });
  // Sonradan alınmış açık hesap tahsilatları eski şubenin kasasında kalsın (tahsilatBranchId sabitlenir)
  const sonraki = s.payments.filter((p) => !p.tahsilatBranchId && +p.createdAt - +s.createdAt > 3 * 3600_000 && ['CASH', 'CARD', 'TRANSFER'].includes(p.paymentType));
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${tl(p.grossAmount)} ${z(p.createdAt)}${sonraki.includes(p) ? ' [sonradan tahsilat — eski kasasında kalır]' : ''}`);
  if (v) console.log(`  → vardiya ${z(v.openedAt)}→${z(v.closedAt)} ${v.status}${nakit.length ? ` | nakit kasa hareketi de taşınır (${nakit.length})` : ''}`);
  console.log('  Not: Odoo (sipariş/stok/fatura) değişmez.');
  if (engelKontrol(engel)) return;
  await prisma.$transaction([
    prisma.sale.update({ where: { id: s.id }, data: { branchId: hedef.id, shiftId: v!.id } }),
    ...sonraki.map((p) => prisma.payment.update({ where: { id: p.id }, data: { tahsilatBranchId: s.branchId } })),
    ...nakit.map((c) => prisma.cashMovement.update({ where: { id: c.id }, data: { branchId: hedef.id, shiftId: v!.id } })),
    prisma.auditLog.create({ data: { userId: s.userId, action: 'KAYIT_TASI_SATIS_SUBE', entity: 'Sale', entityId: s.id, payload: { eskiSube: s.branchId, yeniSube: hedef.id, eskiVardiya: s.shiftId, yeniVardiya: v!.id, script: true } } }),
  ]);
  console.log('✓ Satış şubesi taşındı');
}

async function main() {
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  if (bayrak('--liste')) return liste();
  const o = deger('--odeme'), m = deger('--masraf'), s = deger('--satis');
  if (o) return odeme(o);
  if (m) return masraf(m);
  if (s) return satis(s);
  throw new Error('--liste, --odeme, --masraf ya da --satis verin');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
