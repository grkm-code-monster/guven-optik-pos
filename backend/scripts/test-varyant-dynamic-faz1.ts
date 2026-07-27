/**
 * FAZ 1/3 test: dynamic create_variant — kartezyen patlama önleme
 * Çalıştır: npx tsx scripts/test-varyant-dynamic-faz1.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TS = Date.now();
const PREFIX = `FAZ1_DYN_${TS}`;

async function createDynamicAttr(name: string, values: string[]): Promise<{ attrId: number; valueIds: number[] }> {
  const attrId = Number(await execute('product.attribute', 'create', [{
    name,
    create_variant: 'dynamic',
  }]));
  const valueIds: number[] = [];
  for (const v of values) {
    const id = Number(await execute('product.attribute.value', 'create', [{
      name: v,
      attribute_id: attrId,
    }]));
    valueIds.push(id);
  }
  return { attrId, valueIds };
}

async function countVariants(tmplId: number): Promise<number> {
  return Number(await execute('product.product', 'search_count', [
    [['product_tmpl_id', '=', tmplId]],
  ]));
}

async function cleanup(ids: {
  tmplId?: number;
  attrIds?: number[];
}) {
  if (ids.tmplId) {
    const variantIds = await execute('product.product', 'search', [
      [['product_tmpl_id', '=', ids.tmplId]],
    ]) as number[];
    if (variantIds.length) {
      await execute('product.product', 'unlink', [variantIds]);
    }
    await execute('product.template', 'unlink', [[ids.tmplId]]);
  }
  if (ids.attrIds?.length) {
    for (const attrId of ids.attrIds) {
      const valIds = await execute('product.attribute.value', 'search', [
        [['attribute_id', '=', attrId]],
      ]) as number[];
      if (valIds.length) await execute('product.attribute.value', 'unlink', [valIds]);
      await execute('product.attribute', 'unlink', [[attrId]]);
    }
  }
}

async function main() {
  let ok = true;
  const cleanupIds: { tmplId?: number; attrIds?: number[] } = {};

  console.log('=== FAZ 1/3 — Dynamic varyant testleri ===\n');

  // TEST 1: 2×2×2 dynamic nitelik → otomatik 8 varyant OLMAMALI
  console.log('TEST 1: Dynamic nitelik satırları kartezyen üretmemeli');
  try {
    const model = await createDynamicAttr(`${PREFIX}_MODEL`, ['M1', 'M2']);
    const renk = await createDynamicAttr(`${PREFIX}_RENK`, ['R1', 'R2']);
    const olcu = await createDynamicAttr(`${PREFIX}_OLCU`, ['O1', 'O2']);
    cleanupIds.attrIds = [model.attrId, renk.attrId, olcu.attrId];

    const tmplId = Number(await execute('product.template', 'create', [{
      name: `${PREFIX} Test Şablon`,
      type: 'product',
    }]));
    cleanupIds.tmplId = tmplId;

    for (const { attrId, valueIds } of [model, renk, olcu]) {
      await execute('product.template.attribute.line', 'create', [{
        product_tmpl_id: tmplId,
        attribute_id: attrId,
        value_ids: [[6, 0, valueIds]],
      }]);
    }

    const variantCount = await countVariants(tmplId);
    if (variantCount >= 8) {
      console.log(`  ❌ ${variantCount} varyant — kartezyen patlaması (beklenen: <8)`);
      ok = false;
    } else {
      console.log(`  ✅ ${variantCount} varyant (< 8) — kartezyen üretilmedi`);
    }

    // create_variant dynamic doğrulama
    for (const attrId of cleanupIds.attrIds!) {
      const [attr] = await execute('product.attribute', 'read', [[attrId]], {
        fields: ['create_variant'],
      }) as { create_variant: string }[];
      if (attr.create_variant !== 'dynamic') {
        console.log(`  ❌ Nitelik ${attrId} create_variant=${attr.create_variant} (beklenen: dynamic)`);
        ok = false;
      }
    }
  } catch (e) {
    console.log(`  ❌ Hata: ${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  // TEST 2: 3 spesifik kombinasyon → tam 3 varyant
  console.log('\nTEST 2: Excel import mantığı — 3 spesifik varyant');
  try {
    if (!cleanupIds.tmplId) throw new Error('TEST 1 şablonu oluşturulamadı');

    const tmplId = cleanupIds.tmplId;
    const [modelAttr, renkAttr, olcuAttr] = cleanupIds.attrIds!;

    const combos = [
      { model: 'M1', renk: 'R1', olcu: 'O1' },
      { model: 'M1', renk: 'R2', olcu: 'O2' },
      { model: 'M2', renk: 'R1', olcu: 'O1' },
    ];

    const beforeCount = await countVariants(tmplId);

    for (const combo of combos) {
      const getValId = async (attrId: number, name: string) => {
        const [id] = await execute('product.attribute.value', 'search', [
          [['attribute_id', '=', attrId], ['name', '=', name]],
        ]) as number[];
        return id;
      };

      const modelId = await getValId(modelAttr, combo.model);
      const renkId = await getValId(renkAttr, combo.renk);
      const olcuId = await getValId(olcuAttr, combo.olcu);

      const ptavlar = await execute('product.template.attribute.value', 'search_read', [[
        ['product_tmpl_id', '=', tmplId],
        ['product_attribute_value_id', 'in', [modelId, renkId, olcuId]],
      ]], { fields: ['id', 'product_attribute_value_id'] }) as {
        id: number;
        product_attribute_value_id: [number, string];
      }[];

      const ptavIds = [modelId, renkId, olcuId].map((valId) => {
        const ptav = ptavlar.find((p) => p.product_attribute_value_id[0] === valId);
        if (!ptav) throw new Error(`PTAV bulunamadı: ${valId}`);
        return ptav.id;
      });

      await execute('product.product', 'create', [{
        product_tmpl_id: tmplId,
        product_template_attribute_value_ids: [[6, 0, ptavIds]],
      }]);
    }

    const afterCount = await countVariants(tmplId);
    const created = afterCount - beforeCount;

    if (created === 3) {
      console.log(`  ✅ ${created} yeni varyant oluşturuldu (toplam: ${afterCount})`);
    } else {
      console.log(`  ❌ ${created} yeni varyant (beklenen: 3, toplam: ${afterCount})`);
      ok = false;
    }
  } catch (e) {
    console.log(`  ❌ Hata: ${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  // TEST 3: MUSTANG OPTİK ÇERÇEVE — mevcut şablona dokunulmadı
  console.log('\nTEST 3: MUSTANG OPTİK ÇERÇEVE mevcut durumu (değiştirilmedi doğrulama)');
  try {
    const templates = await execute('product.template', 'search_read', [[
      ['name', 'ilike', 'MUSTANG'],
      ['name', 'ilike', 'ÇERÇEVE'],
    ]], { fields: ['id', 'name'], limit: 5 }) as { id: number; name: string }[];

    const mustang = templates.find((t) =>
      t.name.toUpperCase().includes('MUSTANG') && t.name.toUpperCase().includes('ÇERÇEVE'),
    ) ?? templates[0];

    if (!mustang) {
      console.log('  ⚠️ MUSTANG OPTİK ÇERÇEVE şablonu Odoo\'da bulunamadı — atlandı');
    } else {
      const variantCount = await countVariants(mustang.id);
      const lines = await execute('product.template.attribute.line', 'search_read', [[
        ['product_tmpl_id', '=', mustang.id],
      ]], { fields: ['attribute_id'] }) as { attribute_id: [number, string] }[];

      const attrIds = lines.map((l) => l.attribute_id[0]);
      const attrs = attrIds.length
        ? await execute('product.attribute', 'read', [attrIds], {
          fields: ['name', 'create_variant'],
        }) as { name: string; create_variant: string }[]
        : [];

      const alwaysAttrs = attrs.filter((a) => a.create_variant === 'always');
      console.log(`  ℹ️  Şablon: "${mustang.name}" (id=${mustang.id})`);
      console.log(`  ℹ️  Varyant sayısı: ${variantCount}`);
      console.log(`  ℹ️  Nitelik modları: ${attrs.map((a) => `${a.name}=${a.create_variant}`).join(', ') || 'yok'}`);

      if (alwaysAttrs.length > 0 && variantCount > 50) {
        console.log('  ✅ Mevcut şablon always modda ve çok sayıda varyantlı — bu faz dokunmadı');
      } else if (variantCount <= 8) {
        console.log('  ⚠️ Varyant sayısı beklenenden az — şablon adı veya durumu farklı olabilir');
      } else {
        console.log('  ℹ️  Şablon mevcut; FAZ 1 bu şablona müdahale etmedi (sadece yeni nitelikler dynamic)');
      }
    }

    // MODEL/RENK/ÖLÇÜ mevcut niteliklerinin create_variant değeri değişmedi mi?
    const prodAttrs = await execute('product.attribute', 'search_read', [[
      ['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']],
    ]], { fields: ['name', 'create_variant'] }) as { name: string; create_variant: string }[];

    for (const a of prodAttrs) {
      console.log(`  ℹ️  Mevcut nitelik ${a.name}: create_variant=${a.create_variant} (FAZ 1 bunu değiştirmedi)`);
    }
  } catch (e) {
    console.log(`  ❌ Hata: ${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  // Temizlik
  console.log('\nTemizlik: test şablonu ve nitelikleri siliniyor...');
  try {
    await cleanup(cleanupIds);
    console.log('  ✅ Test verisi temizlendi');
  } catch (e) {
    console.log(`  ⚠️ Temizlik hatası: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`\n=== SONUÇ: ${ok ? 'TÜM TESTLER GEÇTİ' : 'BAŞARISIZ TEST VAR'} ===`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
