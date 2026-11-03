/**
 * 03.11.2026 — TEŞHİS (SALT OKUNUR, hiçbir kaydı değiştirmez).
 *
 * Sorun: Bazı çerçeve/güneş şablonlarında ESKİ global MODEL/RENK/ÖLÇÜ nitelik
 * satırları, yeni "MODEL (Çoklu)/RENK (Çoklu)/ÖLÇÜ (Çoklu)" satırlarıyla
 * BİRLİKTE duruyor. Eski satırlar tek değerli olduğu için Odoo bu değeri o
 * şablonun (o tarihten sonra açılan) varyantlarına da eklemiş; satış ekranında
 * "OS13256 / C1 / 57 / OS13182OO / C1 / 53" gibi üst üste görünüyor. Ayrıca bazı
 * model/renk/ölçü'ler İKİ AYRI varyant olarak var: biri "kirli" (6 değerli),
 * biri "temiz" (3 değerli).
 *
 * Bu script tüm şablonları tarar ve her biri için şunu raporlar:
 *   - eski/yeni nitelik satırları (değer sayısı),
 *   - kirli varyant sayısı, bunların kaçının temiz bir ikizi var,
 *   - kirli/temiz varyantlardaki stok, lot, barkod, POS satış sayısı.
 * --detay ile her kirli varyantı tek tek listeler.
 *
 * Kullanım: npx ts-node --transpile-only scripts/cift-nitelik-teshis.ts [--tmpl=1907] [--detay]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

const arg = (a: string) => process.argv.find((x) => x.startsWith(`--${a}=`))?.split('=')[1];
const DETAY = process.argv.includes('--detay');

async function main() {
  const attrs = (await execute('product.attribute', 'search_read', [[]], { fields: ['id', 'name'] })) as any[];
  const eski = attrs.filter((a) => ['MODEL', 'RENK', 'ÖLÇÜ'].includes(a.name)).map((a) => a.id);
  const yeni = attrs.filter((a) => /\(Çoklu\)/.test(a.name)).map((a) => a.id);
  const tmplArg = arg('tmpl');
  const dom: any[] = [['attribute_id', 'in', eski]];
  if (tmplArg) dom.push(['product_tmpl_id', '=', Number(tmplArg)]);
  const eskiLines = (await execute('product.template.attribute.line', 'search_read', [dom],
    { fields: ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'] })) as any[];
  const tmplIds = Array.from(new Set(eskiLines.map((l) => l.product_tmpl_id[0])));
  const yeniLines = tmplIds.length ? (await execute('product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', 'in', tmplIds], ['attribute_id', 'in', yeni]]],
    { fields: ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'] })) as any[] : [];
  const ikisiDe = tmplIds.filter((t) => yeniLines.some((l) => l.product_tmpl_id[0] === t));
  console.log(`Eski + Çoklu nitelikleri birlikte olan şablon: ${ikisiDe.length}\n`);

  let topKirli = 0;
  for (const t of ikisiDe) {
    const el = eskiLines.filter((l) => l.product_tmpl_id[0] === t);
    const yl = yeniLines.filter((l) => l.product_tmpl_id[0] === t);
    const vs = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', t]]],
      { fields: ['id', 'barcode', 'product_template_attribute_value_ids', 'qty_available', 'active'] })) as any[];
    const ptavIds = Array.from(new Set(vs.flatMap((v) => v.product_template_attribute_value_ids)));
    const ptav = new Map<number, { attr: number; val: string }>();
    if (ptavIds.length) for (const p of (await execute('product.template.attribute.value', 'read', [ptavIds],
      { fields: ['id', 'attribute_id', 'name'] })) as any[]) ptav.set(p.id, { attr: p.attribute_id[0], val: p.name });
    const quants = (await execute('stock.quant', 'search_read',
      [[['product_id', 'in', vs.map((v) => v.id)], ['location_id.usage', '=', 'internal'], ['quantity', '>', 0]]],
      { fields: ['product_id', 'quantity', 'location_id'] })) as any[];
    const stok = new Map<number, number>();
    for (const q of quants) stok.set(q.product_id[0], (stok.get(q.product_id[0]) ?? 0) + q.quantity);
    const satis = await prisma.saleItem.groupBy({ by: ['odooProductId'], where: { odooProductId: { in: vs.map((v) => String(v.id)) } }, _count: true });
    const satisMap = new Map(satis.map((s: any) => [Number(s.odooProductId), s._count]));
    const anahtar = (v: any) => v.product_template_attribute_value_ids.map((i: number) => ptav.get(i)).filter((p: any) => p && yeni.includes(p.attr)).map((p: any) => p.val).join(' / ');
    const kirli = (v: any) => v.product_template_attribute_value_ids.some((i: number) => eski.includes(ptav.get(i)?.attr ?? -1));
    const grup = new Map<string, any[]>();
    for (const v of vs) { const k = anahtar(v); grup.set(k, [...(grup.get(k) ?? []), v]); }
    const kirliler = vs.filter(kirli);
    const ikizli = kirliler.filter((v) => (grup.get(anahtar(v)) ?? []).some((w) => !kirli(w)));
    topKirli += kirliler.length;
    const sum = (arr: any[], m: Map<number, number>) => arr.reduce((a, v) => a + (m.get(v.id) ?? 0), 0);
    const temizIkizler = ikizli.flatMap((v) => (grup.get(anahtar(v)) ?? []).filter((w) => !kirli(w)));
    console.log(`■ #${t} ${vs[0]?.product_tmpl_id?.[1] ?? ''}`);
    console.log(`   eski satırlar: ${el.map((l) => `${l.attribute_id[1]}(${l.value_ids.length} değer)`).join(', ')} | çoklu: ${yl.map((l) => `${l.attribute_id[1]}(${l.value_ids.length})`).join(', ')}`);
    console.log(`   varyant: ${vs.length} | kirli: ${kirliler.length} (temiz ikizi olan: ${ikizli.length}, ikizsiz: ${kirliler.length - ikizli.length})`);
    console.log(`   kirlilerde stok: ${sum(kirliler, stok)} adet, barkodlu: ${kirliler.filter((v) => v.barcode).length}, POS satış kalemi: ${sum(kirliler, satisMap)}`);
    console.log(`   ikizlerin temiz eşlerinde stok: ${sum(temizIkizler, stok)}, barkodlu: ${temizIkizler.filter((v) => v.barcode).length}, satış: ${sum(temizIkizler, satisMap)}`);
    if (DETAY) for (const v of kirliler) {
      const es = (grup.get(anahtar(v)) ?? []).filter((w) => w.id !== v.id);
      console.log(`     kirli #${v.id} [${anahtar(v)}] stok=${stok.get(v.id) ?? 0} barkod=${v.barcode || '-'} satış=${satisMap.get(v.id) ?? 0}` +
        (es.length ? `  ⇄ ikiz ${es.map((w) => `#${w.id}${kirli(w) ? '(kirli)' : ''} stok=${stok.get(w.id) ?? 0} barkod=${w.barcode || '-'} satış=${satisMap.get(w.id) ?? 0}`).join(' ; ')}` : '  (ikiz yok)'));
    }
  }
  console.log(`\nTOPLAM kirli varyant: ${topKirli}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
