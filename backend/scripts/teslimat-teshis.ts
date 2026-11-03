/**
 * 03.11.2026 — SADECE OKUR. Satış teslimatlarının neden tamamlanmadığını teşhis eder.
 *  - button_validate'i sessizce durduran sihirbaz modülleri (stock_sms, product_expiry) kurulu mu, şirket ayarları ne?
 *  - Bekleyen teslimatlarda müşteri telefonu var mı (stock_sms sihirbazı telefonu olan müşteride açılır)?
 *  - POS'ta satılan lot ile Odoo'nun ayırdığı lot aynı mı?
 *  - Satıştan SONRA o ürün/şube için sayım (envanter düzeltmesi) yapılmış mı? (yapılmışsa teslimatı onaylamak stoğu 2. kez düşürür)
 * Kullanım: npx ts-node --transpile-only scripts/teslimat-teshis.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

async function main() {
  const mods = (await execute('ir.module.module', 'search_read', [[['name', 'in', ['stock_sms', 'product_expiry', 'sms', 'stock_picking_batch']]]], { fields: ['name', 'state'] })) as any[];
  console.log('Modüller: ' + mods.map((m) => `${m.name}=${m.state}`).join(' | '));
  const cf = (await execute('res.company', 'fields_get', [], { attributes: ['type'] })) as any;
  const cfields = ['id', 'name', ...['stock_move_sms_validation', 'has_received_warning_stock_sms', 'stock_sms_confirmation_template_id'].filter((f) => cf[f])];
  for (const c of (await execute('res.company', 'search_read', [[]], { fields: cfields })) as any[]) console.log(`  şirket #${c.id} ${c.name}: ` + cfields.slice(2).map((f) => `${f}=${JSON.stringify(c[f])}`).join(' '));

  const ps = (await execute('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['sale_id', '!=', false], ['state', '!=', 'cancel']]],
    { fields: ['id', 'name', 'state', 'origin', 'partner_id', 'location_id', 'scheduled_date', 'date_done', 'move_ids', 'sale_id'], order: 'id' })) as any[];
  const partnerIds = Array.from(new Set(ps.filter((p) => p.partner_id).map((p) => p.partner_id[0])));
  const tel = new Map<number, boolean>();
  for (const r of (await execute('res.partner', 'read', [partnerIds], { fields: ['id', 'phone', 'mobile'] })) as any[]) tel.set(r.id, !!(r.phone || r.mobile));
  const say: Record<string, { tel: number; telsiz: number }> = {};
  for (const p of ps) { const k = p.state; say[k] ??= { tel: 0, telsiz: 0 }; if (p.partner_id && tel.get(p.partner_id[0])) say[k].tel++; else say[k].telsiz++; }
  console.log('\nDurum → müşteri telefonu var / yok:');
  for (const [k, v] of Object.entries(say)) console.log(`  ${k}: telefonlu ${v.tel}, telefonsuz ${v.telsiz}`);
  console.log('Tamamlanan 5 teslimat:');
  for (const p of ps.filter((x) => x.state === 'done')) console.log(`  ${p.name} ${p.origin} müşteri ${p.partner_id?.[1]} tel ${tel.get(p.partner_id?.[0]) ? 'VAR' : 'yok'} bitiş ${p.date_done}`);

  // lot karşılaştırması + satış sonrası sayım
  const bek = ps.filter((p) => !['done', 'cancel'].includes(p.state));
  const moveIds = bek.flatMap((p) => p.move_ids);
  const moves = (await execute('stock.move', 'read', [moveIds], { fields: ['id', 'picking_id', 'product_id', 'product_uom_qty', 'state', 'move_line_ids', 'location_id'] })) as any[];
  const mlIds = moves.flatMap((m) => m.move_line_ids);
  const mls = mlIds.length ? (await execute('stock.move.line', 'read', [mlIds], { fields: ['id', 'move_id', 'lot_id', 'quantity'] })) as any[] : [];
  const pById = new Map(bek.map((p) => [p.id, p]));
  // POS satış kalemleri (note: "POS Satış ID: <uuid>")
  const soIds = Array.from(new Set(bek.map((p) => p.sale_id[0])));
  const sos = (await execute('sale.order', 'read', [soIds], { fields: ['id', 'note', 'date_order'] })) as any[];
  const posId = new Map<number, string>(); const soTarih = new Map<number, string>();
  for (const s of sos) { const m = String(s.note || '').match(/POS Satış ID:\s*([0-9a-f-]{36})/i); if (m) posId.set(s.id, m[1]); soTarih.set(s.id, s.date_order); }
  const items = await prisma.saleItem.findMany({ where: { saleId: { in: Array.from(posId.values()) } }, select: { saleId: true, odooProductId: true, lotNo: true } });
  let ayni = 0, farkli = 0, lotsuzPOS = 0, rezervYok = 0, sayimSonra = 0, sayimYok = 0;
  const ornek: string[] = [];
  for (const m of moves) {
    const p = pById.get(m.picking_id[0])!; const tarih = soTarih.get(p.sale_id[0])!;
    const satilanLot = items.find((i) => i.saleId === posId.get(p.sale_id[0]) && Number(i.odooProductId) === m.product_id[0])?.lotNo || null;
    const ayrilan = mls.filter((l) => l.move_id[0] === m.id && l.lot_id).map((l) => l.lot_id[1]);
    if (!ayrilan.length) rezervYok++; else if (!satilanLot) lotsuzPOS++; else if (ayrilan.includes(satilanLot)) ayni++; else { farkli++; if (ornek.length < 8) ornek.push(`${p.name} ${m.product_id[1]}: satılan ${satilanLot} / ayrılan ${ayrilan.join(',')}`); }
    const inv = Number(await execute('stock.move', 'search_count', [[['product_id', '=', m.product_id[0]], ['is_inventory', '=', true], ['state', '=', 'done'], ['date', '>', tarih],
      '|', ['location_dest_id', '=', m.location_id[0]], ['location_id', '=', m.location_id[0]]]], {}));
    if (inv) sayimSonra++; else sayimYok++;
  }
  console.log(`\nBekleyen ${bek.length} teslimat, ${moves.length} kalem:`);
  console.log(`  Odoo hiç stok ayırmamış: ${rezervYok}`);
  console.log(`  Ayrılan lot = POS'ta satılan lot: ${ayni}`);
  console.log(`  Ayrılan lot ≠ POS'ta satılan lot (YANLIŞ ÜRÜN DÜŞECEK): ${farkli}`);
  console.log(`  POS'ta lot kaydı yok: ${lotsuzPOS}`);
  for (const o of ornek) console.log(`     örn: ${o}`);
  console.log(`  Satıştan SONRA aynı ürün/şubede sayım/düzeltme yapılmış: ${sayimSonra}  | yapılmamış: ${sayimYok}`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
