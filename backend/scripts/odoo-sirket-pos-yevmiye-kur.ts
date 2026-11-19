/**
 * 19.11.2026 — NG / ADESE / POTENTIAL'a POS tahsilat yevmiyelerini kur (Odoo)
 *
 * Bu şirketlerde sadece 6 elle açılmış hesap vardı (100, 120, 153, 320, 600, 620); kasa/banka
 * yevmiyesi yoktu → POS tüm tahsilatları GÜVEN OPTİK 1959'a yazıyordu, faturalara bağlanamıyordu.
 *
 * GÜVEN OPTİK 1959'daki yapının AYNISI (aynı kod/ad) her şirkete açılır:
 *   Hesaplar : 100002 POS Nakit, 102002 POS Kart, 102003 POS Havale, 102004 SGK, 102005 Vakıf,
 *              102997 Non-collected Payments (tahsil edilmemiş), 102998 Unconfirmed Payments,
 *              102999 Bank Temporary Suspended Account (askı), 103001 Likidite Transferi
 *   Şirket   : askı / tahsilat-ara / ödeme-ara / virman hesapları bu hesaplara bağlanır
 *   Yevmiye  : POS Nakit (cash), POS Kart, POS Havale, SGK, Vakıf (bank) — kodları 1959'daki gibi
 * Kod, ad, tür ve mutabakat ayarı 1959'dan OKUNUR (elle yazılmaz). Var olan atlanır.
 *
 * GÜVENLİK: varsayılan KURU. --confirm ile uygular. Açılan kayıt id'leri
 * /root/odoo-sirket-pos-kur-<zaman>.json'a yazılır.
 *
 *   npx ts-node --transpile-only scripts/odoo-sirket-pos-yevmiye-kur.ts            (kuru)
 *   npx ts-node --transpile-only scripts/odoo-sirket-pos-yevmiye-kur.ts --confirm  (uygula)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const KAYNAK = 1;
const HEDEFLER = [2, 3, 4];
const HESAP_KODLARI = ['100002', '102002', '102003', '102004', '102005', '102997', '102998', '102999', '103001'];
const YEVMIYELER = [17, 18, 19, 20, 21]; // 1959: POS Nakit, POS Kart, POS Havale, SGK, Vakıf
const confirm = process.argv.includes('--confirm');
const TUM = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const sc = (c: number) => ({ context: { allowed_company_ids: [c], company_id: c } });
const m = (v: unknown) => (Array.isArray(v) ? `${v[1]}#${v[0]}` : '—');

type Hesap = { id: number; code: string; name: string; account_type: string; reconcile: boolean };
type Yev = { id: number; name: string; code: string; type: string; default_account_id: [number, string] | false; suspense_account_id: [number, string] | false };

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const kHesap = (await execute('account.account', 'search_read', [[['company_id', '=', KAYNAK], ['code', 'in', HESAP_KODLARI]]], { fields: ['id', 'code', 'name', 'account_type', 'reconcile'], ...TUM })) as Hesap[];
  const kHesapById = new Map(kHesap.map((h) => [h.id, h]));
  const kYev = (await execute('account.journal', 'read', [YEVMIYELER], { fields: ['id', 'name', 'code', 'type', 'default_account_id', 'suspense_account_id'], ...TUM })) as Yev[];
  console.log('Kaynak (GÜVEN OPTİK 1959):');
  for (const h of kHesap) console.log(`  hesap ${h.code} ${h.name} (${h.account_type}${h.reconcile ? ', mutabakat' : ''})`);
  for (const y of kYev) console.log(`  yevmiye ${y.code} ${y.name} (${y.type}) → ${m(y.default_account_id)}`);
  if (kHesap.length !== HESAP_KODLARI.length) throw new Error(`1959'da beklenen ${HESAP_KODLARI.length} hesap bulunamadı (${kHesap.length})`);
  const kodById = (id: number | undefined) => (id ? kHesapById.get(id)?.code : undefined);

  const kayit: Record<string, unknown> = { zaman: new Date().toISOString(), sirketler: {} };
  for (const c of HEDEFLER) {
    const [sirket] = (await execute('res.company', 'read', [[c]], { fields: ['name'], ...TUM })) as Array<{ name: string }>;
    console.log(`\n=== ŞİRKET ${c} ${sirket?.name}`);
    const mevcut = (await execute('account.account', 'search_read', [[['company_id', '=', c], ['code', 'in', HESAP_KODLARI]]], { fields: ['id', 'code'], ...TUM })) as Array<{ id: number; code: string }>;
    const hesapId = new Map(mevcut.map((h) => [h.code, h.id]));
    const acilanHesap: number[] = [];
    for (const h of kHesap) {
      if (hesapId.has(h.code)) {
        console.log(`  hesap ${h.code} zaten var`);
        continue;
      }
      console.log(`  AÇILACAK hesap ${h.code} ${h.name} (${h.account_type})`);
      if (confirm) {
        const id = (await execute('account.account', 'create', [{ code: h.code, name: h.name, account_type: h.account_type, reconcile: h.reconcile, company_id: c }], sc(c))) as number;
        hesapId.set(h.code, id);
        acilanHesap.push(id);
      }
    }

    const ayar = {
      account_journal_suspense_account_id: '102999',
      account_journal_payment_debit_account_id: '102997',
      account_journal_payment_credit_account_id: '102998',
      transfer_account_id: '103001',
    } as const;
    console.log(`  ŞİRKET AYARI: askı 102999, tahsilat-ara 102997, ödeme-ara 102998, virman 103001`);
    if (confirm) {
      const vals: Record<string, number> = {};
      for (const [alan, kod] of Object.entries(ayar)) {
        const id = hesapId.get(kod);
        if (id) vals[alan] = id;
      }
      await execute('res.company', 'write', [[c], vals], sc(c));
    }

    const mevcutYev = (await execute('account.journal', 'search_read', [[['company_id', '=', c], ['type', 'in', ['cash', 'bank']]]], { fields: ['id', 'name', 'code'], ...TUM })) as Array<{ id: number; name: string; code: string }>;
    const acilanYev: number[] = [];
    for (const y of kYev) {
      if (mevcutYev.some((x) => x.name === y.name || x.code === y.code)) {
        console.log(`  yevmiye ${y.code} ${y.name} zaten var`);
        continue;
      }
      const varsayilan = kodById(y.default_account_id ? y.default_account_id[0] : undefined);
      console.log(`  AÇILACAK yevmiye ${y.code} ${y.name} (${y.type}) → hesap ${varsayilan}`);
      if (confirm) {
        const vals: Record<string, unknown> = { name: y.name, code: y.code, type: y.type, company_id: c };
        if (varsayilan && hesapId.get(varsayilan)) vals.default_account_id = hesapId.get(varsayilan);
        if (hesapId.get('102999')) vals.suspense_account_id = hesapId.get('102999');
        const id = (await execute('account.journal', 'create', [vals], sc(c))) as number;
        acilanYev.push(id);
      }
    }
    (kayit.sirketler as Record<number, unknown>)[c] = { acilanHesap, acilanYev };
    if (confirm) console.log(`  ✓ açılan hesap ${acilanHesap.length}, yevmiye ${acilanYev.length}`);
  }

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için sonuna --confirm ekle.');
    return;
  }
  const dosya = `/root/odoo-sirket-pos-kur-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nKayıt dosyası: ${dosya}\nTAMAM`);
}

main().catch((e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
});
