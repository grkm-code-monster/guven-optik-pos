/**
 * 05.11.2026 — Bir satışın TARİHİNİ değiştirir (personel ertesi gün girmiş satışlar için).
 *
 * VARSAYILAN: KURU ÇALIŞMA — hiçbir şey değiştirmez, sadece neyin değişeceğini yazar. Uygulamak için --uygula.
 *
 * Değişen (POS): Sale.createdAt, Payment.createdAt, satışa bağlı CashMovement.createdAt,
 *   Sale.shiftId + CashMovement.shiftId → aynı şubenin yeni tarihteki vardiyası (günlük kasa raporu vardiyaya göre).
 * Değişen (Odoo, --odoo ile): sale.order date_order, teslimat (picking) date_done + stok hareketi tarihleri.
 * DOKUNULMAYAN: Odoo faturası (account.move) tarihi, GİB'e gönderilmiş e-fatura/e-arşiv (yasal belge),
 *   referansNo (GVNS-YYYYMMDD-… basılı belgelerde geçtiği için).
 * Güvenlik: e-faturası GİB'e gönderilmiş satış --faturali-dahil olmadan ATLANIR;
 *   hedef vardiya KAPANMIŞSA --kapali-vardiya olmadan ATLANIR (kapanmış günün kasası değişeceği için).
 *
 * Kullanım: npx ts-node --transpile-only scripts/satis-tarih-degistir.ts GVNS-20261105-GVN2-00002 --tarih 2026-11-04 [--saat 18:30] [--odoo] [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

const argv = process.argv.slice(2);
const bayrak = (b: string) => argv.includes(b);
const deger = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = bayrak('--uygula');
const ODOO = bayrak('--odoo');
const CTX = { allowed_company_ids: [1, 2, 3, 4], active_test: false };
const z = (d?: Date | null) => (d ? d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const tl = (v: unknown) => Number(v ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
const odooTarih = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19); // Odoo UTC saklar

async function main() {
  const ref = argv.find((a, i) => !a.startsWith('--') && !['--tarih', '--saat'].includes(argv[i - 1] ?? ''));
  const tarih = deger('--tarih');
  if (!ref || !tarih || !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) throw new Error('Kullanım: <REF> --tarih YYYY-AA-GG [--saat SS:DD] [--odoo] [--uygula]');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const sale = await prisma.sale.findFirst({
    where: { OR: [{ referansNo: ref }, { id: ref }] },
    include: { customer: { select: { name: true } }, user: { select: { name: true } }, payments: true },
  });
  if (!sale) throw new Error(`${ref} bulunamadı`);
  const sube = await prisma.branch.findUnique({ where: { id: sale.branchId } });
  const eskiSaat = sale.createdAt.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false });
  const saat = deger('--saat') ?? eskiSaat.slice(0, 8);
  const yeni = new Date(`${tarih}T${saat.length === 5 ? saat + ':00' : saat}+03:00`);
  if (isNaN(+yeni)) throw new Error('Tarih/saat okunamadı');
  const fark = +yeni - +sale.createdAt;

  console.log(`\nSATIŞ ${sale.referansNo} | ${sale.status} | ${sube?.code} | ${sale.customer?.name} | net ${tl(sale.netTotal)} | personel ${sale.user.name}`);
  console.log(`  tarih: ${z(sale.createdAt)}  →  ${z(yeni)}`);
  for (const p of sale.payments) console.log(`  ödeme ${p.paymentType} ${tl(p.grossAmount)}: ${z(p.createdAt)} → ${z(new Date(+p.createdAt + fark))}`);

  const eskiVardiya = await prisma.shift.findUnique({ where: { id: sale.shiftId }, include: { user: { select: { name: true } } } });
  const hedef = await prisma.shift.findFirst({
    where: { branchId: sale.branchId, openedAt: { lte: yeni }, OR: [{ closedAt: null }, { closedAt: { gte: yeni } }] },
    orderBy: { openedAt: 'desc' }, include: { user: { select: { name: true } } },
  });
  // saat vardiya dışında kalırsa: o günün vardiyası
  const gunBas = new Date(`${tarih}T00:00:00+03:00`), gunSon = new Date(`${tarih}T23:59:59+03:00`);
  const gunVardiya = hedef ?? await prisma.shift.findFirst({ where: { branchId: sale.branchId, openedAt: { gte: gunBas, lte: gunSon } }, orderBy: { openedAt: 'desc' }, include: { user: { select: { name: true } } } });
  console.log(`  vardiya: ${eskiVardiya ? `${z(eskiVardiya.openedAt)}→${z(eskiVardiya.closedAt)} ${eskiVardiya.status} (${eskiVardiya.user.name})` : sale.shiftId}`);
  console.log(`        →  ${gunVardiya ? `${z(gunVardiya.openedAt)}→${z(gunVardiya.closedAt)} ${gunVardiya.status} (${gunVardiya.user.name})${hedef ? '' : '  [saat vardiya dışında; o günün vardiyası seçildi]'}` : 'YOK'}`);
  const nakit = await prisma.cashMovement.findMany({ where: { description: { contains: sale.id } } });
  if (nakit.length) console.log(`  nakit hareketi: ${nakit.length} adet, toplam ${tl(nakit.reduce((s, c) => s + Number(c.amount), 0))}`);

  const faturalar = await prisma.fatura.findMany({ where: { satisId: sale.id } });
  const gonderilmis = faturalar.filter((f) => f.durum === 'GONDERILDI');
  console.log(`  e-fatura: ${faturalar.length ? faturalar.map((f) => `${f.faturaNo} ${f.profileId} ${f.durum}`).join(', ') : 'yok'} | sale.eFaturaDurum=${sale.eFaturaDurum ?? '—'}`);

  let so: any = null, picks: any[] = [], invs: any[] = [];
  if (sale.odooSaleOrderId) {
    so = ((await execute('sale.order', 'read', [[sale.odooSaleOrderId]], { fields: ['name', 'date_order', 'state', 'picking_ids', 'invoice_ids'], context: CTX })) as any[])[0];
    if (so?.picking_ids?.length) picks = (await execute('stock.picking', 'read', [so.picking_ids], { fields: ['name', 'state', 'date_done', 'move_ids'], context: CTX })) as any[];
    if (so?.invoice_ids?.length) invs = (await execute('account.move', 'read', [so.invoice_ids], { fields: ['name', 'state', 'invoice_date'], context: CTX })) as any[];
    console.log(`  Odoo sipariş ${so?.name} date_order ${so?.date_order} (UTC)${ODOO ? ` → ${odooTarih(yeni)}` : '  [--odoo verilmedi, değişmeyecek]'}`);
    for (const p of picks) console.log(`  Odoo teslimat ${p.name} ${p.state} date_done ${p.date_done || '—'}${ODOO && p.state === 'done' ? ` → ${odooTarih(yeni)}` : ''}`);
    for (const f of invs) console.log(`  Odoo fatura ${f.name} ${f.state} tarih ${f.invoice_date}  [DEĞİŞMEZ]`);
  } else console.log('  Odoo siparişi yok');

  const engel: string[] = [];
  if (!gunVardiya) engel.push(`${sube?.code} şubesinde ${tarih} tarihinde vardiya yok`);
  if (gunVardiya && gunVardiya.status !== 'OPEN' && !bayrak('--kapali-vardiya')) engel.push(`${tarih} vardiyası KAPANMIŞ — o günün kasa raporu değişecek (onaylıyorsanız --kapali-vardiya ekleyin)`);
  if (gonderilmis.length && !bayrak('--faturali-dahil')) engel.push(`e-fatura GİB'e gönderilmiş (${gonderilmis.map((f) => f.faturaNo).join(', ')}) — belge tarihi değişemez; yine de POS tarihini değiştirmek için --faturali-dahil`);
  if (engel.length) { console.log('\n⚠️ DURDU:\n  - ' + engel.join('\n  - ')); return; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için aynı komutun sonuna --uygula ekleyin.'); return; }

  await prisma.$transaction([
    prisma.sale.update({ where: { id: sale.id }, data: { createdAt: yeni, shiftId: gunVardiya!.id } }),
    ...sale.payments.map((p) => prisma.payment.update({ where: { id: p.id }, data: { createdAt: new Date(+p.createdAt + fark) } })),
    ...nakit.map((c) => prisma.cashMovement.update({ where: { id: c.id }, data: { createdAt: new Date(+c.createdAt + fark), shiftId: gunVardiya!.id } })),
  ]);
  console.log('✓ POS tarihi ve vardiyası güncellendi');
  if (ODOO && so) {
    await execute('sale.order', 'write', [[so.id], { date_order: odooTarih(yeni) }], { context: CTX });
    for (const p of picks.filter((x) => x.state === 'done')) {
      await execute('stock.picking', 'write', [[p.id], { date_done: odooTarih(yeni) }], { context: CTX });
      if (p.move_ids?.length) {
        await execute('stock.move', 'write', [p.move_ids, { date: odooTarih(yeni) }], { context: CTX });
        const ml = (await execute('stock.move.line', 'search', [[['move_id', 'in', p.move_ids]]], { context: CTX })) as number[];
        if (ml.length) await execute('stock.move.line', 'write', [ml, { date: odooTarih(yeni) }], { context: CTX });
      }
    }
    console.log('✓ Odoo sipariş ve teslimat tarihi güncellendi (fatura tarihi değişmedi)');
  }
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
