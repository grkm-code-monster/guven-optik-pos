/**
 * 18.11.2026 — SADECE OKUR. "[ESKİ-TİP-KİLİTLİ]" adlı aktif şablonlarda arşivlemeyi engelleyen
 * açık (done/cancel dışı) stok hareketlerini ve bağlı oldukları belgeleri listeler.
 *
 *   cd backend && npx ts-node --transpile-only scripts/eski-tip-acik-hareket.ts
 */
import 'dotenv/config';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const CTX = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
const ad = (v: unknown) => (Array.isArray(v) ? `${v[1]} (#${v[0]})` : '—');

async function main() {
  const tmpl = (await execute('product.template', 'search_read', [[['name', '=like', '[ESKİ-TİP-KİLİTLİ]%'], ['active', '=', true]]], {
    fields: ['id', 'name', 'type'], ...CTX,
  })) as { id: number; name: string; type: string }[];
  console.log(`Aktif eski-tip şablon: ${tmpl.length}`);
  for (const t of tmpl) {
    const v = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', t.id]]], { fields: ['id', 'display_name'], ...CTX })) as { id: number; display_name: string }[];
    const ids = v.map((x) => x.id);
    const quant = (await execute('stock.quant', 'search_read', [[['product_id', 'in', ids], ['location_id.usage', '=', 'internal']]], {
      fields: ['location_id', 'quantity', 'reserved_quantity', 'lot_id'], ...CTX,
    })) as { location_id: unknown; quantity: number; reserved_quantity: number; lot_id: unknown }[];
    const hareket = (await execute('stock.move', 'search_read', [[['product_id', 'in', ids], ['state', 'not in', ['done', 'cancel']]]], {
      fields: ['id', 'reference', 'state', 'picking_id', 'picking_type_id', 'location_id', 'location_dest_id', 'product_uom_qty', 'quantity', 'origin', 'date', 'sale_line_id', 'company_id'],
      ...CTX,
    })) as Record<string, unknown>[];
    console.log(`\n=== #${t.id} ${t.name} (${t.type}) | varyant ${ids.join(',')}`);
    for (const q of quant) console.log(`  stok: ${ad(q.location_id)} adet ${q.quantity} rezerve ${q.reserved_quantity} lot ${ad(q.lot_id)}`);
    if (!quant.length) console.log('  stok: yok');
    for (const h of hareket) {
      console.log(`  HAREKET #${h.id} ${h.reference} | ${h.state} | ${ad(h.picking_type_id)} | ${ad(h.location_id)} → ${ad(h.location_dest_id)} | istenen ${h.product_uom_qty} ayrılan ${h.quantity} | kaynak ${h.origin || '—'} | ${h.date} | ${ad(h.company_id)}`);
      if (Array.isArray(h.picking_id)) {
        const [p] = (await execute('stock.picking', 'read', [[h.picking_id[0]]], { fields: ['name', 'state', 'origin', 'partner_id', 'scheduled_date', 'move_ids'], ...CTX })) as Record<string, unknown>[];
        console.log(`     belge ${p.name} | ${p.state} | kaynak ${p.origin || '—'} | ${ad(p.partner_id)} | ${p.scheduled_date} | belgedeki hareket sayısı ${(p.move_ids as number[]).length}`);
      }
    }
  }
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; });
