/**
 * 18.11.2026 — Satışta yanlışlıkla girilmiş bir tahsilatı (ör. alınmamış NAKİT) AÇIK HESABA çevirir.
 * Ödeme satırı silinmez: türü OPEN_ACCOUNT yapılır (tutar ve tarih aynı kalır) → müşterinin açık
 * hesap kalanı o tutar kadar artar. Satış tutarı, kalemler, KDV, e-fatura DEĞİŞMEZ.
 *
 * Odoo: satış anında bu ödeme Odoo'ya "POS <TÜR> - <satış>" referansıyla gitmiş olur; para hiç
 * alınmadığı için o Odoo ödemesi İPTAL edilir (taslağa al → iptal). Böylece Odoo'daki fatura da
 * o tutar kadar açık kalır ve açık hesap tahsil edilince normal kapanır.
 *
 * Kasa: NAKİT çevriliyorsa o günün (tahsil şubesi) kasa nakdi o tutar kadar azalır.
 *
 * VARSAYILAN KURU. Kullanım:
 *   npx ts-node --transpile-only scripts/odeme-acik-hesaba-cevir.ts --satis GVNS-20261112-GVN2-00009 --tip CASH [--uygula]
 */
import 'dotenv/config';
import { Prisma, PaymentType } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const CTX = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const m2o = (v: unknown) => (Array.isArray(v) ? `${v[1]} (#${v[0]})` : '—');

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
  const ref = d('--satis');
  const tip = (d('--tip') ?? '').toUpperCase() as PaymentType;
  if (!ref || !tip) throw new Error('--satis ve --tip zorunlu (CASH / CARD / TRANSFER)');
  if (!(['CASH', 'CARD', 'TRANSFER'] as string[]).includes(tip)) throw new Error('--tip CASH, CARD ya da TRANSFER olmalı');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const s = await prisma.sale.findFirst({ where: { OR: [{ referansNo: ref }, { id: ref }] }, include: { payments: true, customer: true } });
  if (!s) { console.log(`⚠️ DURDU: satış bulunamadı (${ref})`); return; }
  console.log(`\nSATIŞ ${s.customer?.name} | ${s.referansNo} | ${z(s.createdAt)} | ${s.status} | net ${s.netTotal}`);
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${p.grossAmount} | ${z(p.createdAt)}${p.aciklama ? ` | ${p.aciklama}` : ''}`);
  if (s.status === 'DRAFT' || s.status === 'VOID') { console.log('⚠️ DURDU: satış taslak/iptal'); return; }
  const hedef = s.payments.filter((p) => p.paymentType === tip);
  if (hedef.length !== 1) { console.log(`⚠️ DURDU: satışta tek bir ${tip} ödemesi olmalı (bulunan ${hedef.length})`); return; }
  const p = hedef[0];
  const oaOnce = s.payments.filter((x) => x.paymentType === PaymentType.OPEN_ACCOUNT).reduce((a, x) => a.plus(x.grossAmount), new Prisma.Decimal(0));
  console.log(`\nPOS DEĞİŞİKLİĞİ:`);
  console.log(`  ${tip} ${p.grossAmount} (${z(p.createdAt)}) → AÇIK HESAP ${p.grossAmount} (tarih aynı)`);
  console.log(`  açık hesap toplamı ${oaOnce} → ${oaOnce.plus(p.grossAmount)}`);
  if (tip === 'CASH') console.log(`  ⚠ ${z(p.createdAt).slice(0, 10)} günü kasa nakdi ${p.grossAmount} azalır`);
  console.log('  Satış tutarı / kalemler / KDV / e-fatura: DEĞİŞMEZ');

  const odoo = (await execute('account.payment', 'search_read', [[['ref', '=', `POS ${tip} - ${s.id}`]]], {
    fields: ['id', 'name', 'amount', 'state', 'journal_id', 'reconciled_invoice_ids', 'date'], ...CTX,
  })) as { id: number; name: string; amount: number; state: string; journal_id: unknown; reconciled_invoice_ids: number[]; date: string }[];
  console.log('\nODOO:');
  for (const o of odoo) console.log(`  ödeme #${o.id} ${o.name} | ${o.amount} | ${o.state} | ${m2o(o.journal_id)} | fatura ${o.reconciled_invoice_ids.join(',') || '—'} | ${o.date}`);
  let plan: (typeof odoo)[number] | null = null;
  if (odoo.length === 1 && odoo[0].state === 'posted' && Math.abs(odoo[0].amount - Number(p.grossAmount)) < 0.05) {
    plan = odoo[0];
    console.log(`  PLAN: ödeme #${plan.id} taslağa alınıp İPTAL edilecek (para alınmadı)`);
  } else if (!odoo.length) {
    console.log('  Odoo’da bu ödeme bulunamadı → Odoo’ya dokunulmayacak');
  } else {
    console.log('  ⚠️ Odoo ödemesi beklenen gibi değil (birden fazla / tutar farklı / onaylı değil) → Odoo’ya DOKUNULMAYACAK, haber verin');
  }

  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }

  if (plan) {
    const d1 = await islem('action_draft', plan.id);
    if (d1 !== 'draft') throw new Error(`Odoo ödeme #${plan.id} taslağa alınamadı (durum: ${d1}) — POS'a dokunulmadı`);
    const d2 = await islem('action_cancel', plan.id);
    if (d2 !== 'cancel') throw new Error(`Odoo ödeme #${plan.id} iptal edilemedi (durum: ${d2}) — POS'a dokunulmadı, haber verin`);
    console.log(`✓ Odoo ödeme #${plan.id}: iptal edildi`);
  }
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: p.id },
      data: {
        paymentType: PaymentType.OPEN_ACCOUNT, bankId: null, posDeviceId: null, installment: null,
        commissionRate: null, commissionAmount: null, netAmount: p.grossAmount,
        aciklama: `${tip} olarak yanlış girilmişti, açık hesaba çevrildi (script 18.11.2026)`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: p.createdByUserId ?? s.userId, action: 'ODEME_ACIK_HESABA_CEVIR', entity: 'Sale', entityId: s.id,
        payload: { odemeId: p.id, eskiTip: tip, tutar: p.grossAmount.toString(), odooOdemeId: plan?.id ?? null, script: true },
      },
    }),
  ]);
  console.log(`✓ POS: ${tip} ${p.grossAmount} → açık hesap. Açık hesap toplamı ${oaOnce.plus(p.grossAmount)}`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
