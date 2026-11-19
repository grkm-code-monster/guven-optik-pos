/**
 * 19.11.2026 — Geçmiş POS tahsilatlarını FATURANIN ŞİRKETİNE taşı (muhasebe kararı: A yöntemi)
 *
 * GÜVEN OPTİK 1959'da açılmış ama faturaya bağlanamamış POS tahsilatları ("POS <TÜR> - <satış>",
 * onaylı, mutabakatsız) için:
 *   1) faturanın şirketinde (GVN2 → NG, GVN1/3/6/9 → ADESE) AYNI ad'lı yevmiyede, AYNI tarih/tutar/
 *      cari/ref ile yeni tahsilat açılır ve onaylanır,
 *   2) faturaya bağlanır; bağlanamazsa YENİ tahsilat iptal edilir, eskisi olduğu gibi kalır,
 *   3) bağlandıysa 1959'daki eski tahsilat taslağa alınıp İPTAL edilir.
 * Fatura 1959'daysa sadece bağlama denenir (taşıma yok).
 *
 * --test-iptal : POS'ta karşılığı olmayan (silinmiş test satışı) tahsilatları sadece İPTAL eder.
 *
 * GÜVENLİK: varsayılan KURU. --confirm ile uygular. Önce Odoo yedeği alın. Her işlem
 * /root/odoo-tahsilat-tasi-<zaman>.json'a yazılır (eski id → yeni id → fatura).
 * Seçenekler: --sube=GVN2  --limit=10
 *
 *   npx ts-node --transpile-only scripts/odoo-tahsilat-sirket-tasi.ts [--sube=GVN2] [--limit=10] [--confirm]
 *   npx ts-node --transpile-only scripts/odoo-tahsilat-sirket-tasi.ts --test-iptal [--confirm]
 */
import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { odooTahsilatiFaturayaBagla, odooTahsilatOlustur } from '../src/modules/odoo/odoo-tahsilat';

const confirm = process.argv.includes('--confirm');
const testIptal = process.argv.includes('--test-iptal');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const SUBE = arg('sube')?.toUpperCase();
const LIMIT = Number(arg('limit') ?? 0) || 0;
const TUM = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const tl = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Odeme = { id: number; name: string; ref: string; amount: number; date: string; partner_id: [number, string] | false; journal_id: [number, string]; company_id: [number, string] };

async function islem(method: string, id: number) {
  try {
    await execute('account.payment', method, [[id]], TUM);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/marshal None/i.test(msg)) throw e;
  }
  const [r] = (await execute('account.payment', 'read', [[id]], { fields: ['state'], ...TUM })) as Array<{ state: string }>;
  return r?.state;
}

async function iptal(id: number) {
  const d = await islem('action_draft', id);
  if (d !== 'draft') throw new Error(`#${id} taslağa alınamadı (${d})`);
  const c = await islem('action_cancel', id);
  if (c !== 'cancel') throw new Error(`#${id} iptal edilemedi (${c})`);
}

const yevCache = new Map<string, number | null>();
async function yevmiye(companyId: number, ad: string): Promise<number | null> {
  const k = `${companyId}|${ad}`;
  if (!yevCache.has(k)) {
    const r = (await execute('account.journal', 'search_read', [[['company_id', '=', companyId], ['name', '=', ad], ['type', 'in', ['cash', 'bank']]]], { fields: ['id'], limit: 1, ...TUM })) as Array<{ id: number }>;
    yevCache.set(k, r[0]?.id ?? null);
  }
  return yevCache.get(k) ?? null;
}

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const odemeler = (await execute('account.payment', 'search_read', [[['ref', '=like', 'POS %'], ['state', '=', 'posted'], ['payment_type', '=', 'inbound'], ['is_reconciled', '=', false], ['company_id', '=', 1]]], {
    fields: ['id', 'name', 'ref', 'amount', 'date', 'partner_id', 'journal_id', 'company_id'],
    order: 'date asc, id asc',
    ...TUM,
  })) as Odeme[];
  const saleIdOf = (o: Odeme) => String(o.ref).split(' - ').pop()!.trim();
  const sales = await prisma.sale.findMany({ where: { id: { in: [...new Set(odemeler.map(saleIdOf))] } }, select: { id: true, referansNo: true, branchId: true, odooSaleOrderId: true } });
  const sMap = new Map(sales.map((s) => [s.id, s]));
  const subeler = new Map((await prisma.branch.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const kayit: Array<Record<string, unknown>> = [];
  const dosya = `/root/odoo-tahsilat-tasi-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const yaz = () => confirm && fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));

  if (testIptal) {
    const test = odemeler.filter((o) => !sMap.has(saleIdOf(o)));
    console.log(`\nPOS'ta karşılığı olmayan (test) tahsilat: ${test.length} — toplam ${tl(test.reduce((a, o) => a + o.amount, 0))} TL`);
    for (const o of test) {
      console.log(`  #${o.id} ${o.name} | ${o.date} | ${tl(o.amount)} | ${o.journal_id[1]} | ${o.partner_id ? o.partner_id[1] : '—'} → İPTAL`);
      if (confirm) {
        await iptal(o.id);
        kayit.push({ islem: 'TEST_IPTAL', odeme: o.id, tutar: o.amount });
        yaz();
      }
    }
    if (!confirm) console.log('\n--- KURU --- Uygulamak için --confirm ekleyin.');
    else console.log(`\n✓ ${test.length} test tahsilatı iptal edildi. Kayıt: ${dosya}`);
    await prisma.$disconnect();
    return;
  }

  // Sipariş → fatura → şirket
  const oids = [...new Set(sales.map((s) => s.odooSaleOrderId).filter(Boolean))] as number[];
  const siparis = oids.length ? ((await execute('sale.order', 'read', [oids], { fields: ['invoice_ids'], ...TUM })) as Array<{ id: number; invoice_ids: number[] }>) : [];
  const invIds = [...new Set(siparis.flatMap((x) => x.invoice_ids))];
  const faturalar = invIds.length
    ? ((await execute('account.move', 'search_read', [[['id', 'in', invIds], ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']]], { fields: ['id', 'name', 'company_id', 'amount_residual'], ...TUM })) as Array<{ id: number; name: string; company_id: [number, string]; amount_residual: number }>)
    : [];
  const fById = new Map(faturalar.map((f) => [f.id, f]));
  const sipFatura = new Map(siparis.map((x) => [x.id, x.invoice_ids.map((i) => fById.get(i)).find(Boolean)]));

  type Plan = { o: Odeme; sube: string; satisNo: string; fatura: { id: number; name: string; company_id: [number, string]; amount_residual: number } | null; hedef: number | null; yev: number | null; not: string };
  const planlar: Plan[] = [];
  for (const o of odemeler) {
    const s = sMap.get(saleIdOf(o));
    if (!s) continue; // test kayıtları --test-iptal ile
    const sube = subeler.get(s.branchId) ?? '?';
    if (SUBE && sube !== SUBE) continue;
    const f = s.odooSaleOrderId ? sipFatura.get(s.odooSaleOrderId) ?? null : null;
    const hedef = f ? f.company_id[0] : null;
    const yev = hedef && hedef !== 1 ? await yevmiye(hedef, o.journal_id[1]) : null;
    let not = '';
    if (!f) not = 'FATURA YOK — atlanır';
    else if (f.amount_residual <= 0.01) not = 'fatura zaten kapalı — atlanır';
    else if (hedef === 1) not = '1959 faturası — sadece bağlanır';
    else if (!yev) not = `şirket ${hedef}'de "${o.journal_id[1]}" yevmiyesi YOK — önce kurulum (atlanır)`;
    planlar.push({ o, sube, satisNo: s.referansNo ?? s.id, fatura: f, hedef, yev, not });
  }
  const isle = planlar.filter((p) => p.fatura && p.fatura.amount_residual > 0.01 && (p.hedef === 1 || p.yev));
  const secilen = LIMIT ? isle.slice(0, LIMIT) : isle;

  const ozet = new Map<string, { n: number; t: number }>();
  for (const p of planlar) {
    const k = `${p.sube} → ${p.fatura ? p.fatura.company_id[1] : '—'} | ${p.not || 'TAŞINACAK + BAĞLANACAK'}`;
    const x = ozet.get(k) ?? { n: 0, t: 0 };
    x.n++;
    x.t += p.o.amount;
    ozet.set(k, x);
  }
  console.log(`\nBağlanmamış POS tahsilatı (1959): ${planlar.length}${SUBE ? ` (şube ${SUBE})` : ''}`);
  for (const [k, x] of [...ozet.entries()].sort()) console.log(`  ${x.n} adet ${tl(x.t)} TL | ${k}`);
  console.log(`\nBu çalıştırmada işlenecek: ${secilen.length}${LIMIT ? ` (limit ${LIMIT})` : ''}`);
  for (const p of secilen.slice(0, 25)) {
    console.log(`  #${p.o.id} ${p.o.name} | ${p.o.date} | ${tl(p.o.amount)} | ${p.o.journal_id[1]} | ${p.satisNo} | fatura ${p.fatura!.name} (kalan ${tl(p.fatura!.amount_residual)}) → ${p.hedef === 1 ? 'bağla' : `${p.fatura!.company_id[1]} yevmiye #${p.yev}`}`);
  }
  if (secilen.length > 25) console.log(`  … (+${secilen.length - 25})`);

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için --confirm ekleyin (önce Odoo yedeği).');
    await prisma.$disconnect();
    return;
  }

  let tasinan = 0;
  let baglanan = 0;
  let hata = 0;
  for (const p of secilen) {
    const f = p.fatura!;
    try {
      if (p.hedef === 1) {
        const r = await odooTahsilatiFaturayaBagla(p.o.id, f.id, 1);
        kayit.push({ islem: 'BAGLA', odeme: p.o.id, fatura: f.id, ok: r.ok, hata: r.hata ?? null });
        if (r.ok) baglanan++;
        else {
          hata++;
          console.log(`  ✗ #${p.o.id} bağlanamadı: ${r.hata}`);
        }
        yaz();
        continue;
      }
      const yeni = await odooTahsilatOlustur({
        companyId: p.hedef!,
        journalId: p.yev!,
        partnerId: p.o.partner_id ? p.o.partner_id[0] : 1,
        amount: p.o.amount,
        ref: p.o.ref,
        date: p.o.date,
      });
      const r = await odooTahsilatiFaturayaBagla(yeni, f.id, p.hedef!);
      if (!r.ok) {
        await iptal(yeni);
        hata++;
        kayit.push({ islem: 'TASI_BASARISIZ', eski: p.o.id, yeniIptal: yeni, fatura: f.id, hata: r.hata ?? null });
        console.log(`  ✗ #${p.o.id}: yeni tahsilat faturaya bağlanamadı (${r.hata}) → yenisi iptal, eskisi duruyor`);
        yaz();
        continue;
      }
      await iptal(p.o.id);
      tasinan++;
      kayit.push({ islem: 'TASINDI', eski: p.o.id, yeni, fatura: f.id, sirket: p.hedef, tutar: p.o.amount, tarih: p.o.date });
      console.log(`  ✓ #${p.o.id} → #${yeni} (${f.company_id[1]}) | ${f.name}`);
      yaz();
    } catch (e) {
      hata++;
      const msg = e instanceof Error ? e.message : String(e);
      kayit.push({ islem: 'HATA', eski: p.o.id, fatura: f.id, hata: msg.slice(0, 300) });
      console.log(`  ✗ #${p.o.id}: ${msg.slice(0, 160)}`);
      yaz();
    }
  }
  yaz();
  console.log(`\nTAMAM — taşınan ${tasinan}, sadece bağlanan ${baglanan}, hatalı ${hata}. Kayıt: ${dosya}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
