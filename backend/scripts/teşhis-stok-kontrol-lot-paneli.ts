/**
 * Stok Kontrol lot paneli — uçtan uca teşhis (0125, ZAROSSI, company_id, zincir izleme)
 * npx tsx scripts/teşhis-stok-kontrol-lot-paneli.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { listStokKontrol } from '../src/modules/admin/stok-yonetimi.service';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';
import { LOKASYON_ID_MAP, getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';

const ctx = { context: { active_test: false } };
const ALL_CTX = { context: { allowed_company_ids: [1, 2, 3, 4] } };

const ZAROSSI_IDS = [5655, 5687, 5671, 5673];
const ZAROSSI_TMPL = 1956;

async function readCompanyId(model: string, id: number) {
  const rows = (await execute(model, 'read', [[id]], {
    fields: ['id', 'name', 'display_name', 'company_id', 'active'],
    ...ALL_CTX,
  })) ?? [];
  const r = rows[0];
  if (!r) return null;
  const cid = r.company_id;
  return {
    id: r.id,
    name: r.display_name ?? r.name,
    company_id: Array.isArray(cid) ? cid[0] : cid,
    company_name: Array.isArray(cid) ? cid[1] : String(cid ?? '—'),
    active: r.active,
  };
}

async function resolveProductIdTrace(rawId: number, companyId: number) {
  const asProduct = (await execute(
    'product.product',
    'search_read',
    [[['id', '=', rawId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  )) ?? [];
  if (asProduct.length) return { resolved: asProduct[0].id, yontem: 'product.product id' };

  const variants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', rawId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  )) ?? [];
  if (variants.length) return { resolved: variants[0].id, yontem: 'template→variant' };

  return { resolved: null, yontem: 'BULUNAMADI' };
}

async function fetchQuantsTrace(productId: number, lokasyonKod: string) {
  const companyId = getCompanyIdFromLokasyon(lokasyonKod);
  const lokasyonId = LOKASYON_ID_MAP[lokasyonKod];
  if (!companyId || !lokasyonId) {
    return { companyId, lokasyonId, count: 0, error: 'lokasyon/şirket tanımsız' };
  }
  const resolved = await resolveProductIdTrace(productId, companyId);
  if (!resolved.resolved) {
    return { companyId, lokasyonId, resolved, count: 0, error: 'resolveProductId başarısız' };
  }
  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[
      ['location_id', '=', lokasyonId],
      ['quantity', '>', 0],
      ['product_id', '=', resolved.resolved],
    ]],
    { fields: ['id', 'quantity', 'lot_id', 'product_id'], limit: 100 },
    companyId,
  )) ?? [];
  return { companyId, lokasyonId, resolved, count: quants.length, quants: quants.slice(0, 5) };
}

async function simulatePanel(productId: number, urunAdi: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PANEL SİMÜLASYONU: #${productId} ${urunAdi}`);
  console.log('='.repeat(70));

  const rows = await listStokKontrol({ q: urunAdi.split(' ').slice(-1)[0] ?? urunAdi, stokDurumu: 'var' });
  const urun = rows.find((r) => r.productId === productId);
  if (!urun) {
    console.log('  listStokKontrol: ürün bulunamadı');
    return { panelSatir: 0, hatalar: ['listStokKontrol miss'] };
  }

  const stokluSubeler = urun.lokasyonlar.filter((l) => l.miktar > 0);
  console.log(`  listStokKontrol productId=${urun.productId} toplamStok=${urun.toplamStok}`);
  console.log(`  stoklu şubeler (${stokluSubeler.length}): ${stokluSubeler.map((s) => `${s.kod}=${s.miktar}`).join(', ')}`);

  const satirlar: string[] = [];
  const hatalar: string[] = [];

  for (const sube of stokluSubeler) {
    console.log(`\n  --- sube=${sube.kod} miktar=${sube.miktar} ---`);
    const trace = await fetchQuantsTrace(productId, sube.kod);
    console.log(`    fetchQuantsTrace: company=${trace.companyId} loc=${trace.lokasyonId} resolve=${JSON.stringify(trace.resolved ?? trace.error)} quant=${trace.count}`);

    if (sube.kod.startsWith('#')) {
      console.log(`    UYARI: bilinmeyen lokasyon kodu "${sube.kod}" — getCompanyIdFromLokasyon muhtemelen null`);
      hatalar.push(`bilinmeyen sube kodu: ${sube.kod}`);
    }

    try {
      const lots = await searchUrunLotsByProduct(productId, sube.kod);
      console.log(`    searchUrunLotsByProduct: ${lots.length} satır`);
      for (const l of lots.slice(0, 3)) {
        console.log(`      lotNo=${l.lotNo} uts=${l.utsKodu ?? 'null'} stok=${l.stok}`);
        satirlar.push(`${sube.kod}|${l.lotNo}`);
      }
      if (lots.length > 3) console.log(`      ... +${lots.length - 3} daha`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    searchUrunLotsByProduct HATA: ${msg.slice(0, 200)}`);
      hatalar.push(`${sube.kod}: ${msg.slice(0, 120)}`);
    }
  }

  console.log(`\n  PANEL SONUCU: ${satirlar.length} lot satırı${hatalar.length ? `, ${hatalar.length} hata` : ''}`);
  if (!satirlar.length) console.log('  → UI: "Bu ürün için lot/UTS kaydı yok"');
  return { panelSatir: satirlar.length, hatalar };
}

async function main() {
  console.log('=== STOK KONTROL LOT PANEL TEŞHİSİ ===\n');

  // ULTRA -0125
  const ultra = (await execute(
    'product.product',
    'search_read',
    [[['name', 'ilike', '-0125'], ['name', 'ilike', 'ULTRA']]],
    { fields: ['id', 'display_name', 'barcode'], limit: 5, ...ctx },
  )) ?? [];
  console.log('ULTRA -0125 adayları:');
  for (const p of ultra) console.log(`  #${p.id} ${p.display_name} barcode=${p.barcode ?? '—'}`);

  const ultra0125 = ultra.find((p) => String(p.display_name).includes('-0125')) ?? ultra[0];
  if (ultra0125) {
    const info = await readCompanyId('product.product', ultra0125.id);
    console.log(`\nULTRA -0125 company_id: ${info?.company_name} (${info?.company_id})`);

    const allQuants = (await execute(
      'stock.quant',
      'search_read',
      [[['product_id', '=', ultra0125.id], ['quantity', '>', 0]]],
      { fields: ['location_id', 'quantity', 'lot_id', 'company_id'], limit: 50, ...ALL_CTX },
    )) ?? [];
    console.log(`Tüm pozitif quant (${allQuants.length}):`);
    for (const q of allQuants) {
      console.log(`  ${q.location_id?.[1]} qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'} company=${q.company_id?.[1] ?? '—'}`);
    }

    await simulatePanel(ultra0125.id, ultra0125.display_name);
  }

  // ZAROSSI
  console.log(`\n${'='.repeat(70)}`);
  console.log('ZAROSSI company_id');
  console.log('='.repeat(70));
  const tmpl = await readCompanyId('product.template', ZAROSSI_TMPL);
  console.log(`  şablon #${ZAROSSI_TMPL}: company=${tmpl?.company_name} (${tmpl?.company_id})`);
  for (const vid of ZAROSSI_IDS) {
    const v = await readCompanyId('product.product', vid);
    console.log(`  #${vid}: company=${v?.company_name} (${v?.company_id})`);
  }

  // Karşılaştırma — OPTELLİ (lot panel çalışan)
  const optelli = (await execute(
    'product.product',
    'search_read',
    [[['barcode', '=', '8682037201630']]],
    { fields: ['id', 'display_name'], limit: 1, ...ctx },
  )) ?? [];
  if (optelli[0]) {
    const o = await readCompanyId('product.product', optelli[0].id);
    console.log(`\nKarşılaştırma OPTELLİ #${optelli[0].id}: company=${o?.company_name} (${o?.company_id})`);
    await simulatePanel(optelli[0].id, optelli[0].display_name);
  }

  for (const vid of [5655]) {
    await simulatePanel(vid, `ZAROSSI varyant #${vid}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
