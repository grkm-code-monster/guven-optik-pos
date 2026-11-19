/**
 * 19.11.2026 — Bir satışın tarihini (POS + Odoo sipariş/fatura) ve teslim tarihini (POS kalem + Odoo teslimat)
 * geriye/ileriye çeker. Ör: hediye kalemleri sonradan ayrı satışla girildi, asıl satışla aynı güne alınacak.
 *
 *   npx ts-node --transpile-only scripts/satis-tarih-duzelt.ts --satis=GVNS-20261119-GVN2-00012 \
 *        --tarih=2026-11-07T18:25 [--teslim=2026-11-18T14:00] [--confirm]
 * Saatler İstanbul saatidir. Referans numarası değişmez.
 */
import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const CTX = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const confirm = process.argv.includes('--confirm');
const ist = (s: string) => new Date(`${s.length === 16 ? `${s}:00` : s}+03:00`);
const odooTarih = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19); // UTC
const odooGun = (d: Date) => new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10);
const z = (d?: Date | null) => (d ? d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }).slice(0, 16) : '—');
async function sessiz(model: string, method: string, ids: number[], companyId: number) {
  try { await execute(model, method, [ids], CTX, companyId); } catch (e) { if (!/marshal None/i.test(e instanceof Error ? e.message : String(e))) throw e; }
}

async function main() {
  const ref = arg('satis');
  const tarihS = arg('tarih');
  const teslimS = arg('teslim');
  if (!ref || !tarihS) throw new Error('--satis ve --tarih zorunlu');
  const tarih = ist(tarihS);
  const teslim = teslimS ? ist(teslimS) : null;
  if (Number.isNaN(tarih.getTime()) || (teslim && Number.isNaN(teslim.getTime()))) throw new Error('Tarih biçimi: 2026-11-07T18:25');
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');

  const s = await prisma.sale.findFirst({ where: { referansNo: ref }, include: { customer: { select: { name: true } }, items: true, payments: true } });
  if (!s) throw new Error(`Satış bulunamadı: ${ref}`);
  console.log(`SATIŞ ${s.referansNo} | ${s.customer?.name} | ${s.status} | tutar ${s.netTotal} | şimdiki tarih ${z(s.createdAt)} → ${z(tarih)}`);
  for (const it of s.items) console.log(`  kalem ${it.status} | ${it.odooProductName} | lot ${it.lotNo ?? '-'} | teslim ${z(it.deliveryDate)}${teslim && it.status === 'DELIVERED' ? ` → ${z(teslim)}` : ''}`);
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${p.grossAmount} | ${z(p.createdAt)} → ${z(tarih)}`);

  let order: any = null;
  let faturalar: any[] = [];
  let teslimatlar: any[] = [];
  if (s.odooSaleOrderId) {
    [order] = (await execute('sale.order', 'read', [[s.odooSaleOrderId]], { fields: ['id', 'name', 'date_order', 'company_id', 'invoice_ids', 'picking_ids'], ...CTX })) as any[];
    console.log(`ODOO SİPARİŞ ${order.name} | ${order.company_id[1]} | ${order.date_order} UTC → ${odooTarih(tarih)} UTC`);
    if (order.invoice_ids.length) faturalar = (await execute('account.move', 'read', [order.invoice_ids], { fields: ['id', 'name', 'state', 'invoice_date', 'amount_total', 'payment_state'], ...CTX })) as any[];
    for (const f of faturalar) console.log(`  FATURA ${f.name} | ${f.state} | ${f.invoice_date} → ${odooGun(tarih)} | ${f.amount_total} TL`);
    if (order.picking_ids.length) teslimatlar = (await execute('stock.picking', 'read', [order.picking_ids], { fields: ['id', 'name', 'state', 'date_done', 'move_ids'], ...CTX })) as any[];
    for (const p of teslimatlar) {
      console.log(`  TESLİMAT ${p.name} | ${p.state} | ${p.date_done || '-'}${teslim && p.state === 'done' ? ` → ${odooTarih(teslim)} UTC` : ''}`);
      const ml = (await execute('stock.move.line', 'search_read', [[['picking_id', '=', p.id]]], { fields: ['product_id', 'lot_id', 'quantity', 'location_id'], ...CTX })) as any[];
      for (const m of ml) console.log(`     ${m.product_id[1]} | lot ${m.lot_id?.[1] ?? '-'} | ${m.quantity} | ${m.location_id[1]}`);
    }
  } else console.log('Odoo siparişi yok');

  if (!confirm) { console.log('\n--- KURU --- Uygulamak için --confirm ekleyin.'); await prisma.$disconnect(); return; }

  const kayit: Record<string, unknown> = { satis: s.id, eskiTarih: s.createdAt, yeniTarih: tarih };
  await prisma.$transaction([
    prisma.sale.update({ where: { id: s.id }, data: { createdAt: tarih } }),
    prisma.payment.updateMany({ where: { saleId: s.id }, data: { createdAt: tarih } }),
    ...(teslim ? [prisma.saleItem.updateMany({ where: { saleId: s.id, status: 'DELIVERED' }, data: { deliveryDate: teslim } })] : []),
  ]);
  console.log('✓ POS tarihleri güncellendi');
  if (order) {
    const cid = order.company_id[0];
    await execute('sale.order', 'write', [[order.id], { date_order: odooTarih(tarih) }], CTX, cid);
    console.log('✓ Odoo sipariş tarihi');
    for (const f of faturalar) {
      try {
        const postedti = f.state === 'posted';
        if (postedti) await sessiz('account.move', 'button_draft', [f.id], cid);
        await execute('account.move', 'write', [[f.id], { invoice_date: odooGun(tarih), date: odooGun(tarih) }], CTX, cid);
        if (postedti) await sessiz('account.move', 'action_post', [f.id], cid);
        console.log(`✓ fatura ${f.name} tarihi`);
      } catch (e) {
        console.log(`⚠️ fatura ${f.name} tarihi değişmedi: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
      }
    }
    if (teslim) {
      for (const p of teslimatlar.filter((x) => x.state === 'done')) {
        await execute('stock.picking', 'write', [[p.id], { date_done: odooTarih(teslim), scheduled_date: odooTarih(teslim) }], CTX, cid);
        if (p.move_ids.length) await execute('stock.move', 'write', [p.move_ids, { date: odooTarih(teslim) }], CTX, cid);
        const mls = (await execute('stock.move.line', 'search', [[['picking_id', '=', p.id]]], CTX, cid)) as number[];
        if (mls.length) await execute('stock.move.line', 'write', [mls, { date: odooTarih(teslim) }], CTX, cid);
        console.log(`✓ teslimat ${p.name} tarihi`);
      }
    }
  }
  const dosya = `/root/satis-tarih-duzelt-${Date.now()}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nTAMAM. Kayıt: ${dosya}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('HATA:', e?.message ?? e); process.exitCode = 1; await prisma.$disconnect(); });
