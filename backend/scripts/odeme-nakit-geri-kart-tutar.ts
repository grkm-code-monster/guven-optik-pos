/**
 * 18.11.2026 — Sedat Gök (GVNS-20261112-GVN2-00009) düzeltmesinin DÜZELTMESİ.
 *
 * Bugün sabah "500 TL nakit alınmamış" denip scripts/odeme-acik-hesaba-cevir.ts ile o NAKİT ödeme
 * AÇIK HESAP'a çevrilmiş, Odoo'daki "POS CASH - <satış>" ödemesi iptal edilmişti. Doğrusu:
 *   - 12.11.2026'da 500 TL NAKİT gerçekten alınmış  → o ödeme tekrar NAKİT olur (tarih aynı),
 *   - bugün açık hesap tahsilatı olarak kartla 4.500 girilmiş ama 4.000 alınmış (tek çekim,
 *     banka aynı) → KART 4.000 olur, komisyon yeniden hesaplanır.
 * Sonuç: açık hesap 4.000 (12.11) + nakit 500 (12.11) + kart 4.000 (18.11) → açık hesap kalan 0.
 *
 * Odoo (önce yapılır; hata olursa POS'a dokunulmaz):
 *   1) "POS OPEN_ACCOUNT CARD - <satış>" ödemesi taslağa → tutar 4.000 → onay → faturayla eşleştirme
 *   2) iptal edilmiş "POS CASH - <satış>" ödemesi taslağa → onay → faturayla eşleştirme
 *   → fatura yine tamamen ödenmiş olur (4.000 + 500).
 *
 * VARSAYILAN KURU. Kullanım:
 *   npx ts-node --transpile-only scripts/odeme-nakit-geri-kart-tutar.ts --satis GVNS-20261112-GVN2-00009 --kart 4000 [--uygula]
 */
import 'dotenv/config';
import { Prisma, PaymentType } from '@prisma/client';
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
const CEVIRME_IZI = 'CASH olarak yanlış girilmişti, açık hesaba çevrildi';

type OdooOdeme = { id: number; name: string; amount: number; state: string; journal_id: unknown; move_id: [number, string] | false; reconciled_invoice_ids: number[]; date: string };

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

async function odemeOku(ref: string): Promise<OdooOdeme[]> {
  return (await execute('account.payment', 'search_read', [[['ref', '=', ref]]], {
    fields: ['id', 'name', 'amount', 'state', 'journal_id', 'move_id', 'reconciled_invoice_ids', 'date'], ...CTX,
  })) as OdooOdeme[];
}

/** Ödemenin alacak satırını faturanın açık alacak satırıyla eşleştir */
async function faturayaBagla(odemeId: number, faturaIds: number[]) {
  const [pm] = (await execute('account.payment', 'read', [[odemeId]], { fields: ['move_id'], ...CTX })) as { move_id: [number, string] | false }[];
  if (!pm?.move_id || !faturaIds.length) return 'eşleştirilecek fatura yok';
  const fl = (await execute('account.move.line', 'search_read', [[['move_id', 'in', faturaIds], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, ...CTX })) as { id: number }[];
  const pl = (await execute('account.move.line', 'search_read', [[['move_id', '=', pm.move_id[0]], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, ...CTX })) as { id: number }[];
  if (!fl[0] || !pl[0]) return `⚠ eşleştirme satırı yok (fatura ${fl.length}, ödeme ${pl.length})`;
  await execute('account.move.line', 'reconcile', [[fl[0].id, pl[0].id]], CTX);
  return 'faturayla eşleşti';
}

async function main() {
  const ref = d('--satis'), kartStr = d('--kart');
  if (!ref || !kartStr) throw new Error('--satis ve --kart zorunlu');
  const kart = D(kartStr).toDecimalPlaces(2);
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const s = await prisma.sale.findFirst({ where: { OR: [{ referansNo: ref }, { id: ref }] }, include: { payments: { orderBy: { createdAt: 'asc' } }, customer: true } });
  if (!s) { console.log(`⚠️ DURDU: satış bulunamadı (${ref})`); return; }
  console.log(`\nSATIŞ ${s.customer?.name} | ${s.referansNo} | ${z(s.createdAt)} | ${s.status} | net ${s.netTotal}`);
  for (const p of s.payments) console.log(`  ödeme ${p.paymentType} ${p.grossAmount} | ${z(p.createdAt)} | taksit ${p.installment ?? '-'} | komisyon ${p.commissionAmount ?? '-'}${p.aciklama ? ` | ${p.aciklama}` : ''}`);

  const geriNakit = s.payments.filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT && (p.aciklama ?? '').includes(CEVIRME_IZI));
  if (geriNakit.length !== 1) { console.log(`⚠️ DURDU: açık hesaba çevrilmiş tek bir nakit kaydı bekleniyordu (bulunan ${geriNakit.length})`); return; }
  const n = geriNakit[0];
  const kartlar = s.payments.filter((p) => p.paymentType === PaymentType.CARD);
  if (kartlar.length !== 1) { console.log(`⚠️ DURDU: tek bir kart ödemesi bekleniyordu (bulunan ${kartlar.length})`); return; }
  const k = kartlar[0];
  if (!k.bankId) { console.log('⚠️ DURDU: kart ödemesinde banka yok'); return; }
  if (kart.lte(0) || kart.gte(k.grossAmount)) { console.log(`⚠️ DURDU: --kart 0 ile ${k.grossAmount} arasında olmalı`); return; }
  const yeniKom = await calculateCommission(k.bankId, k.installment ?? 1, kart.toString(), k.createdAt);
  const banka = (await prisma.bank.findUnique({ where: { id: k.bankId } }))?.name ?? k.bankId;

  const acik = s.payments.filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT && p.id !== n.id).reduce((a, p) => a.plus(p.grossAmount), D(0));
  const sonraOdenen = s.payments
    .filter((p) => p.paymentType !== PaymentType.OPEN_ACCOUNT && p.id !== k.id && p.id !== n.id)
    .reduce((a, p) => a.plus(p.grossAmount), D(0));
  console.log('\nPOS DEĞİŞİKLİĞİ:');
  console.log(`  1) AÇIK HESAP ${n.grossAmount} (${z(n.createdAt)}) → NAKİT ${n.grossAmount} (tarih aynı) — ${z(n.createdAt).slice(0, 10)} kasası +${n.grossAmount}`);
  console.log(`  2) KART ${k.grossAmount} (${z(k.createdAt)}) → ${kart} | banka ${banka} | taksit ${k.installment ?? 1} | komisyon ${k.commissionAmount} → ${yeniKom.commissionAmount}`);
  console.log(`  Sonuç: açık hesap ${acik} − kart ${kart}${sonraOdenen.gt(0) ? ` − diğer ${sonraOdenen}` : ''} → kalan ${acik.minus(kart).minus(sonraOdenen)} | nakit ${n.grossAmount} + açık hesap ${acik} = ${acik.plus(n.grossAmount)} (satış ${s.netTotal})`);

  const kartOdoo = await odemeOku(`POS OPEN_ACCOUNT CARD - ${s.id}`);
  const nakitOdoo = await odemeOku(`POS CASH - ${s.id}`);
  console.log('\nODOO:');
  for (const o of [...kartOdoo, ...nakitOdoo]) console.log(`  ödeme #${o.id} ${o.name} | ${o.amount} | ${o.state} | ${m2o(o.journal_id)} | fatura ${o.reconciled_invoice_ids.join(',') || '—'} | ${o.date}`);
  const kartPlan = kartOdoo.length === 1 && kartOdoo[0].state === 'posted' && Math.abs(kartOdoo[0].amount - Number(k.grossAmount)) < 0.05 ? kartOdoo[0] : null;
  const nakitPlan = nakitOdoo.length === 1 && nakitOdoo[0].state === 'cancel' && Math.abs(nakitOdoo[0].amount - Number(n.grossAmount)) < 0.05 ? nakitOdoo[0] : null;
  const faturaIds = kartPlan?.reconciled_invoice_ids ?? [];
  if (faturaIds.length) {
    const fat = (await execute('account.move', 'read', [faturaIds], { fields: ['name', 'amount_total', 'amount_residual', 'payment_state'], ...CTX })) as { name: string; amount_total: number; amount_residual: number; payment_state: string }[];
    for (const f of fat) console.log(`  fatura ${f.name} | toplam ${f.amount_total} | kalan ${f.amount_residual} | ${f.payment_state}`);
  }
  console.log(kartPlan ? `  PLAN: kart ödemesi #${kartPlan.id} ${kartPlan.amount} → ${kart}, yeniden onay + faturayla eşleştirme` : '  ⚠️ Kart ödemesi beklenen gibi değil (tek, onaylı, 4500) → Odoo’ya DOKUNULMAYACAK');
  console.log(nakitPlan ? `  PLAN: iptal edilmiş nakit ödemesi #${nakitPlan.id} (${nakitPlan.amount}) yeniden onay + faturayla eşleştirme` : '  ⚠️ İptal edilmiş nakit ödemesi bulunamadı → Odoo’ya DOKUNULMAYACAK');
  if (!kartPlan || !nakitPlan) { console.log('\n⚠️ DURDU: Odoo tarafı beklenen gibi değil — hiçbir şey değiştirilmeyecek, çıktıyı gönderin.'); return; }

  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }

  // 1) Odoo kart: tutar düşür (önce, fatura üzerinde 500 boşalsın)
  const d1 = await islem('action_draft', kartPlan.id);
  if (d1 !== 'draft') throw new Error(`Odoo kart ödemesi #${kartPlan.id} taslağa alınamadı (${d1}) — hiçbir şey değişmedi`);
  await execute('account.payment', 'write', [[kartPlan.id], { amount: Number(kart) }], CTX);
  const d2 = await islem('action_post', kartPlan.id);
  if (d2 !== 'posted') throw new Error(`Odoo kart ödemesi #${kartPlan.id} yeniden onaylanamadı (${d2}) — POS'a dokunulmadı, haber verin`);
  console.log(`✓ Odoo kart ödemesi #${kartPlan.id}: ${kart} | ${await faturayaBagla(kartPlan.id, faturaIds)}`);

  // 2) Odoo nakit: iptalden geri al
  const d3 = await islem('action_draft', nakitPlan.id);
  if (d3 !== 'draft') throw new Error(`Odoo nakit ödemesi #${nakitPlan.id} taslağa alınamadı (${d3}) — kart Odoo'da düzeltildi, POS'a dokunulmadı, haber verin`);
  const d4 = await islem('action_post', nakitPlan.id);
  if (d4 !== 'posted') throw new Error(`Odoo nakit ödemesi #${nakitPlan.id} onaylanamadı (${d4}) — POS'a dokunulmadı, haber verin`);
  console.log(`✓ Odoo nakit ödemesi #${nakitPlan.id}: tekrar onaylandı | ${await faturayaBagla(nakitPlan.id, faturaIds)}`);
  if (faturaIds.length) {
    const fat = (await execute('account.move', 'read', [faturaIds], { fields: ['name', 'amount_residual', 'payment_state'], ...CTX })) as { name: string; amount_residual: number; payment_state: string }[];
    for (const f of fat) console.log(`✓ Odoo fatura ${f.name}: kalan ${f.amount_residual} | ${f.payment_state}`);
  }

  // 3) POS
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: n.id },
      data: { paymentType: PaymentType.CASH, netAmount: n.grossAmount, aciklama: 'Nakit alınmıştı — açık hesaba çevirme geri alındı (script 18.11.2026)' },
    }),
    prisma.payment.update({
      where: { id: k.id },
      data: { grossAmount: kart, commissionRate: D(yeniKom.commissionRate), commissionAmount: D(yeniKom.commissionAmount), netAmount: D(yeniKom.netAmount) },
    }),
    prisma.auditLog.create({
      data: {
        userId: k.createdByUserId ?? s.userId, action: 'ODEME_NAKIT_GERI_KART_TUTAR', entity: 'Sale', entityId: s.id,
        payload: { nakitOdemeId: n.id, nakit: n.grossAmount.toString(), kartOdemeId: k.id, eskiKart: k.grossAmount.toString(), yeniKart: kart.toString(), eskiKomisyon: k.commissionAmount?.toString() ?? null, yeniKomisyon: yeniKom.commissionAmount, odooKart: kartPlan.id, odooNakit: nakitPlan.id, script: true },
      },
    }),
  ]);
  console.log(`✓ POS: nakit ${n.grossAmount} geri geldi, kart ${kart} oldu — açık hesap kalanı ${acik.minus(kart).minus(sonraOdenen)}`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
