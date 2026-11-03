/**
 * 03.11.2026 — SADECE OKUR. Tamamlanmamış satış teslimatlarını kalem kalem CSV (;) olarak yazar.
 * Kullanım (Mac'ten, çıktı Masaüstüne):
 *   ssh root@SUNUCU "cd /opt/guven-pos/backend && npx ts-node --transpile-only scripts/teslimat-listesi.ts" > ~/Desktop/teslimat-listesi.csv
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, "'").replace(/[\r\n;]+/g, ' ')}"`;

async function main() {
  const ps = (await execute('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['sale_id', '!=', false], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'name', 'state', 'partner_id', 'location_id', 'company_id', 'move_ids', 'sale_id'], order: 'id' })) as any[];
  const sos = (await execute('sale.order', 'read', [Array.from(new Set(ps.map((p) => p.sale_id[0])))], { fields: ['id', 'name', 'note', 'date_order', 'amount_total', 'invoice_status', 'invoice_ids'] })) as any[];
  const so = new Map(sos.map((s) => [s.id, s]));
  const posIdOf = (s: any) => String(s?.note || '').match(/POS Satış ID:\s*([0-9a-f-]{36})/i)?.[1] ?? null;
  const posIds = sos.map(posIdOf).filter(Boolean) as string[];
  const sales = await prisma.sale.findMany({ where: { id: { in: posIds } }, select: { id: true, status: true, createdAt: true, netTotal: true, branchId: true, items: { select: { odooProductId: true, lotNo: true, qty: true } } } as any }) as any[];
  const sale = new Map(sales.map((s) => [s.id, s]));
  const subeKod = new Map((await prisma.branch.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const moves = (await execute('stock.move', 'read', [ps.flatMap((p) => p.move_ids)], { fields: ['id', 'picking_id', 'product_id', 'product_uom_qty', 'quantity', 'state', 'move_line_ids', 'location_id'] })) as any[];
  const mls = (await execute('stock.move.line', 'read', [moves.flatMap((m) => m.move_line_ids)], { fields: ['id', 'move_id', 'lot_id', 'quantity'] })) as any[];
  const pids = Array.from(new Set(moves.map((m) => m.product_id[0])));
  const prods = new Map(((await execute('product.product', 'read', [pids], { fields: ['id', 'active', 'tracking', 'type', 'categ_id'], context: { active_test: false } })) as any[]).map((p) => [p.id, p]));
  const quants = (await execute('stock.quant', 'search_read', [[['product_id', 'in', pids], ['location_id.usage', '=', 'internal'], ['quantity', '!=', 0]]], { fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'] })) as any[];
  const pById = new Map(ps.map((p) => [p.id, p]));
  const cols = ['teslimat_no', 'belge', 'durum', 'sirket', 'kaynak', 'satis_no', 'satis_tarihi', 'musteri', 'satis_tutari', 'fatura', 'pos_satis_var', 'pos_durum', 'pos_sube', 'urun_id', 'urun', 'kategori', 'tip', 'takip', 'arsivde', 'adet', 'ayrilan', 'ayrilan_lot', 'pos_satilan_lot', 'kaynakta_stok', 'kaynakta_serbest', 'baska_yerde_stok', 'satis_sonrasi_sayim'];
  console.log(cols.join(';'));
  for (const m of moves) {
    const p = pById.get(m.picking_id[0])!; const s = so.get(p.sale_id[0]); const pos = sale.get(posIdOf(s) ?? '');
    const pr = prods.get(m.product_id[0]);
    const lots = mls.filter((l) => l.move_id[0] === m.id).map((l) => l.lot_id ? `${l.lot_id[1]}(${l.quantity})` : `lotsuz(${l.quantity})`).join(' ');
    const posLot = pos?.items.filter((i: any) => Number(i.odooProductId) === m.product_id[0]).map((i: any) => i.lotNo).filter(Boolean).join(' ') ?? '';
    const qHere = quants.filter((x) => x.product_id[0] === m.product_id[0] && x.location_id[0] === m.location_id[0]);
    const qElse = quants.filter((x) => x.product_id[0] === m.product_id[0] && x.location_id[0] !== m.location_id[0] && x.quantity > 0);
    const inv = Number(await execute('stock.move', 'search_count', [[['product_id', '=', m.product_id[0]], ['is_inventory', '=', true], ['state', '=', 'done'], ['date', '>', s.date_order],
      '|', ['location_dest_id', '=', m.location_id[0]], ['location_id', '=', m.location_id[0]]]], {}));
    console.log([p.id, p.name, p.state, p.company_id[1], p.location_id[1], s?.name, s?.date_order, p.partner_id?.[1], s?.amount_total, s?.invoice_status, pos ? 'EVET' : 'HAYIR', pos?.status, subeKod.get(pos?.branchId),
      m.product_id[0], m.product_id[1], pr?.categ_id?.[1], pr?.type, pr?.tracking, pr?.active ? '' : 'ARŞİV', m.product_uom_qty, m.quantity, lots, posLot,
      qHere.reduce((a, x) => a + x.quantity, 0), qHere.reduce((a, x) => a + x.quantity - x.reserved_quantity, 0),
      qElse.map((x) => `${x.location_id[1]}:${x.quantity}`).join(' '), inv ? 'EVET' : ''].map(q).join(';'));
  }
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
