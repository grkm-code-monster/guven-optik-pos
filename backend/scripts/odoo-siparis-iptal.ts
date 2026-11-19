/**
 * 19.11.2026 — Faturası iptal edilmiş, stoğu iade edilmiş eski Odoo siparişini kilidini açıp iptal eder.
 *   npx ts-node --transpile-only scripts/odoo-siparis-iptal.ts --siparis=S00302 [--confirm]
 * Faturası iptal edilmemiş ya da iadesi yapılmamış teslimatı olan siparişte DURUR.
 */
import 'dotenv/config';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const TUM = { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS], active_test: false };
const ad = process.argv.find((a) => a.startsWith('--siparis='))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const sessiz = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { if (!/marshal None/i.test(String(e))) throw e; } };

async function main() {
  if (!ad) throw new Error('--siparis zorunlu');
  const [o] = (await execute('sale.order', 'search_read', [[['name', '=', ad]]], { fields: ['id', 'name', 'state', 'locked', 'company_id', 'invoice_ids', 'picking_ids'], context: TUM })) as any[];
  if (!o) throw new Error(`${ad} bulunamadı`);
  const c = o.company_id[0];
  console.log(`${o.name} | ${o.state} | kilitli: ${o.locked} | ${o.company_id[1]}`);
  const fat = o.invoice_ids.length ? ((await execute('account.move', 'read', [o.invoice_ids], { fields: ['name', 'state'], context: TUM })) as any[]) : [];
  for (const f of fat) console.log(`   fatura ${f.name} ${f.state}`);
  if (fat.some((f) => f.state !== 'cancel')) throw new Error('İptal edilmemiş fatura var — durduruldu');
  const tes = o.picking_ids.length ? ((await execute('stock.picking', 'read', [o.picking_ids], { fields: ['id', 'name', 'state', 'picking_type_code', 'return_id'], context: TUM })) as any[]) : [];
  for (const p of tes) console.log(`   teslimat ${p.name} ${p.picking_type_code} ${p.state}${p.return_id ? ` (iade: ${p.return_id[1]})` : ''}`);
  const cikis = tes.filter((p) => p.picking_type_code === 'outgoing' && p.state === 'done');
  const iade = tes.filter((p) => p.return_id && p.state === 'done');
  if (cikis.length > iade.length) throw new Error('İadesi yapılmamış teslimat var — durduruldu');
  if (o.state === 'cancel') { console.log('Zaten iptal.'); return; }
  if (!confirm) { console.log('--- KURU --- iptal edilecek. --confirm ile uygula.'); return; }
  const ctx = { context: { allowed_company_ids: [c, ...ODOO_ALL_COMPANY_IDS.filter((x) => x !== c)], disable_cancel_warning: true } };
  if (o.locked) await sessiz(() => execute('sale.order', 'action_unlock', [[o.id]], ctx, c));
  await sessiz(() => execute('sale.order', 'action_cancel', [[o.id]], ctx, c));
  const [son] = (await execute('sale.order', 'read', [[o.id]], { fields: ['state'], context: TUM })) as any[];
  console.log(`✓ ${o.name} durum: ${son.state}`);
}
main().catch((e) => { console.error('HATA:', e?.message ?? e); process.exitCode = 1; });
