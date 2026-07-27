/**
 * FAZ 3 test: import sonrası otomatik varyant temizliği
 * Çalıştır: npx tsx scripts/test-varyant-import-temizlik-faz3.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  ptavKey,
  temizleImportSonrasiVaryantlar,
} from '../src/modules/admin/varyant-import-temizlik.service';

const MUSTANG_TMPL = 1896;
const KORUNAN_ID = 4165;

async function countVariants(tmplId: number): Promise<number> {
  return Number(await execute('product.product', 'search_count', [
    [['product_tmpl_id', '=', tmplId]],
  ]));
}

async function variantExists(id: number): Promise<boolean> {
  return Number(await execute('product.product', 'search_count', [[['id', '=', id]]])) > 0;
}

type PtavCombo = { ptavIds: number[]; key: string };

async function listUnusedPtavCombos(tmplId: number, limit: number): Promise<PtavCombo[]> {
  const lines = await execute('product.template.attribute.line', 'search_read', [[
    ['product_tmpl_id', '=', tmplId],
  ]], { fields: ['attribute_id', 'value_ids'], limit: 10 }) as {
    attribute_id: [number, string]; value_ids: number[];
  }[];

  const modelLine = lines.find((l) => l.attribute_id[1] === 'MODEL');
  const renkLine = lines.find((l) => l.attribute_id[1] === 'RENK');
  const olcuLine = lines.find((l) => l.attribute_id[1] === 'ÖLÇÜ');
  if (!modelLine || !renkLine || !olcuLine) throw new Error('MODEL/RENK/ÖLÇÜ satırı eksik');

  const mevcut = await execute('product.product', 'search_read', [[
    ['product_tmpl_id', '=', tmplId],
  ]], { fields: ['product_template_attribute_value_ids'], limit: 5000 }) as {
    product_template_attribute_value_ids: number[];
  }[];
  const mevcutKeys = new Set(
    mevcut.map((v) => ptavKey(v.product_template_attribute_value_ids ?? [])),
  );

  const combos: PtavCombo[] = [];
  const sampleModels = modelLine.value_ids.slice(0, 4);
  const sampleRenks = renkLine.value_ids.slice(0, 3);
  const sampleOlculer = olcuLine.value_ids.slice(0, 3);

  for (const modelVal of sampleModels) {
    for (const renkVal of sampleRenks) {
      for (const olcuVal of sampleOlculer) {
        const ptavlar = await execute('product.template.attribute.value', 'search_read', [[
          ['product_tmpl_id', '=', tmplId],
          ['product_attribute_value_id', 'in', [modelVal, renkVal, olcuVal]],
        ]], { fields: ['id', 'product_attribute_value_id'] }) as {
          id: number; product_attribute_value_id: [number, string];
        }[];
        if (ptavlar.length < 3) continue;
        const ptavIds = [modelVal, renkVal, olcuVal].map((valId) => {
          const p = ptavlar.find((x) => x.product_attribute_value_id[0] === valId);
          return p!.id;
        });
        const key = ptavKey(ptavIds);
        if (mevcutKeys.has(key)) continue;
        combos.push({ ptavIds, key });
        if (combos.length >= limit) return combos;
      }
    }
  }
  return combos;
}

async function createVariant(tmplId: number, ptavIds: number[]): Promise<number> {
  return Number(await execute('product.product', 'create', [{
    product_tmpl_id: tmplId,
    product_template_attribute_value_ids: [[6, 0, ptavIds]],
    lst_price: 0,
  }]));
}

async function main() {
  let ok = true;
  console.log('=== FAZ 3 — Import sonrası otomatik temizlik testi ===\n');
  console.log('Not: MUSTANG always-modda attribute line write limiti nedeniyle');
  console.log('     kartezyen patlaması product.product.create ile simüle edilir.\n');

  const baslangic = await countVariants(MUSTANG_TMPL);
  console.log(`MUSTANG başlangıç: ${baslangic} varyant`);

  if (!(await variantExists(KORUNAN_ID))) {
    console.error(`❌ Korunan #${KORUNAN_ID} yok`);
    process.exit(1);
  }

  const unused = await listUnusedPtavCombos(MUSTANG_TMPL, 6);
  if (unused.length < 2) {
    console.error('❌ Yeterli boş PTAV kombinasyonu bulunamadı');
    process.exit(1);
  }

  const importCombo = unused[0];
  const junkCombos = unused.slice(1, 5);

  const korunanPtavKeys = new Set<string>([importCombo.key]);
  const korunanVaryantIds = new Set<number>();

  // Mevcut korunmalı varyantların ptav key'lerini de koru (import satırı olarak)
  const mevcutVaryantlar = await execute('product.product', 'search_read', [[
    ['product_tmpl_id', '=', MUSTANG_TMPL],
  ]], { fields: ['id', 'product_template_attribute_value_ids'], limit: 50 }) as {
    id: number; product_template_attribute_value_ids: number[];
  }[];
  for (const v of mevcutVaryantlar) {
    korunanPtavKeys.add(ptavKey(v.product_template_attribute_value_ids ?? []));
    korunanVaryantIds.add(v.id);
  }

  // Import hedef kombinasyonu oluştur
  const importVaryantId = await createVariant(MUSTANG_TMPL, importCombo.ptavIds);
  korunanVaryantIds.add(importVaryantId);
  console.log(`Import hedef varyant oluşturuldu: #${importVaryantId}`);

  // Kartezyen artışını simüle et (always modda line write sonrası oluşan fazlalıklar)
  const junkIds: number[] = [];
  for (const junk of junkCombos) {
    junkIds.push(await createVariant(MUSTANG_TMPL, junk.ptavIds));
  }
  const patlamaSonrasi = await countVariants(MUSTANG_TMPL);
  console.log(`Kartezyen simülasyonu: ${baslangic} → ${patlamaSonrasi} (+${patlamaSonrasi - baslangic} junk)`);

  const temizlik = await temizleImportSonrasiVaryantlar(
    MUSTANG_TMPL,
    korunanPtavKeys,
    korunanVaryantIds,
  );

  const son = await countVariants(MUSTANG_TMPL);
  const beklenen = baslangic + 1;

  console.log('\nTEST 1: Temizlik sonrası varyant sayısı');
  if (son === beklenen) {
    console.log(`  ✅ ${son} varyant (beklenen: ${beklenen})`);
  } else {
    console.log(`  ❌ ${son} varyant (beklenen: ${beklenen})`);
    ok = false;
  }
  console.log(`  Otomatik temizlenen: ${temizlik.temizlenen} (junk: ${junkIds.length})`);
  if (temizlik.temizlenen >= junkIds.length) {
    console.log('  ✅ Junk varyantlar temizlendi');
  } else {
    console.log(`  ❌ Eksik temizlik (silinemedi: ${temizlik.silinemedi.length})`);
    ok = false;
  }

  console.log('\nTEST 2: Korunan stoklu varyant #4165');
  if (await variantExists(KORUNAN_ID)) {
    console.log('  ✅ #4165 hâlâ mevcut');
  } else {
    console.log('  ❌ #4165 silindi');
    ok = false;
  }

  if (await variantExists(importVaryantId)) {
    console.log(`  ✅ Import hedef #${importVaryantId} korundu`);
  } else {
    console.log(`  ❌ Import hedef #${importVaryantId} silindi`);
    ok = false;
  }

  console.log(`\n=== SONUÇ: ${ok ? 'GEÇTİ' : 'BAŞARISIZ'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
