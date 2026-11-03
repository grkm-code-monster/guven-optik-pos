/**
 * 03.11.2026 — Eski (tek değerli) MODEL/RENK/ÖLÇÜ nitelik satırlarını bir
 * şablondan temizler. Teşhis: scripts/cift-nitelik-teshis.ts
 *
 * VARSAYILAN KURU ÇALIŞMA — hiçbir şey yazmaz, sadece planı yazar. --confirm ile uygular.
 *
 * Adımlar (tek şablon):
 *  1) Güvenlik: şablondaki eski MODEL/RENK/ÖLÇÜ satırlarının HER BİRİNDE (arşivliler dahil)
 *     tek değer olmalı. Değilse DURUR (o şablon elle çözülür).
 *  2) "İkizler": eski değer düşünce aynı model/renk/ölçü'ye düşecek iki aktif varyant varsa
 *     TEMİZ olan kalır, KİRLİ olanın stoğu (lot/UTS ile birlikte) temize taşınır, temizde
 *     barkod yoksa kirlinin barkodu temize geçer, kirli ARŞİVLENİR (silinmez, satış geçmişi kalır).
 *     İkiz grubu 2'den büyükse ya da iki temiz varsa DURUR.
 *  3) Eski satırlar kaldırılır: Odoo tek değerli satırda değeri varyantlardan çıkarır,
 *     varyantlar (stok/barkod/satış) yerinde kalır.
 *  4) Kontrol: aktif varyantlarda eski değer kalmamalı, varyant sayısı = önceki - arşivlenen.
 *
 * Kullanım: npx ts-node --transpile-only scripts/cift-nitelik-temizle.ts --tmpl=1907 [--confirm]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';
import { applyStockAdjustment, applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { getOrCreateStockLot } from '../src/modules/admin/stock-lot.service';

const arg = (a: string) => process.argv.find((x) => x.startsWith(`--${a}=`))?.split('=')[1];
const UYGULA = process.argv.includes('--confirm');
const lokKod = (id: number) => Object.keys(LOKASYON_ID_MAP).find((k) => LOKASYON_ID_MAP[k] === id);

async function main() {
  const T = Number(arg('tmpl'));
  if (!T) throw new Error('--tmpl=<şablon no> zorunlu');
  const tmpl = ((await execute('product.template', 'read', [[T]], { fields: ['id', 'name'] })) as any[])[0];
  console.log(`ŞABLON #${T} ${tmpl?.name}\n`);
  const attrs = (await execute('product.attribute', 'search_read', [[]], { fields: ['id', 'name'] })) as any[];
  const eski = attrs.filter((a) => ['MODEL', 'RENK', 'ÖLÇÜ'].includes(a.name)).map((a) => a.id);

  // 1) eski satırlar
  const lines = (await execute('product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', T], ['attribute_id', 'in', eski]]],
    { fields: ['id', 'attribute_id', 'value_ids', 'product_template_value_ids'] })) as any[];
  if (!lines.length) { console.log('Eski nitelik satırı yok — zaten temiz.'); return; }
  for (const l of lines) console.log(`  eski satır #${l.id} ${l.attribute_id[1]}: ${l.value_ids.length} değer (arşivliler dahil ${l.product_template_value_ids.length})`);
  const sorunlu = lines.filter((l) => l.value_ids.length !== 1 || l.product_template_value_ids.length !== 1);
  if (sorunlu.length) { console.log('\nDURDU: eski satırlardan en az biri tek değerli değil — bu şablon elle çözülmeli.'); return; }
  const eskiPtav = new Set<number>(lines.flatMap((l) => l.product_template_value_ids));

  // 2) varyantlar ve ikizler
  const vs = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', T]]],
    { fields: ['id', 'barcode', 'standard_price', 'product_template_attribute_value_ids', 'tracking'] })) as any[];
  const ptavIds = Array.from(new Set(vs.flatMap((v) => v.product_template_attribute_value_ids)));
  const ptavAd = new Map<number, string>();
  if (ptavIds.length) for (const p of (await execute('product.template.attribute.value', 'read', [ptavIds], { fields: ['id', 'name'] })) as any[]) ptavAd.set(p.id, p.name);
  const kirli = (v: any) => v.product_template_attribute_value_ids.some((i: number) => eskiPtav.has(i));
  const anahtar = (v: any) => v.product_template_attribute_value_ids.filter((i: number) => !eskiPtav.has(i)).sort((a: number, b: number) => a - b).join(',');
  const ad = (v: any) => v.product_template_attribute_value_ids.filter((i: number) => !eskiPtav.has(i)).map((i: number) => ptavAd.get(i)).join(' / ');
  const grup = new Map<string, any[]>();
  for (const v of vs) grup.set(anahtar(v), [...(grup.get(anahtar(v)) ?? []), v]);
  const ciftler: { keep: any; drop: any }[] = [];
  for (const [k, g] of grup) {
    if (g.length === 1) continue;
    const t = g.filter((v) => !kirli(v)); const kk = g.filter(kirli);
    if (g.length > 2 || t.length !== 1 || kk.length !== 1 || !k) {
      console.log(`\nDURDU: "${ad(g[0])}" için ${g.length} varyant var (temiz ${t.length}, kirli ${kk.length}) — elle bakılmalı.`); return;
    }
    ciftler.push({ keep: t[0], drop: kk[0] });
  }
  const dropIds = ciftler.map((c) => c.drop.id);
  const quants = dropIds.length ? (await execute('stock.quant', 'search_read',
    [[['product_id', 'in', dropIds], ['location_id.usage', '=', 'internal'], ['quantity', '!=', 0]]],
    { fields: ['id', 'product_id', 'location_id', 'lot_id', 'quantity'] })) as any[] : [];
  const bekleyen = dropIds.length ? Number(await execute('stock.move', 'search_count',
    [[['product_id', 'in', dropIds], ['state', 'not in', ['done', 'cancel']]]], {})) : 0;
  if (bekleyen) {
    const mv = (await execute('stock.move', 'search_read', [[['product_id', 'in', dropIds], ['state', 'not in', ['done', 'cancel']]]],
      { fields: ['id', 'product_id', 'picking_id', 'state', 'location_id', 'location_dest_id', 'product_uom_qty', 'date', 'origin'] })) as any[];
    console.log(`\nDURDU: arşivlenecek varyantlarda ${bekleyen} bekleyen stok hareketi (transfer/teslimat) var:`);
    for (const m of mv) {
      const c = ciftler.find((x) => x.drop.id === m.product_id[0])!;
      console.log(`  hareket #${m.id} [${m.state}] ${m.product_id[1]} | kirli #${m.product_id[0]} → temiz ikizi #${c.keep.id} | ${m.product_uom_qty} adet ${m.location_id[1]} → ${m.location_dest_id[1]} | belge ${m.picking_id ? m.picking_id[1] + ' (#' + m.picking_id[0] + ')' : '-'} | ${m.origin || ''} | ${m.date}`);
    }
    console.log('Bu transfer önce tamamlanmalı/iptal edilmeli (ya da ürünü temiz ikize çevirmeliyiz). Hiçbir şey değişmedi.');
    return;
  }
  for (const q of quants) {
    if (q.quantity < 0) { console.log(`\nDURDU: eksi stok var (#${q.product_id[0]} ${q.location_id[1]} ${q.quantity}).`); return; }
    if (!lokKod(q.location_id[0])) { console.log(`\nDURDU: tanımsız lokasyon ${q.location_id[1]}.`); return; }
  }
  const lotIds = quants.filter((q) => q.lot_id).map((q) => q.lot_id[0]);
  const lotlar = new Map<number, any>();
  if (lotIds.length) for (const l of (await execute('stock.lot', 'read', [lotIds], { fields: ['id', 'name', 'ref', 'x_uts_kodu', 'x_tedarikci_urun_adi', 'company_id'] })) as any[]) lotlar.set(l.id, l);

  console.log(`\nAktif varyant: ${vs.length} | kirli: ${vs.filter(kirli).length} | ikiz çifti: ${ciftler.length}`);
  for (const c of ciftler) {
    const qs = quants.filter((q) => q.product_id[0] === c.drop.id);
    console.log(`  • ${ad(c.drop)}: kirli #${c.drop.id} (barkod ${c.drop.barcode || '-'}, stok ${qs.reduce((a, q) => a + q.quantity, 0)}) → temiz #${c.keep.id} (barkod ${c.keep.barcode || '-'})` +
      `${!c.keep.barcode && c.drop.barcode ? ' [barkod temize geçecek]' : ''}${c.keep.barcode && c.drop.barcode && c.keep.barcode !== c.drop.barcode ? ` [DİKKAT: kirlinin barkodu ${c.drop.barcode} kullanılamayacak]` : ''}`);
    for (const q of qs) console.log(`      stok ${q.quantity} @ ${lokKod(q.location_id[0])}${q.lot_id ? ` lot ${q.lot_id[1]}` : ''} → temize taşınacak`);
  }
  console.log(`\nSonra: ${lines.length} eski nitelik satırı kaldırılacak → ${vs.filter(kirli).length - ciftler.length} kirli varyant temizlenecek, ${ciftler.length} kirli ikiz arşivlenecek.`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — hiçbir şey değişmedi. Uygulamak için --confirm ekleyin.'); return; }

  // UYGULA
  for (const c of ciftler) {
    for (const q of quants.filter((x) => x.product_id[0] === c.drop.id)) {
      const lok = lokKod(q.location_id[0])!;
      if (q.lot_id) {
        const lot = lotlar.get(q.lot_id[0]);
        const cid = lot.company_id ? lot.company_id[0] : undefined;
        await applyStockAdjustment({ productId: c.drop.id, locationCode: lok, qty: 0, quantId: q.id });
        await execute('stock.lot', 'write', [[lot.id], { ...(lot.x_uts_kodu ? { x_uts_kodu: `DELETE_${lot.x_uts_kodu}` } : {}), ...(lot.ref ? { ref: `DELETE_${lot.ref}` } : {}) }], {}, cid);
        const { lotId } = await getOrCreateStockLot(lot.name, c.keep.id, cid, lot.ref || undefined, lot.x_uts_kodu || undefined);
        if (lot.x_tedarikci_urun_adi) await execute('stock.lot', 'write', [[lotId], { x_tedarikci_urun_adi: lot.x_tedarikci_urun_adi }], {}, cid);
        await applyStockAdjustmentForLot({ productId: c.keep.id, locationCode: lok, lotId, qty: q.quantity });
        console.log(`  ✓ lot ${lot.name} (${q.quantity}) #${c.drop.id} → #${c.keep.id} @ ${lok}`);
      } else {
        const mevcut = (await execute('stock.quant', 'search_read', [[['product_id', '=', c.keep.id], ['location_id', '=', q.location_id[0]], ['lot_id', '=', false]]], { fields: ['id', 'quantity'], limit: 1 })) as any[];
        await applyStockAdjustment({ productId: c.drop.id, locationCode: lok, qty: 0, quantId: q.id });
        await applyStockAdjustment({ productId: c.keep.id, locationCode: lok, qty: (mevcut[0]?.quantity ?? 0) + q.quantity, quantId: mevcut[0]?.id });
        console.log(`  ✓ stok ${q.quantity} #${c.drop.id} → #${c.keep.id} @ ${lok}`);
      }
    }
    const yaz: any = {};
    if (!c.keep.barcode && c.drop.barcode) yaz.barcode = c.drop.barcode;
    if (!c.keep.standard_price && c.drop.standard_price) yaz.standard_price = c.drop.standard_price;
    await execute('product.product', 'write', [[c.drop.id], { active: false, ...(yaz.barcode ? { barcode: false } : {}) }]);
    if (Object.keys(yaz).length) await execute('product.product', 'write', [[c.keep.id], yaz]);
    console.log(`  ✓ kirli #${c.drop.id} arşivlendi${yaz.barcode ? `, barkod ${yaz.barcode} → #${c.keep.id}` : ''}`);
  }
  for (const l of lines) { await execute('product.template.attribute.line', 'unlink', [[l.id]]); console.log(`  ✓ eski satır #${l.id} (${l.attribute_id[1]}) kaldırıldı`); }

  const son = (await execute('product.product', 'search_read', [[['product_tmpl_id', '=', T]]], { fields: ['id', 'product_template_attribute_value_ids'] })) as any[];
  const hala = son.filter((v) => v.product_template_attribute_value_ids.some((i: number) => eskiPtav.has(i)));
  console.log(`\nKONTROL: aktif varyant ${son.length} (beklenen ${vs.length - ciftler.length}), eski değeri kalan: ${hala.length} (0 olmalı)`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exit(1); });
