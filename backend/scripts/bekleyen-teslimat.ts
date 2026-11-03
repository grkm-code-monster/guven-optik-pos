/**
 * 03.11.2026 — Tamamlanmamış satış teslimatlarını (NG/OUT…) listeler / tek tek teslim eder.
 * Satış onaylanıp stok teslimatı hata verdiyse (ör. Odoo kapalıyken) teslimat "bekliyor"da kalır.
 *
 * VARSAYILAN: sadece listeler (hiçbir şey yazmaz).
 *   npx ts-node --transpile-only scripts/bekleyen-teslimat.ts              → tüm bekleyen satış teslimatları
 *   npx ts-node --transpile-only scripts/bekleyen-teslimat.ts --picking=427           → o belgenin detayı + stok durumu
 *   npx ts-node --transpile-only scripts/bekleyen-teslimat.ts --picking=427 --confirm → POS'un yaptığı gibi teslim eder
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { validateSalePickingsFromBranch } from '../src/modules/odoo/odoo-delivery.util';

const arg = (a: string) => process.argv.find((x) => x.startsWith(`--${a}=`))?.split('=')[1];
const UYGULA = process.argv.includes('--confirm');

async function main() {
  const P = Number(arg('picking'));
  if (!P) {
    const ps = (await execute('stock.picking', 'search_read',
      [[['picking_type_code', '=', 'outgoing'], ['sale_id', '!=', false], ['state', 'not in', ['done', 'cancel']]]],
      { fields: ['id', 'name', 'state', 'origin', 'location_id', 'scheduled_date', 'company_id'], order: 'id' })) as any[];
    console.log(`Bekleyen satış teslimatı: ${ps.length}`);
    for (const p of ps) console.log(`  #${p.id} ${p.name} [${p.state}] ${p.origin} | ${p.location_id[1]} | ${p.company_id[1]} | ${p.scheduled_date}`);
    console.log('\nDetay için: --picking=<#no>');
    return;
  }
  const p = ((await execute('stock.picking', 'read', [[P]], { fields: ['id', 'name', 'state', 'origin', 'sale_id', 'location_id', 'company_id', 'move_ids'] })) as any[])[0];
  if (!p) throw new Error(`picking #${P} yok`);
  console.log(`${p.name} [${p.state}] satış ${p.origin} | kaynak ${p.location_id[1]} | ${p.company_id[1]}`);
  if (['done', 'cancel'].includes(p.state)) { console.log('Bu belge zaten kapanmış.'); return; }
  const mv = (await execute('stock.move', 'read', [p.move_ids], { fields: ['id', 'product_id', 'product_uom_qty', 'quantity', 'state'] })) as any[];
  let yetersiz = false;
  for (const m of mv) {
    const pr = ((await execute('product.product', 'read', [[m.product_id[0]]], { fields: ['active', 'tracking', 'barcode'], context: { active_test: false } })) as any[])[0];
    const qs = (await execute('stock.quant', 'search_read', [[['product_id', '=', m.product_id[0]], ['location_id', '=', p.location_id[0]], ['quantity', '>', 0]]],
      { fields: ['quantity', 'reserved_quantity', 'lot_id'] })) as any[];
    const mevcut = qs.reduce((a, q) => a + q.quantity - q.reserved_quantity, 0);
    console.log(`  • ${m.product_id[1]} (#${m.product_id[0]}${pr.active ? '' : ', ARŞİVDE'}, takip ${pr.tracking}, barkod ${pr.barcode || '-'}) istenen ${m.product_uom_qty}, ayrılmış ${m.quantity} [${m.state}]`);
    console.log(`      ${p.location_id[1]} serbest stok: ${mevcut}${qs.length ? ' → ' + qs.map((q) => `${q.lot_id ? q.lot_id[1] : 'lotsuz'}:${q.quantity}${q.reserved_quantity ? `(ayrılmış ${q.reserved_quantity})` : ''}`).join(', ') : ''}`);
    if (mevcut + m.quantity < m.product_uom_qty) yetersiz = true;
  }
  if (yetersiz) { console.log('\nDURDU: kaynak lokasyonda yeterli stok yok — ürün bu şubede sayılmamış ya da başka varyantta. Elle bakılmalı.'); return; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — stok yeterli, teslim edilebilir. Uygulamak için --confirm ekleyin.'); return; }
  const r = await validateSalePickingsFromBranch(p.sale_id[0], p.location_id[0], p.company_id[0]);
  const son = ((await execute('stock.picking', 'read', [[P]], { fields: ['state'] })) as any[])[0];
  console.log(r.ok ? `✓ teslim edildi, durum: ${son.state}` : `HATA: ${r.errors.join('; ')} (durum: ${son.state})`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exit(1); });
