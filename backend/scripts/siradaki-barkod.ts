/**
 * 23.10.2026 — Kendi barkod serimizde (08680000001xxx) Odoo'da KULLANILMIŞ en
 * yüksek numarayı bulur ve sıradaki boş numaraları listeler. SALT OKUNUR.
 *
 * Neden: Bu seri TEK ortak sayaç — hem envanter Excel'lerine elle verilen
 * barkodlar, hem cam envanter importunun otomatik temsilci barkodları
 * (product.product.barcode) hem de UTS'siz lot barkodları (stock.lot.ref)
 * aynı seriden gidiyor (bkz. cam-envanter-import-uygula.service.ts
 * generateNextTemsilciBarkod). Excel'e elle barkod yazmadan önce bu çalıştırılmalı.
 *
 * Kullanım:
 *   npm run siradaki-barkod            (sıradaki 10 numara)
 *   npm run siradaki-barkod -- 25      (sıradaki 25 numara)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { CAM_TEMSILCI_BARKOD_ONEKI } from '../src/modules/admin/cam-envanter-import.constants';

async function main() {
  const adet = Number(process.argv[2] || 10);
  const onek = CAM_TEMSILCI_BARKOD_ONEKI;
  const ctx = { active_test: false, allowed_company_ids: [1, 2, 3, 4] };
  const [urunler, lotlar] = await Promise.all([
    execute('product.product', 'search_read', [[['barcode', 'like', onek]]], { fields: ['barcode', 'display_name'], limit: 0, context: ctx }) as Promise<any[]>,
    execute('stock.lot', 'search_read', [[['ref', 'like', onek]]], { fields: ['ref', 'name'], limit: 0, context: ctx }) as Promise<any[]>,
  ]);

  const kullanilan = new Map<number, string>();
  for (const p of urunler) {
    const bc = String(p.barcode || '').trim();
    if (bc.startsWith(onek)) kullanilan.set(Number(bc.slice(onek.length)), `ürün: ${p.display_name}`);
  }
  for (const l of lotlar) {
    const bc = String(l.ref || '').trim();
    if (bc.startsWith(onek) && !kullanilan.has(Number(bc.slice(onek.length)))) kullanilan.set(Number(bc.slice(onek.length)), `lot: ${l.name}`);
  }
  const numaralar = [...kullanilan.keys()].filter(Number.isFinite).sort((a, b) => a - b);
  const max = numaralar.length ? numaralar[numaralar.length - 1] : 0;
  const pad = (n: number) => `${onek}${String(n).padStart(3, '0')}`;

  console.log(`Önek: ${onek}  |  Odoo'da kullanılan: ${numaralar.length} adet (ürün ${urunler.length}, lot ${lotlar.length})`);
  console.log('Son kullanılan 5:');
  for (const n of numaralar.slice(-5)) console.log(`   ${pad(n)}  ${kullanilan.get(n)}`);
  console.log(`\nSıradaki ${adet} boş numara:`);
  for (let i = 1; i <= adet; i++) console.log(`   ${pad(max + i)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
