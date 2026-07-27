/**
 * ZAROSSI test artıkları temizliği
 * npx ts-node --transpile-only backend/scripts/temizlik-zarossi-test-artiklari.ts [--dry-run]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { ARCHIVE_DELETE_PREFIX } from '../src/modules/admin/archive-barcode.util';
import { rollbackCreatedLot } from '../src/modules/admin/stock-lot.service';
import { applyStockAdjustment } from '../src/modules/admin/stock-adjustment.service';
import { isVaryantGuvenleSilinebilir } from '../src/modules/admin/varyant-import-temizlik.service';
import { topluUrunArsivdenCikar } from '../src/modules/admin/stok-yonetimi.service';
import { getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';

const DRY_RUN = process.argv.includes('--dry-run');
const ctx = { context: { active_test: false } };

const TMPL_ID = 1956;
const GERCEK_VARYANT_IDS = new Set([5655, 5687, 5671, 5673]);
const GERCEK_BARKODLAR = new Set(['22442529', '22442680', '22442697', '86932839003381']);
const TEST_MODELLER = new Set(['ZA178480']);

type LotRow = { id: number; name: string; product_id: [number, string]; x_uts_kodu?: string | false };
type VariantRow = {
  id: number;
  barcode?: string | false;
  active: boolean;
  display_name: string;
  default_code?: string | false;
};

async function lotSilmeGuvenligi(lotId: number): Promise<{ guvenli: boolean; sebep?: string }> {
  const nonZeroQuants = Number(await execute(
    'stock.quant',
    'search_count',
    [[['lot_id', '=', lotId], ['quantity', '!=', 0]]],
    ctx,
  ));
  if (nonZeroQuants > 0) {
    return { guvenli: false, sebep: `pozitif/sıfır olmayan quant: ${nonZeroQuants}` };
  }

  const moveLines = Number(await execute(
    'stock.move.line',
    'search_count',
    [[['lot_id', '=', lotId]]],
    ctx,
  ));
  if (moveLines > 0) {
    return { guvenli: false, sebep: `stock.move.line bağlantısı: ${moveLines}` };
  }

  return { guvenli: true };
}

function isEskiHataliLot(lot: LotRow): boolean {
  const name = String(lot.name ?? '');
  const uts = typeof lot.x_uts_kodu === 'string' ? lot.x_uts_kodu : '';
  return name.startsWith(ARCHIVE_DELETE_PREFIX)
    || uts.startsWith(ARCHIVE_DELETE_PREFIX)
    || /^DELETE_01086/.test(name)
    || /^01086/.test(name);
}

function locationCodeFromOdooName(locName: string): string {
  if (locName.includes('ANA-DEPO') || locName.includes('ANADEPO')) return 'ANADEPO';
  return 'ANADEPO';
}

async function sifirlaQuant(quantId: number, productId: number, locName: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`    [dry-run] quant #${quantId} @ ${locName} → 0`);
    return;
  }

  try {
    await applyStockAdjustment({
      productId,
      locationCode: locationCodeFromOdooName(locName),
      qty: 0,
      quantId,
    });
    console.log(`    quant #${quantId} @ ${locName} sıfırlandı`);
    return;
  } catch {
    const rows = (await execute(
      'stock.quant',
      'read',
      [[quantId]],
      { fields: ['id', 'quantity', 'location_id', 'company_id'],
        ...ctx },
    )) ?? [];
    const q = rows[0];
    if (!q) return;

    const locId = Array.isArray(q.location_id) ? q.location_id[0] : q.location_id;
    const companyId = Array.isArray(q.company_id) ? q.company_id[0] : q.company_id;
    const cid = companyId || getCompanyIdFromLokasyon('ANADEPO') || undefined;

    await execute(
      'stock.quant',
      'write',
      [[quantId], { inventory_quantity: 0 }],
      { context: { inventory_mode: true } },
      cid,
    );
    try {
      await execute('stock.quant', 'action_apply_inventory', [[quantId]], {}, cid);
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (!msg.includes('cannot marshal None')) throw err;
    }
    console.log(`    quant #${quantId} @ loc#${locId} sıfırlandı (doğrudan)`);
  }
}

async function sifirlaLotQuants(lotId: number, productId: number): Promise<number> {
  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['lot_id', '=', lotId], ['quantity', '!=', 0]]],
    { fields: ['id', 'quantity', 'location_id'], limit: 20, ...ctx },
  )) ?? [];

  for (const q of quants) {
    const locName = String(q.location_id?.[1] ?? '');
    await sifirlaQuant(q.id, productId, locName);
  }
  return quants.length;
}

async function temizleEskiLotlar(): Promise<{ silinen: number[]; atlanan: Array<{ id: number; sebep: string }> }> {
  console.log('\n=== 1) Eski hatalı lot temizliği ===');
  const silinen: number[] = [];
  const atlanan: Array<{ id: number; sebep: string }> = [];

  for (const variantId of GERCEK_VARYANT_IDS) {
    const lots = (await execute(
      'stock.lot',
      'search_read',
      [[['product_id', '=', variantId]]],
      { fields: ['id', 'name', 'x_uts_kodu', 'product_id'], order: 'id asc', ...ctx },
    )) as LotRow[];

    const eskiLotlar = lots.filter(isEskiHataliLot);
    const yeniLotlar = lots.filter((l) => !isEskiHataliLot(l));
    console.log(`\nVaryant #${variantId}: ${eskiLotlar.length} eski, ${yeniLotlar.length} yeni lot`);
    for (const y of yeniLotlar) {
      console.log(`  KORUNAN lot #${y.id} name="${y.name}"`);
    }

    for (const lot of eskiLotlar) {
      console.log(`\n  Eski lot #${lot.id} name="${String(lot.name).slice(0, 60)}"`);
      const productId = lot.product_id[0];

      let guvenlik = await lotSilmeGuvenligi(lot.id);
      if (!guvenlik.guvenli && guvenlik.sebep?.includes('quant')) {
        const sifir = await sifirlaLotQuants(lot.id, productId);
        if (sifir > 0) {
          guvenlik = await lotSilmeGuvenligi(lot.id);
        }
      }

      if (!guvenlik.guvenli) {
        console.log(`  ATLANDI — ${guvenlik.sebep}`);
        atlanan.push({ id: lot.id, sebep: guvenlik.sebep ?? 'bilinmiyor' });
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [dry-run] lot #${lot.id} silinecek`);
        silinen.push(lot.id);
        continue;
      }

      await rollbackCreatedLot(lot.id);
      const kaldi = Number(await execute('stock.lot', 'search_count', [[['id', '=', lot.id]]], ctx));
      if (kaldi === 0) {
        console.log(`  SİLİNDİ lot #${lot.id}`);
        silinen.push(lot.id);
      } else {
        console.log(`  SİLİNEMEDİ lot #${lot.id} (rollback sonrası hâlâ var)`);
        atlanan.push({ id: lot.id, sebep: 'unlink başarısız' });
      }
    }
  }

  return { silinen, atlanan };
}

async function sablonuAktiflestir(): Promise<{ ok: boolean; yontem: string; hata?: string }> {
  console.log('\n=== 2) Şablon #1956 arşivden çıkarma ===');
  const tmpl = (await execute('product.template', 'read', [[TMPL_ID]], {
    fields: ['id', 'name', 'active'],
    ...ctx,
  }))?.[0] as { id: number; name: string; active: boolean };

  console.log(`  Mevcut: active=${tmpl?.active}`);
  if (tmpl?.active) {
    return { ok: true, yontem: 'zaten aktif' };
  }

  if (DRY_RUN) {
    console.log('  [dry-run] topluUrunArsivdenCikar([1956]) çağrılacak');
    return { ok: true, yontem: 'dry-run' };
  }

  const sonuc = await topluUrunArsivdenCikar([TMPL_ID]);
  const satir = sonuc.sonuclar[0];
  if (satir?.basarili) {
    console.log('  OK — topluUrunArsivdenCikar');
    return { ok: true, yontem: 'topluUrunArsivdenCikar' };
  }

  console.log(`  topluUrunArsivdenCikar başarısız: ${satir?.hata ?? 'bilinmiyor'}`);
  console.log('  Yedek: sadece şablon active=true yazılıyor');
  await execute('product.template', 'write', [[TMPL_ID], { active: true }], ctx);
  return { ok: true, yontem: 'sadece_sablon_active', hata: satir?.hata };
}

function isTestDokuntu(v: VariantRow): boolean {
  if (GERCEK_VARYANT_IDS.has(v.id)) return false;

  const barkod = typeof v.barcode === 'string' ? v.barcode.trim() : '';
  if (barkod && GERCEK_BARKODLAR.has(barkod)) return false;

  if (barkod && !GERCEK_BARKODLAR.has(barkod)) {
    const modelMatch = v.display_name.match(/\(([A-Z0-9]+),/);
    const model = modelMatch?.[1] ?? '';
    if (TEST_MODELLER.has(model)) return true;
    if (v.id >= 5697) return true;
  }

  if (!barkod && !v.default_code) return true;
  return v.id >= 5697 && v.id <= 5738;
}

async function sifirlaVaryantStogu(variantId: number): Promise<void> {
  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', variantId], ['quantity', '!=', 0]]],
    { fields: ['id', 'quantity', 'location_id', 'lot_id'], limit: 20, ...ctx },
  )) ?? [];

  for (const q of quants) {
    const locName = String(q.location_id?.[1] ?? '');
    await sifirlaQuant(q.id, variantId, locName);
  }
}

async function isTestVaryantSilinebilir(variantId: number): Promise<{ ok: boolean; sebep?: string }> {
  if (GERCEK_VARYANT_IDS.has(variantId)) {
    return { ok: false, sebep: 'korunan gerçek varyant' };
  }

  const rows = (await execute(
    'product.product',
    'read',
    [[variantId]],
    { fields: ['id', 'default_code', 'barcode', 'display_name'],
      ...ctx },
  )) as VariantRow[];
  const v = rows[0];
  if (!v) return { ok: false, sebep: 'kayit_yok' };

  const stokRows = (await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', variantId], ['quantity', '>', 0]]],
    { fields: ['quantity'], limit: 20, ...ctx },
  )) ?? [];
  const stok = stokRows.reduce((s: number, r: { quantity: number }) => s + Number(r.quantity), 0);
  if (stok > 0) return { ok: false, sebep: `stok_var(${stok})` };

  const checks: [string, string][] = [
    ['sale.order.line', 'satis'],
    ['stock.move.line', 'stokHareket'],
    ['account.move.line', 'fatura'],
    ['purchase.order.line', 'satinalma'],
  ];
  for (const [model, label] of checks) {
    const count = Number(await execute(model, 'search_count', [[['product_id', '=', variantId]]], ctx));
    if (count > 0) return { ok: false, sebep: `${label}(${count})` };
  }

  return { ok: true };
}

async function temizleTestVaryantlari(): Promise<{
  silinen: number[];
  atlanan: Array<{ id: number; sebep: string }>;
  korunan: number[];
}> {
  console.log('\n=== 3) Döküntü test varyant temizliği ===');
  const variants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', TMPL_ID]]],
    { fields: ['id', 'barcode', 'active', 'display_name', 'default_code'], order: 'id asc', ...ctx },
  )) as VariantRow[];

  console.log(`  Toplam varyant: ${variants.length}`);
  const korunan = variants.filter((v) => !isTestDokuntu(v)).map((v) => v.id);
  const adaylar = variants.filter((v) => isTestDokuntu(v));

  console.log(`  Korunan: ${korunan.length} → ${korunan.join(', ')}`);
  console.log(`  Test adayı: ${adaylar.length}`);

  const silinen: number[] = [];
  const atlanan: Array<{ id: number; sebep: string }> = [];

  for (const v of adaylar) {
    let testCheck = await isTestVaryantSilinebilir(v.id);
    if (!testCheck.ok && testCheck.sebep?.startsWith('stok_var')) {
      console.log(`  #${v.id} test stoku sıfırlanıyor…`);
      await sifirlaVaryantStogu(v.id);
      testCheck = await isTestVaryantSilinebilir(v.id);
    }

    const guvenli = await isVaryantGuvenleSilinebilir(v.id);
    const testGuvenli = guvenli || testCheck.ok;

    if (!testGuvenli) {
      const detay = guvenli ? 'ok' : testCheck.sebep;
      console.log(`  ATLANDI #${v.id} barcode=${v.barcode ?? '—'} — ${detay ?? 'guvenli_degil'}`);
      atlanan.push({ id: v.id, sebep: detay ?? 'guvenli_degil' });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] silinecek #${v.id} ${v.display_name}`);
      silinen.push(v.id);
      continue;
    }

    try {
      await execute('product.product', 'unlink', [[v.id]], ctx);
      console.log(`  SİLİNDİ #${v.id}`);
      silinen.push(v.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  SİLİNEMEDİ #${v.id} — ${msg.slice(0, 120)}`);
      atlanan.push({ id: v.id, sebep: msg.slice(0, 120) });
    }
  }

  return { silinen, atlanan, korunan };
}

async function dogrulama() {
  console.log('\n=== DOĞRULAMA ===');

  const tmpl = (await execute('product.template', 'read', [[TMPL_ID]], {
    fields: ['id', 'active', 'name'],
    ...ctx,
  }))?.[0];
  console.log(`\nŞablon #${TMPL_ID}: active=${tmpl?.active} name="${tmpl?.name}"`);

  for (const variantId of GERCEK_VARYANT_IDS) {
    const v = (await execute('product.product', 'read', [[variantId]], {
      fields: ['id', 'barcode', 'active', 'display_name'],
      ...ctx,
    }))?.[0] as VariantRow;
    const lots = (await execute(
      'stock.lot',
      'search_read',
      [[['product_id', '=', variantId]]],
      { fields: ['id', 'name'], order: 'id asc', ...ctx },
    )) as LotRow[];
    const quants = (await execute(
      'stock.quant',
      'search_read',
      [[['product_id', '=', variantId], ['quantity', '>', 0]]],
      { fields: ['location_id', 'quantity', 'lot_id'], limit: 10, ...ctx },
    )) ?? [];

    console.log(`\nVaryant #${variantId} active=${v?.active} barcode=${v?.barcode}`);
    console.log(`  display: ${v?.display_name}`);
    console.log(`  lot (${lots.length}): ${lots.map((l) => `#${l.id}="${String(l.name).slice(0, 40)}"`).join(', ')}`);
    for (const q of quants) {
      console.log(`  stok: ${q.location_id?.[1]} qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'}`);
    }
  }

  const kalan = Number(await execute(
    'product.product',
    'search_count',
    [[['product_tmpl_id', '=', TMPL_ID]]],
    ctx,
  ));
  console.log(`\nKalan varyant sayısı (tmpl ${TMPL_ID}): ${kalan}`);
}

async function main() {
  console.log('=== ZAROSSI TEST ARTIGI TEMİZLİĞİ ===');
  console.log(`Mod: ${DRY_RUN ? 'DRY-RUN' : 'GERÇEK'}\n`);

  const lotSonuc = await temizleEskiLotlar();
  const sablonSonuc = await sablonuAktiflestir();
  const varyantSonuc = await temizleTestVaryantlari();

  if (!DRY_RUN) {
    await dogrulama();
  }

  console.log('\n=== ÖZET ===');
  console.log(`Silinen eski lot: ${lotSonuc.silinen.join(', ') || '—'}`);
  if (lotSonuc.atlanan.length) {
    console.log(`Atlanan eski lot: ${lotSonuc.atlanan.map((a) => `#${a.id} (${a.sebep})`).join('; ')}`);
  }
  console.log(`Şablon aktifleştirme: ${sablonSonuc.ok ? 'OK' : 'HATA'} (${sablonSonuc.yontem})`);
  console.log(`Silinen test varyant: ${varyantSonuc.silinen.length} → ${varyantSonuc.silinen.join(', ') || '—'}`);
  if (varyantSonuc.atlanan.length) {
    console.log(`Atlanan test varyant: ${varyantSonuc.atlanan.map((a) => `#${a.id} (${a.sebep})`).join('; ')}`);
  }
  console.log(`Korunan varyant: ${varyantSonuc.korunan.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
