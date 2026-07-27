/**
 * Kategori ikilenmesi önleme testleri
 * npx ts-node --transpile-only backend/scripts/test-kategori-ikilenmesi-onleme.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  findExistingCategoryMatch,
  normalizeCategoryLabel,
  resolveOrCreateCategoryId,
} from '../src/modules/odoo/odoo-category.util';
import { createEnvanterSablon } from '../src/modules/admin/odoo-varyant-import.service';

const TS = Date.now();

async function countCategoriesByNormalized(label: string): Promise<number> {
  const all = await execute('product.category', 'search_read', [[]], {
    fields: ['id', 'name', 'complete_name'],
    limit: 5000,
  }) as Array<{ id: number; name: string; complete_name: string }>;
  const norm = normalizeCategoryLabel(label);
  return all.filter((c) =>
    normalizeCategoryLabel(c.name) === norm
    || normalizeCategoryLabel(c.complete_name) === norm
    || normalizeCategoryLabel(c.complete_name.split('/').pop()?.trim() ?? '') === norm,
  ).length;
}

async function findSampleCategory(): Promise<{ id: number; name: string; complete_name: string }> {
  const rows = await execute(
    'product.category',
    'search_read',
    [[['name', 'ilike', 'çerçeve']]],
    { fields: ['id', 'name', 'complete_name'], limit: 5 },
  ) as Array<{ id: number; name: string; complete_name: string }>;
  if (rows[0]) return rows[0];
  const fallback = await execute(
    'product.category',
    'search_read',
    [[]],
    { fields: ['id', 'name', 'complete_name'], limit: 1, order: 'id desc' },
  ) as Array<{ id: number; name: string; complete_name: string }>;
  if (!fallback[0]) throw new Error('Odoo kategori bulunamadı');
  return fallback[0];
}

async function main() {
  const sample = await findSampleCategory();
  console.log('Örnek kategori:', sample.id, sample.name, '|', sample.complete_name);

  const variants = [
    sample.name,
    ` ${sample.name} `,
    sample.name.toLocaleUpperCase('tr-TR'),
    sample.name.toLocaleLowerCase('tr-TR'),
  ];

  console.log('\n=== TEST 1: resolveOrCreateCategoryId — yeni kategori oluşmamalı ===');
  for (const v of variants) {
    const before = await countCategoriesByNormalized(sample.name);
    const resolved = await resolveOrCreateCategoryId(v);
    const after = await countCategoriesByNormalized(sample.name);
    console.log(
      `  "${v}" → id=${resolved.id} match=${resolved.matchType} count ${before}→${after}`,
      after === before && resolved.id === sample.id ? 'OK' : 'HATA',
    );
  }

  console.log('\n=== TEST 1b: createEnvanterSablon — aynı kategori kullanılmalı ===');
  const beforeTmpl = await countCategoriesByNormalized(sample.name);
  const tmplId = await createEnvanterSablon({
    kategori: ` ${sample.name.toLocaleLowerCase('tr-TR')} `,
    urunAdi: `TEST KATEGORI IKILENME ${TS}`,
    satisFiyati: 100,
    maliyetFiyati: 50,
  });
  const tmpl = (await execute('product.template', 'read', [[tmplId]], {
    fields: ['id', 'categ_id'],
  }))?.[0] as { id: number; categ_id: [number, string] };
  const afterTmpl = await countCategoriesByNormalized(sample.name);
  console.log(
    `  tmpl ${tmplId} categ_id=${tmpl?.categ_id?.[0]} (beklenen ${sample.id}) count ${beforeTmpl}→${afterTmpl}`,
    tmpl?.categ_id?.[0] === sample.id && afterTmpl === beforeTmpl ? 'OK' : 'HATA',
  );
  await execute('product.template', 'unlink', [[tmplId]]);

  console.log('\n=== TEST 2: findExistingCategoryMatch — yakın eşleşme uyarısı ===');
  const existsCheck = await findExistingCategoryMatch(` ${sample.name.toLocaleUpperCase('tr-TR')} `);
  console.log('  matchType:', existsCheck.matchType, 'id:', existsCheck.match?.id);
  console.log('  category-exists uyarısı tetiklenir mi?', existsCheck.match ? 'EVET OK' : 'HATA');

  console.log('\n=== TEST 3: Gerçekten yeni isim — oluşturma bozulmamalı ===');
  const yeniAd = `TEST YENI KAT ${TS}`;
  const beforeNew = await execute('product.category', 'search_count', [[['name', '=', yeniAd]]]);
  const created = await resolveOrCreateCategoryId(yeniAd);
  const afterNew = await execute('product.category', 'search_count', [[['name', '=', yeniAd]]]);
  console.log(
    `  "${yeniAd}" match=${created.matchType} id=${created.id} count ${beforeNew}→${afterNew}`,
    created.matchType === 'created' && afterNew === beforeNew + 1 ? 'OK' : 'HATA',
  );
  await execute('product.category', 'unlink', [[created.id]]);

  console.log('\n=== Bitti ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
