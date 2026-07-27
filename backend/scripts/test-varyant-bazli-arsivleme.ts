/**
 * Varyant bazlı arşivleme testleri
 * npx ts-node --transpile-only backend/scripts/test-varyant-bazli-arsivleme.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  topluVaryantArsivdenCikar,
  topluVaryantArsivle,
} from '../src/modules/admin/stok-yonetimi.service';

const inactiveCtx = { context: { active_test: false } };

async function readVariant(id: number) {
  const rows = await execute('product.product', 'read', [[id]], {
    fields: ['id', 'barcode', 'active', 'product_tmpl_id'],
    ...inactiveCtx,
  });
  return rows?.[0] as { id: number; barcode: string; active: boolean; product_tmpl_id: [number, string] };
}

async function readTemplate(id: number) {
  const rows = await execute('product.template', 'read', [[id]], {
    fields: ['id', 'name', 'active'],
    ...inactiveCtx,
  });
  return rows?.[0] as { id: number; name: string; active: boolean };
}

async function satisAramaBarkod(barkod: string) {
  const rows = await execute(
    'product.product',
    'search_read',
    [[['barcode', '=', barkod], ['active', '=', true]]],
    { fields: ['id', 'barcode'], limit: 5 },
  );
  return rows ?? [];
}

async function findOptelliTemplate() {
  const tmpls = await execute(
    'product.template',
    'search_read',
    [[['name', 'ilike', 'OPTELL%'], ['active', 'in', [true, false]]]],
    { fields: ['id', 'name', 'active'], limit: 5, ...inactiveCtx },
  ) as Array<{ id: number; name: string; active: boolean }>;
  const tmpl = tmpls.find((t) => t.name.includes('OPTELL')) ?? tmpls[0];
  if (!tmpl) throw new Error('OPTELLİ şablon bulunamadı');
  return tmpl;
}

async function loadVariants(tmplId: number) {
  return execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', tmplId], ['active', 'in', [true, false]]]],
    {
      fields: ['id', 'barcode', 'active', 'product_template_attribute_value_ids'],
      limit: 20,
      ...inactiveCtx,
    },
  ) as Array<{ id: number; barcode: string; active: boolean; product_template_attribute_value_ids: number[] }>;
}

async function variantLabel(v: { product_template_attribute_value_ids: number[] }) {
  const ptavIds = v.product_template_attribute_value_ids ?? [];
  if (!ptavIds.length) return `id=${(v as any).id}`;
  const ptavs = await execute(
    'product.template.attribute.value',
    'read',
    [ptavIds],
    { fields: ['attribute_id', 'product_attribute_value_id'] },
  ) as Array<{ attribute_id: [number, string]; product_attribute_value_id: [number, string] }>;
  return ptavs.map((p) => `${p.attribute_id[1]}: ${p.product_attribute_value_id[1]}`).join(' / ');
}

async function main() {
  const tmpl = await findOptelliTemplate();
  console.log('Şablon:', tmpl.id, tmpl.name, 'active=', tmpl.active);

  if (!tmpl.active) {
    console.log('Şablon arşivde — test için aktifleştiriliyor...');
    await execute('product.template', 'write', [[tmpl.id], { active: true }], inactiveCtx);
  }

  let variants = await loadVariants(tmpl.id);
  console.log('Varyant sayısı:', variants.length);
  for (const v of variants) {
    console.log(`  ${v.id} barkod=${v.barcode} active=${v.active} | ${await variantLabel(v)}`);
  }

  const target = variants.find((v) => v.active !== false) ?? variants[0];
  if (!target) throw new Error('Test varyantı yok');

  console.log('\n=== TEST 1: Tek varyant arşivle ===');
  console.log('Hedef varyant:', target.id, target.barcode);
  await topluVaryantArsivle([target.id]);

  const tmplAfter = await readTemplate(tmpl.id);
  variants = await loadVariants(tmpl.id);
  const archived = variants.find((v) => v.id === target.id);
  const siblings = variants.filter((v) => v.id !== target.id);

  console.log('Şablon active:', tmplAfter.active, tmplAfter.active ? 'OK' : 'HATA');
  console.log('Hedef varyant active:', archived?.active, archived?.active === false ? 'OK' : 'HATA');
  console.log('Kardeş varyantlar:', siblings.map((s) => `${s.id}=${s.active}`).join(', '));
  const siblingsOk = siblings.every((s) => s.active !== false);
  console.log('Kardeşler etkilenmedi:', siblingsOk ? 'OK' : 'HATA');

  console.log('\n=== TEST 2: Arşivli varyant listede görünür ===');
  console.log('API benzeri sorgu — arşivli dahil:', variants.some((v) => v.id === target.id && v.active === false) ? 'OK' : 'HATA');

  console.log('\n=== TEST 4: Satış araması — arşivli barkod çıkmamalı, diğerleri çıkmalı ===');
  const archivedSearch = await satisAramaBarkod(target.barcode);
  console.log(`  Arşivli barkod ${target.barcode}:`, archivedSearch.length === 0 ? 'YOK OK' : 'VAR HATA');
  for (const s of siblings.filter((x) => x.barcode)) {
    const found = await satisAramaBarkod(s.barcode);
    console.log(`  Aktif barkod ${s.barcode}:`, found.length > 0 ? 'VAR OK' : 'YOK HATA');
  }

  console.log('\n=== TEST 3: Arşivden çıkar ===');
  await topluVaryantArsivdenCikar([target.id]);
  const restored = await readVariant(target.id);
  console.log('Geri çıkarıldı active=', restored.active, restored.active ? 'OK' : 'HATA');

  console.log('\n=== Bitti ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
