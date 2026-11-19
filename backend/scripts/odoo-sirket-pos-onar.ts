/**
 * 19.11.2026 — NG / ADESE / POTENTIAL muhasebe kurulumunu tamamla (taşıma denemesi
 * "Missing required account on accountable line" ile durdu).
 *
 * Bu şirketlerde hesap planı elle kurulduğu için şunlar boş olabilir:
 *   a) carilerin şirket varsayılan alacak / borç hesabı (ir.property: property_account_receivable_id
 *      → 120 Alıcılar, property_account_payable_id → 320 Satıcılar)
 *   b) POS yevmiyelerinin ödeme yöntemi satırlarında ara hesap (gelen → 102997, giden → 102998)
 * Ayrıca başarısız denemeden TASLAK kalmış "POS …" tahsilatı varsa listelenir/silinir (taslak = kayıtsız).
 *
 * Varsayılan KURU; --confirm ile uygular. Yapılanlar /root/odoo-sirket-pos-onar-<zaman>.json'a yazılır.
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const confirm = process.argv.includes('--confirm');
const TUM = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const sc = (c: number) => ({ context: { allowed_company_ids: [c], company_id: c } });
const m = (v: unknown) => (Array.isArray(v) ? `${v[1]}#${v[0]}` : '—');
const POS_YEVMIYE = ['POS Nakit', 'POS Kart', 'POS Havale', 'SGK', 'Vakıf'];

async function hesap(c: number, code: string): Promise<number | null> {
  const r = (await execute('account.account', 'search_read', [[['company_id', '=', c], ['code', '=', code]]], { fields: ['id'], limit: 1, ...TUM })) as Array<{ id: number }>;
  return r[0]?.id ?? null;
}

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const kayit: Array<Record<string, unknown>> = [];
  const alanlar = (await execute('ir.model.fields', 'search_read', [[['model', '=', 'res.partner'], ['name', 'in', ['property_account_receivable_id', 'property_account_payable_id']]]], { fields: ['id', 'name'], ...TUM })) as Array<{ id: number; name: string }>;
  const alanId = new Map(alanlar.map((a) => [a.name, a.id]));

  for (const c of [2, 3, 4]) {
    const [s] = (await execute('res.company', 'read', [[c]], { fields: ['name'], ...TUM })) as Array<{ name: string }>;
    console.log(`\n=== ŞİRKET ${c} ${s?.name}`);
    const h120 = await hesap(c, '120');
    const h320 = await hesap(c, '320');
    const h102997 = await hesap(c, '102997');
    const h102998 = await hesap(c, '102998');
    console.log(`  hesaplar: 120#${h120} 320#${h320} 102997#${h102997} 102998#${h102998}`);

    // a) şirket varsayılan alacak/borç hesabı
    for (const [alan, hid] of [['property_account_receivable_id', h120], ['property_account_payable_id', h320]] as const) {
      const fid = alanId.get(alan);
      if (!fid || !hid) {
        console.log(`  ⚠ ${alan}: alan ya da hesap yok — atlandı`);
        continue;
      }
      const mevcut = (await execute('ir.property', 'search_read', [[['fields_id', '=', fid], ['company_id', '=', c], ['res_id', '=', false]]], { fields: ['id', 'value_reference'], ...TUM })) as Array<{ id: number; value_reference: string | false }>;
      const hedef = `account.account,${hid}`;
      if (mevcut[0]?.value_reference === hedef) {
        console.log(`  ${alan}: zaten ${hedef}`);
        continue;
      }
      console.log(`  ${mevcut[0] ? `DÜZELTİLECEK (${mevcut[0].value_reference || 'boş'})` : 'AÇILACAK'} varsayılan ${alan} → ${alan.includes('receivable') ? '120 Alıcılar' : '320 Satıcılar'}`);
      if (confirm) {
        if (mevcut[0]) await execute('ir.property', 'write', [[mevcut[0].id], { value_reference: hedef }], sc(c));
        else await execute('ir.property', 'create', [{ name: alan, fields_id: fid, company_id: c, value_reference: hedef, type: 'many2one' }], sc(c));
        kayit.push({ sirket: c, islem: 'VARSAYILAN_HESAP', alan, hedef, eski: mevcut[0]?.value_reference ?? null });
      }
    }

    // b) POS yevmiyelerinin ödeme yöntemi satırları
    const yev = (await execute('account.journal', 'search_read', [[['company_id', '=', c], ['name', 'in', POS_YEVMIYE]]], { fields: ['id', 'name', 'inbound_payment_method_line_ids', 'outbound_payment_method_line_ids'], ...TUM })) as Array<{ id: number; name: string; inbound_payment_method_line_ids: number[]; outbound_payment_method_line_ids: number[] }>;
    for (const y of yev) {
      const satirlar = (await execute('account.payment.method.line', 'read', [[...y.inbound_payment_method_line_ids, ...y.outbound_payment_method_line_ids]], { fields: ['id', 'name', 'payment_type', 'payment_account_id'], ...TUM })) as Array<{ id: number; name: string; payment_type: string; payment_account_id: [number, string] | false }>;
      for (const l of satirlar) {
        const hedef = l.payment_type === 'inbound' ? h102997 : h102998;
        if (!hedef || (l.payment_account_id && l.payment_account_id[0] === hedef)) {
          console.log(`  yevmiye ${y.name} / ${l.payment_type} ${l.name}: ${m(l.payment_account_id)}`);
          continue;
        }
        console.log(`  AYARLANACAK yevmiye ${y.name} / ${l.payment_type} ${l.name}: ${m(l.payment_account_id)} → ${l.payment_type === 'inbound' ? '102997' : '102998'}`);
        if (confirm) {
          await execute('account.payment.method.line', 'write', [[l.id], { payment_account_id: hedef }], sc(c));
          kayit.push({ sirket: c, islem: 'ODEME_YONTEMI_HESABI', satir: l.id, yevmiye: y.id, eski: l.payment_account_id ? l.payment_account_id[0] : null, yeni: hedef });
        }
      }
    }

    // c) başarısız denemeden kalan taslaklar
    const taslak = (await execute('account.payment', 'search_read', [[['company_id', '=', c], ['state', '=', 'draft'], ['ref', '=like', 'POS %']]], { fields: ['id', 'name', 'ref', 'amount'], ...TUM })) as Array<{ id: number; name: string; ref: string; amount: number }>;
    for (const t of taslak) {
      console.log(`  SİLİNECEK taslak tahsilat #${t.id} ${t.name} ${t.amount} | ${t.ref}`);
      if (confirm) {
        await execute('account.payment', 'unlink', [[t.id]], sc(c));
        kayit.push({ sirket: c, islem: 'TASLAK_SILINDI', odeme: t.id, ref: t.ref, tutar: t.amount });
      }
    }
    if (!taslak.length) console.log('  taslak tahsilat yok');
  }

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için --confirm ekleyin.');
    return;
  }
  const dosya = `/root/odoo-sirket-pos-onar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nKayıt dosyası: ${dosya}\nTAMAM`);
}

main().catch((e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
});
