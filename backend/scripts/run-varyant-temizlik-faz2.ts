/**
 * FAZ 2: Onaylanmış JSON'daki gereksiz varyantları Odoo'dan siler.
 * Çalıştır: npx tsx scripts/run-varyant-temizlik-faz2.ts [--json path] [--dry-run]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute } from '../src/modules/odoo/odoo.service';

const BATCH_SIZE = 100;
const JSON_PATH = resolve(process.cwd(), 'varyant-temizlik-dry-run.json');
const DRY_RUN = process.argv.includes('--dry-run');

const jsonArgIdx = process.argv.indexOf('--json');
const jsonPath = jsonArgIdx >= 0 ? resolve(process.argv[jsonArgIdx + 1]) : JSON_PATH;

const TMPL_IDS = [1, 91, 93, 94, 1895, 1896];
const KORUNMALI_BEKLENEN = [2, 3, 4, 6, 4165, 4172, 2356];

type DryRunJson = {
  silinebilirIdsFlat: number[];
  korunmaliVaryantlar: { odooId: number }[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function halaSilinebilirMi(id: number): Promise<{ ok: boolean; sebep?: string }> {
  const rows = await execute(
    'product.product', 'search_read',
    [[['id', '=', id]]],
    { fields: ['id', 'default_code', 'barcode'], limit: 1 },
  ) as { id: number; default_code: string | false; barcode: string | false }[];

  if (!rows.length) return { ok: false, sebep: 'kayit_yok' };

  const v = rows[0];
  if (v.default_code) return { ok: false, sebep: 'icReferans_var' };
  if (v.barcode) return { ok: false, sebep: 'barkod_var' };

  const stokRows = await execute(
    'stock.quant', 'search_read',
    [[['product_id', '=', id], ['quantity', '>', 0]]],
    { fields: ['quantity'], limit: 1 },
  ) as { quantity: number }[];
  const stok = stokRows.reduce((s, r) => s + Number(r.quantity), 0);
  if (stok > 0) return { ok: false, sebep: `stok_var(${stok})` };

  const checks: [string, string][] = [
    ['sale.order.line', 'satis'],
    ['stock.move.line', 'stokHareket'],
    ['account.move.line', 'fatura'],
    ['purchase.order.line', 'satinalma'],
  ];
  for (const [model, label] of checks) {
    const count = Number(await execute(model, 'search_count', [[['product_id', '=', id]]]));
    if (count > 0) return { ok: false, sebep: `${label}(${count})` };
  }

  return { ok: true };
}

async function countTemplateVariants(tmplId: number): Promise<number> {
  return Number(await execute('product.product', 'search_count', [
    [['product_tmpl_id', '=', tmplId]],
  ]));
}

async function main() {
  console.log('=== FAZ 2 — Varyant Temizlik ===');
  console.log(`JSON: ${jsonPath}`);
  console.log(`Mod: ${DRY_RUN ? 'DRY-RUN (silme yok)' : 'GERÇEK SİLME'}\n`);

  const raw = readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw) as DryRunJson;
  const silinebilir = [...new Set(data.silinebilirIdsFlat.map(Number))];
  const korunmali = [...new Set(data.korunmaliVaryantlar.map((k) => Number(k.odooId)))];

  console.log(`JSON silinebilir: ${silinebilir.length}`);
  console.log(`JSON korunmali: ${korunmali.length}`);

  const kesisim = silinebilir.filter((id) => korunmali.includes(id));
  if (kesisim.length > 0) {
    console.error('❌ DUR — silme/koruma listesi kesişiyor:', kesisim);
    process.exit(1);
  }
  console.log('✅ Kesişim kontrolü: boş');

  const korunmaliFark = KORUNMALI_BEKLENEN.filter((id) => !korunmali.includes(id));
  if (korunmaliFark.length) {
    console.warn('⚠️ Beklenen koruma ID farkı:', korunmaliFark);
  }

  console.log('\n--- ADIM 1: Anlık durum yeniden kontrol ---');
  const silinecek: number[] = [];
  const cikarilan: { id: number; sebep: string }[] = [];

  for (const id of silinebilir) {
    const sonuc = await halaSilinebilirMi(id);
    if (sonuc.ok) silinecek.push(id);
    else cikarilan.push({ id, sebep: sonuc.sebep ?? 'bilinmiyor' });
  }

  console.log(`Onaylı silme listesi: ${silinecek.length}`);
  console.log(`JSON'dan çıkarılan (durum değişmiş): ${cikarilan.length}`);
  if (cikarilan.length) {
    console.log('Çıkarılan örnekler (ilk 20):');
    cikarilan.slice(0, 20).forEach((c) => console.log(`  #${c.id} — ${c.sebep}`));
  }

  if (silinecek.some((id) => korunmali.includes(id))) {
    console.error('❌ DUR — final listede korunan ID var');
    process.exit(1);
  }

  let silinen = 0;
  const silinemedi: { batch: number; ids: number[]; hata: string }[] = [];
  const batches = chunk(silinecek, BATCH_SIZE);

  console.log(`\n--- ADIM 2: Toplu silme (${batches.length} batch, ${BATCH_SIZE}/batch) ---`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (DRY_RUN) {
      silinen += batch.length;
      process.stderr.write(`[dry-run] batch ${i + 1}/${batches.length}: ${batch.length} ID\n`);
      continue;
    }

    try {
      const result = await execute('product.product', 'unlink', [batch]);
      if (result === false) {
        throw new Error('unlink false döndü');
      }
      silinen += batch.length;
      process.stderr.write(`✓ batch ${i + 1}/${batches.length}: ${batch.length} silindi (toplam ${silinen})\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      silinemedi.push({ batch: i + 1, ids: batch, hata: msg.slice(0, 500) });
      console.error(`\n❌ Batch ${i + 1} HATA — durduruldu`);
      console.error(`   IDs: ${batch.slice(0, 10).join(', ')}${batch.length > 10 ? '...' : ''}`);
      console.error(`   Hata: ${msg}`);
      break;
    }
  }

  console.log('\n--- ADIM 3: Doğrulama ---');
  const sablonSayilari: { tmplId: number; kalan: number }[] = [];
  for (const tmplId of TMPL_IDS) {
    const kalan = await countTemplateVariants(tmplId);
    sablonSayilari.push({ tmplId, kalan });
  }

  const korunanDurum: { id: number; mevcut: boolean; name?: string }[] = [];
  for (const id of korunmali) {
    const rows = await execute(
      'product.product', 'search_read',
      [[['id', '=', id]]],
      { fields: ['id', 'display_name'], limit: 1 },
    ) as { id: number; display_name: string }[];
    korunanDurum.push({
      id,
      mevcut: rows.length > 0,
      name: rows[0]?.display_name,
    });
  }

  const mustang = sablonSayilari.find((s) => s.tmplId === 1896);

  console.log('\n=== SONUÇ ===');
  console.log(`Silinmesi planlanan: ${silinecek.length}`);
  console.log(`Gerçekten silinen: ${silinen}`);
  console.log(`JSON'dan çıkarılan (durum değişmiş): ${cikarilan.length}`);
  console.log(`Silinemedi batch: ${silinemedi.length}`);

  console.log('\nŞablon varyant sayıları:');
  for (const s of sablonSayilari) {
    console.log(`  tmpl ${s.tmplId}: ${s.kalan} varyant`);
  }
  console.log(`\nMUSTANG OPTİK ÇERÇEVE (1896): ${mustang?.kalan ?? '?'} varyant (önceki: 1350)`);

  console.log('\nKorunan 7 varyant:');
  for (const k of korunanDurum) {
    console.log(`  #${k.id} ${k.mevcut ? '✅ mevcut' : '❌ EKSİK'} ${k.name ?? ''}`);
  }

  const korunanHepsiMevcut = korunanDurum.every((k) => k.mevcut);
  if (!korunanHepsiMevcut) {
    console.error('\n❌ Korunan varyantlardan biri eksik!');
    process.exit(1);
  }

  if (silinemedi.length > 0) {
    console.error('\n⚠️ Silme yarıda kaldı — silinemedi batch raporu:');
    silinemedi.forEach((b) => console.error(JSON.stringify(b)));
    process.exit(1);
  }

  console.log('\n✅ FAZ 2 tamamlandı');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
