/**
 * 17.11.2026 — Yanlış girilmiş tek KART ödemesini ikiye böler: girilen tutar KART (banka/taksit/komisyon
 * yeniden hesaplanır) + kalanı AÇIK HESAP. Satış tutarı, kalemler, KDV ve fatura DEĞİŞMEZ.
 *
 * Odoo: satış anında kart ödemesi Odoo'ya tam tutarla gitmiş ve faturayı kapatmış olur. Böyle kalırsa
 * müşteri ileride açık hesabı ödediğinde Odoo'da "açık fatura yok" hatası çıkar. Bu yüzden Odoo'daki
 * "POS CARD - <satış>" ödemesi taslağa alınır, tutarı kart tutarına indirilir, yeniden onaylanır ve
 * faturayla yeniden eşleştirilir → fatura kalan tutar kadar AÇIK kalır (açık hesap ödemeleri bunu kapatır).
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/odeme-kart-acik-hesap-bol.ts --satis GVNS-20261105-GVN2-00006 --kart 6000 --banka teb --taksit 3 [--pos X] [--uygula]
 */
import 'dotenv/config';
import { Prisma, PaymentType, SaleStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { calculateCommission } from '../src/modules/payments/commission.service';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const CTX = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const m2o = (v: unknown) => (Array.isArray(v) ? `${v[1]} (#${v[0]})` : '—');

/** action_draft / action_post None döner; XML-RPC "cannot marshal None" hatası işlem yapıldıktan sonra gelir → yut, sonra durumu oku */
async function islem(method: string, id: number) {
  try {
    await execute('account.payment', method, [[id]], CTX);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!/marshal None/i.test(m)) throw e;
  }
  const [r] = (await execute('account.payment', 'read', [[id]], { fields: ['state'], ...CTX })) as { state: string }[];
  return r.state;
}

async function main() {
  const ref = d('--satis'), kartStr = d('--kart'), bankaAdi = d('--banka'), posAdi = d('--pos');
  if (!ref || !kartStr || !bankaAdi) throw new Error('--satis, --kart ve --banka zorunlu');
  const kart = D(kartStr).toDecimalPlaces(2);
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const s = await prisma.sale.findFirst({ where: { OR: [{ referansNo: ref }, { id: ref }] }, include: { payments: true, customer: true } });
  if (!s) { console.log(`⚠️ DURDU: satış bulunamadı (${ref})`); return; }
  console.log(`\nSATIŞ ${s.customer?.name} | ${s.referansNo} | ${z(s.createdAt)} | ${s.status} | net ${s.netTotal}`);
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${p.grossAmount} | ${z(p.createdAt)} | taksit ${p.installment ?? '-'} | komisyon ${p.commissionAmount ?? '-'}`);

  if (s.status !== SaleStatus.PAID) { console.log('⚠️ DURDU: satış PAID değil'); return; }
  if (s.payments.length !== 1 || s.payments[0].paymentType !== PaymentType.CARD) {
    console.log('⚠️ DURDU: satışta tek bir KART ödemesi olmalı (başka ödeme var ya da kart yok)'); return;
  }
  const p = s.payments[0];
  if (D(p.grossAmount).minus(s.netTotal).abs().gt(0.05)) { console.log('⚠️ DURDU: kart ödemesi satış tutarına eşit değil'); return; }
  if (kart.lte(0) || kart.gte(p.grossAmount)) { console.log(`⚠️ DURDU: --kart 0 ile ${p.grossAmount} arasında olmalı`); return; }
  const acik = D(p.grossAmount).minus(kart);

  const bankalar = await prisma.bank.findMany({ where: { name: { contains: bankaAdi, mode: 'insensitive' } } });
  if (bankalar.length !== 1) {
    const tum = await prisma.bank.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    console.log(`⚠️ DURDU: "${bankaAdi}" ile ${bankalar.length} banka eşleşti. Bankalar: ${tum.map((b) => b.name).join(', ')}`); return;
  }
  const banka = bankalar[0];
  const taksit = Number(d('--taksit') ?? p.installment ?? 1);
  const sube = p.tahsilatBranchId ?? s.branchId;
  const poslar = await prisma.posDevice.findMany({
    where: { bankId: banka.id, isActive: true, ...(posAdi ? { name: { contains: posAdi, mode: 'insensitive' } } : { branchId: sube }) },
  });
  if (poslar.length > 1) { console.log(`⚠️ DURDU: ${poslar.length} POS eşleşti (${poslar.map((x) => x.name).join(', ')}) — --pos ile seçin`); return; }
  const pos = poslar[0] ?? null;
  const eskiBanka = p.bankId ? (await prisma.bank.findUnique({ where: { id: p.bankId } }))?.name : '—';
  const k = await calculateCommission(banka.id, taksit, kart.toString(), p.createdAt);

  console.log('\nPOS DEĞİŞİKLİĞİ:');
  console.log(`  KART  ${p.grossAmount} → ${kart} | banka ${eskiBanka} → ${banka.name} | taksit ${p.installment} → ${taksit} | komisyon ${p.commissionAmount} → ${k.commissionAmount} (%${(Number(k.commissionRate) * 100).toFixed(2)}) | POS ${pos?.name ?? '(boş)'}`);
  console.log(`  + AÇIK HESAP ${acik} (tarih ${z(p.createdAt)}) → müşterinin açık hesap kalanı ${acik} olur`);
  console.log('  Satış tutarı / kalemler / KDV / e-fatura: DEĞİŞMEZ');

  // ── Odoo (önce oku) ──
  const odooOdemeler = (await execute('account.payment', 'search_read', [[['ref', '=', `POS CARD - ${s.id}`]]], {
    fields: ['id', 'name', 'amount', 'state', 'journal_id', 'company_id', 'reconciled_invoice_ids', 'date'], ...CTX,
  })) as { id: number; name: string; amount: number; state: string; journal_id: unknown; company_id: unknown; reconciled_invoice_ids: number[]; date: string }[];
  console.log('\nODOO:');
  for (const o of odooOdemeler) console.log(`  ödeme #${o.id} ${o.name} | ${o.amount} | ${o.state} | ${m2o(o.journal_id)} | ${m2o(o.company_id)} | fatura ${o.reconciled_invoice_ids.join(',') || '—'} | ${o.date}`);
  let odooPlan: (typeof odooOdemeler)[number] | null = null;
  if (odooOdemeler.length === 1 && Math.abs(odooOdemeler[0].amount - Number(p.grossAmount)) < 0.05 && odooOdemeler[0].state === 'posted') {
    odooPlan = odooOdemeler[0];
    const fat = odooPlan.reconciled_invoice_ids.length
      ? ((await execute('account.move', 'read', [odooPlan.reconciled_invoice_ids], { fields: ['name', 'amount_total', 'amount_residual', 'payment_state'], ...CTX })) as { name: string; amount_total: number; amount_residual: number; payment_state: string }[])
      : [];
    for (const f of fat) console.log(`  fatura ${f.name} | toplam ${f.amount_total} | kalan ${f.amount_residual} | ${f.payment_state}`);
    console.log(`  PLAN: ödeme #${odooPlan.id} taslağa alınacak → tutar ${odooPlan.amount} → ${kart} → yeniden onay → faturayla eşleştirme (fatura ${acik} açık kalacak)`);
  } else if (odooOdemeler.length === 0) {
    console.log('  Odoo’da bu satışın kart ödemesi bulunamadı → Odoo’ya dokunulmayacak');
  } else {
    console.log('  ⚠️ Odoo ödemesi beklenen gibi değil (birden fazla / tutar farklı / onaylı değil) → Odoo’ya DOKUNULMAYACAK, haber verin');
  }

  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }

  // 1) Odoo (önce; hata olursa POS'a hiç dokunulmaz)
  if (odooPlan) {
    const pid = odooPlan.id;
    const faturaIds = odooPlan.reconciled_invoice_ids;
    const d1 = await islem('action_draft', pid);
    if (d1 !== 'draft') throw new Error(`Odoo ödeme #${pid} taslağa alınamadı (durum: ${d1}) — POS'a dokunulmadı`);
    await execute('account.payment', 'write', [[pid], { amount: Number(kart) }], CTX);
    const d2 = await islem('action_post', pid);
    if (d2 !== 'posted') throw new Error(`Odoo ödeme #${pid} yeniden onaylanamadı (durum: ${d2}, tutar ${kart}) — POS'a dokunulmadı, haber verin`);
    const [pm] = (await execute('account.payment', 'read', [[pid]], { fields: ['move_id', 'amount', 'state'], ...CTX })) as { move_id: [number, string]; amount: number; state: string }[];
    console.log(`✓ Odoo ödeme #${pid}: ${pm.amount} | ${pm.state}`);
    if (faturaIds.length && pm.move_id) {
      const fl = (await execute('account.move.line', 'search_read', [[['move_id', 'in', faturaIds], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, ...CTX })) as { id: number }[];
      const pl = (await execute('account.move.line', 'search_read', [[['move_id', '=', pm.move_id[0]], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, ...CTX })) as { id: number }[];
      if (fl[0] && pl[0]) {
        await execute('account.move.line', 'reconcile', [[fl[0].id, pl[0].id]], CTX);
        const fat = (await execute('account.move', 'read', [faturaIds], { fields: ['name', 'amount_residual', 'payment_state'], ...CTX })) as { name: string; amount_residual: number; payment_state: string }[];
        for (const f of fat) console.log(`✓ Odoo fatura ${f.name}: kalan ${f.amount_residual} | ${f.payment_state}`);
      } else {
        console.log(`⚠️ Odoo eşleştirme satırı bulunamadı (fatura satırı ${fl.length}, ödeme satırı ${pl.length}) — ödeme onaylı ama faturayla eşleşmedi, haber verin`);
      }
    }
  }

  // 2) POS
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: p.id },
      data: {
        grossAmount: kart, bankId: banka.id, posDeviceId: pos?.id ?? null, installment: taksit,
        commissionRate: D(k.commissionRate), commissionAmount: D(k.commissionAmount), netAmount: D(k.netAmount),
      },
    }),
    prisma.payment.create({
      data: {
        saleId: s.id, paymentType: PaymentType.OPEN_ACCOUNT, grossAmount: acik, netAmount: acik,
        createdAt: p.createdAt, createdByUserId: p.createdByUserId ?? null,
        aciklama: `Kart tahsilatı düzeltmesi: ${kart} kart, kalan açık hesap (script 17.11.2026)`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: p.createdByUserId ?? s.userId, action: 'ODEME_KART_ACIK_HESAP_BOL', entity: 'Sale', entityId: s.id,
        payload: { eskiKart: p.grossAmount.toString(), yeniKart: kart.toString(), acikHesap: acik.toString(), eskiBanka, yeniBanka: banka.name, taksit, eskiKomisyon: p.commissionAmount?.toString() ?? null, yeniKomisyon: k.commissionAmount, odooOdemeId: odooPlan?.id ?? null, script: true },
      },
    }),
  ]);
  console.log(`✓ POS: kart ${kart} + açık hesap ${acik} olarak kaydedildi`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
