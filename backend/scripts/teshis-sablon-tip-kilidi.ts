/**
 * Salt-okunur teşhis scripti — belirtilen product.template'in neden
 * type/tracking değiştirilemediğini (Odoo "stok hareketlerinde ayrılmış"
 * hatası) gösterir: hangi stock.move / stock.move.line kayıtları hangi
 * durumda (state) bu ürüne bağlı. Hiçbir şeyi DEĞİŞTİRMEZ.
 *
 * Kullanım:
 *   cd backend
 *   npm run teshis-sablon-tip-kilidi -- --tmpl=3816
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const tmplArg = process.argv.find((a) => a.startsWith('--tmpl='));
  const tmpl = tmplArg ? Number(tmplArg.split('=')[1]) : null;
  return { tmpl };
}

async function main() {
  const { tmpl } = parseArgs();
  if (!tmpl) {
    console.log('Kullanım: npm run teshis-sablon-tip-kilidi -- --tmpl=3816');
    process.exit(1);
  }

  const tmplData = (await execute(
    'product.template', 'read',
    [[tmpl]],
    { fields: ['id', 'name', 'type', 'tracking', 'active'], context: { active_test: false } },
  )) as { id: number; name: string; type: string; tracking: string; active: boolean }[];
  console.log('ŞABLON:', JSON.stringify(tmplData[0]));

  const variants = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmpl]]],
    { fields: ['id', 'barcode', 'active'], context: { active_test: false } },
  )) as { id: number; barcode: string | false; active: boolean }[];
  console.log('VARYANTLAR:', JSON.stringify(variants));

  const varyantIds = variants.map((v) => v.id);
  if (!varyantIds.length) {
    console.log('Varyant yok, çıkılıyor.');
    return;
  }

  const moves = (await execute(
    'stock.move', 'search_read',
    [[['product_id', 'in', varyantIds]]],
    { fields: ['id', 'state', 'product_qty', 'location_id', 'location_dest_id', 'create_date', 'picking_id'], limit: 200, context: { active_test: false } },
  )) as Array<{ id: number; state: string; product_qty: number; location_id: [number, string] | false; location_dest_id: [number, string] | false; create_date: string; picking_id: [number, string] | false }>;
  console.log(`\nSTOCK.MOVE toplam: ${moves.length}`);
  const byState: Record<string, number> = {};
  for (const m of moves) byState[m.state] = (byState[m.state] || 0) + 1;
  console.log('Durum dağılımı:', JSON.stringify(byState));
  for (const m of moves.slice(0, 30)) {
    console.log(`  #${m.id} state=${m.state} qty=${m.product_qty} ${m.location_id ? m.location_id[1] : '?'} -> ${m.location_dest_id ? m.location_dest_id[1] : '?'} tarih=${m.create_date} picking=${m.picking_id ? m.picking_id[1] : '-'}`);
  }

  const moveLines = (await execute(
    'stock.move.line', 'search_read',
    [[['product_id', 'in', varyantIds]]],
    { fields: ['id', 'state', 'qty_done', 'reserved_uom_qty', 'picking_id'], limit: 200, context: { active_test: false } },
  )) as Array<{ id: number; state: string; qty_done: number; reserved_uom_qty?: number; picking_id: [number, string] | false }>;
  console.log(`\nSTOCK.MOVE.LINE toplam: ${moveLines.length}`);
  const byStateLine: Record<string, number> = {};
  for (const l of moveLines) byStateLine[l.state] = (byStateLine[l.state] || 0) + 1;
  console.log('Durum dağılımı:', JSON.stringify(byStateLine));

  const quants = (await execute(
    'stock.quant', 'search_read',
    [[['product_id', 'in', varyantIds]]],
    { fields: ['id', 'quantity', 'reserved_quantity', 'location_id'], limit: 50, context: { active_test: false } },
  )) as Array<{ id: number; quantity: number; reserved_quantity: number; location_id: [number, string] | false }>;
  console.log(`\nSTOCK.QUANT toplam: ${quants.length}`);
  for (const q of quants) {
    console.log(`  #${q.id} qty=${q.quantity} reserved=${q.reserved_quantity} loc=${q.location_id ? q.location_id[1] : '?'}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
