/**
 * 03.11.2026 — Stoktan düşmemiş eski satış teslimatlarını toplu kapatır (Görkem onayı 03.11 14:21).
 *  Gruplar:
 *   IPTAL  : deneme satışları (WH/Stok deposu, müşteri CAN BONOMO / GÖRKEM KIRLI, POS'ta kaydı yok),
 *            POS'ta iptal (VOID) edilmiş satışlar, satıştan sonra o ürün o şubede sayılmış olanlar
 *            → teslimat İPTAL edilir, stoğa dokunulmaz.
 *   TESLIM : geri kalan her şey → "satılan her şey stoktan düşsün": zorlaTeslimEt ile POS'ta satılan lot
 *            düşülür; stok yoksa STOKSUZ-… yer tutucu lotla eksiye düşülür. Hareket tarihi satış tarihine çekilir.
 *
 * VARSAYILAN KURU ÇALIŞMA. Uygulamak için:  --grup=IPTAL|TESLIM --confirm --yedek-alindi  [--limit=N] [--picking=ID]
 *   npx ts-node --transpile-only scripts/teslimat-toplu-kapat.ts                 → özet + plan
 *   npx ts-node --transpile-only scripts/teslimat-toplu-kapat.ts --detay         → TESLIM grubunun kalem kalem planı
 */
import 'dotenv/config';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { zorlaTeslimEt } from '../src/modules/odoo/odoo-delivery.util';
import { prisma } from '../src/database/prisma';

const arg = (a: string) => process.argv.find((x) => x.startsWith(`--${a}=`))?.split('=')[1];
const UYGULA = process.argv.includes('--confirm');
const DENEME_MUSTERI = ['CAN BONOMO', 'GÖRKEM KIRLI'];
const tr = (s: string) => String(s || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();

async function main() {
  const grupSec = arg('grup'); const limit = Number(arg('limit') || 0); const tek = Number(arg('picking') || 0);
  if (UYGULA && !process.argv.includes('--yedek-alindi')) throw new Error('Önce Odoo veritabanı yedeği alın, sonra --yedek-alindi ekleyin.');
  if (UYGULA && !['IPTAL', 'TESLIM'].includes(grupSec ?? '')) throw new Error('--grup=IPTAL veya --grup=TESLIM seçin.');

  const ps = (await execute('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['sale_id', '!=', false], ['state', 'not in', ['done', 'cancel']], ...(tek ? [['id', '=', tek]] : [])]],
    { fields: ['id', 'name', 'state', 'partner_id', 'location_id', 'company_id', 'move_ids', 'sale_id'], order: 'id' })) as any[];
  const sos = new Map(((await execute('sale.order', 'read', [Array.from(new Set(ps.map((p) => p.sale_id[0])))], { fields: ['id', 'name', 'note', 'date_order'] })) as any[]).map((s) => [s.id, s]));
  const posIdOf = (s: any) => String(s?.note || '').match(/POS Satış ID:\s*([0-9a-f-]{36})/i)?.[1] ?? null;
  const sales = new Map((await prisma.sale.findMany({ where: { id: { in: [...sos.values()].map(posIdOf).filter(Boolean) as string[] } },
    select: { id: true, status: true, items: { select: { odooProductId: true, lotNo: true, qty: true, status: true } } } })).map((s) => [s.id, s]));
  const moves = new Map(((await execute('stock.move', 'read', [ps.flatMap((p) => p.move_ids)], { fields: ['id', 'product_id', 'location_id'] })) as any[]).map((m) => [m.id, m]));

  const gruplar: Record<string, { p: any; neden: string }[]> = { IPTAL: [], TESLIM: [] };
  for (const p of ps) {
    const so = sos.get(p.sale_id[0]); const pos = sales.get(posIdOf(so) ?? '');
    let neden = '';
    if (p.location_id[1] === 'WH/Stok') neden = 'deneme (WH deposu)';
    else if (DENEME_MUSTERI.includes(tr(p.partner_id?.[1]))) neden = `deneme (müşteri ${p.partner_id[1]})`;
    else if (!pos) neden = "POS'ta kaydı yok";
    else if (pos.status === 'VOID') neden = "POS'ta iptal edilmiş";
    else {
      for (const mid of p.move_ids) {
        const m = moves.get(mid)!;
        const n = Number(await execute('stock.move', 'search_count', [[['product_id', '=', m.product_id[0]], ['is_inventory', '=', true], ['state', '=', 'done'], ['date', '>', so.date_order],
          '|', ['location_dest_id', '=', m.location_id[0]], ['location_id', '=', m.location_id[0]]]], {}));
        if (n) { neden = `satıştan sonra sayılmış (${m.product_id[1]})`; break; }
      }
    }
    gruplar[neden ? 'IPTAL' : 'TESLIM'].push({ p, neden });
  }
  console.log(`Bekleyen satış teslimatı: ${ps.length}  →  IPTAL ${gruplar.IPTAL.length} | TESLIM ${gruplar.TESLIM.length}`);
  const say = new Map<string, number>(); for (const x of gruplar.IPTAL) { const k = x.neden.replace(/\(.*\)/, '').trim(); say.set(k, (say.get(k) ?? 0) + 1); }
  for (const [k, n] of say) console.log(`   iptal — ${k}: ${n}`);

  // TESLIM planı
  const ozet = { POS: 0, 'AYRILMIŞ': 0, STOK: 0, STOKSUZ: 0, LOTSUZ: 0 } as Record<string, number>;
  const satilan = (p: any) => {
    const pos = sales.get(posIdOf(sos.get(p.sale_id[0])) ?? '');
    return (pos?.items ?? []).filter((i) => i.odooProductId && i.status !== 'VOID').map((i) => ({ productId: Number(i.odooProductId), lotNo: i.lotNo ?? null, qty: i.qty }));
  };
  if (!UYGULA || grupSec === 'TESLIM') {
    let liste = gruplar.TESLIM; if (limit) liste = liste.slice(0, limit);
    let i = 0;
    for (const { p } of liste) {
      const so = sos.get(p.sale_id[0]); const cid = p.company_id[0];
      if (!UYGULA) {
        const { plan } = await zorlaTeslimEt(p.id, cid, satilan(p), false);
        for (const k of plan) for (const st of k.satirlar) ozet[st.kaynak] += st.qty;
        if (process.argv.includes('--detay')) {
          console.log(`  #${p.id} ${p.name} ${so.name} ${String(so.date_order).slice(0, 10)} ${p.location_id[1]} | ${p.partner_id?.[1]}`);
          for (const k of plan) console.log(`      ${k.urun} x${k.adet}: ` + k.satirlar.map((s) => `${s.lotAdi}(${s.qty}) [${s.kaynak}]`).join(', '));
        }
        continue;
      }
      try {
        const { plan } = await zorlaTeslimEt(p.id, cid, satilan(p), true);
        // hareket tarihini satış tarihine çek (stok geçmişi doğru görünsün)
        const ms = (await execute('stock.move', 'search_read', [[['picking_id', '=', p.id]]], { fields: ['id', 'move_line_ids'] }, cid)) as any[];
        await execute('stock.move', 'write', [ms.map((m) => m.id), { date: so.date_order }], { context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] } }, cid);
        const mlIds = ms.flatMap((m) => m.move_line_ids); if (mlIds.length) await execute('stock.move.line', 'write', [mlIds, { date: so.date_order }], {}, cid);
        await execute('stock.picking', 'write', [[p.id], { date_done: so.date_order }], {}, cid);
        i++; console.log(`  ✓ ${i}/${liste.length} ${p.name} ${so.name} teslim edildi — ` + plan.map((k) => `${k.urun}: ${k.satirlar.map((s) => `${s.lotAdi}[${s.kaynak}]`).join(',')}`).join(' | '));
      } catch (e) {
        console.log(`  ✗ ${p.name} ${so.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!UYGULA) {
      console.log(`\nTESLIM planı (adet): POS'ta satılan lot ${ozet.POS} | Odoo'nun ayırdığı lot ${ozet['AYRILMIŞ']} | şubedeki serbest lot ${ozet.STOK} | takipsiz ürün ${ozet.LOTSUZ} | STOKSUZ (eksiye düşecek) ${ozet.STOKSUZ}`);
    }
  }
  if (!UYGULA && process.argv.includes('--detay')) for (const x of gruplar.IPTAL) console.log(`  İPTAL #${x.p.id} ${x.p.name} ${sos.get(x.p.sale_id[0]).name} — ${x.neden}`);
  if (UYGULA && grupSec === 'IPTAL') {
    let liste = gruplar.IPTAL; if (limit) liste = liste.slice(0, limit);
    for (const { p, neden } of liste) {
      try { await execute('stock.picking', 'action_cancel', [[p.id]], {}, p.company_id[0]); console.log(`  ✓ iptal ${p.name} — ${neden}`); }
      catch (e) { console.log(`  ✗ ${p.name}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  if (!UYGULA) console.log('\nKURU ÇALIŞMA — hiçbir şey değişmedi.');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
