/**
 * Stok Yönetimi ürün arşivleme testleri
 * npx ts-node --transpile-only backend/scripts/test-stok-urun-arsivleme.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  listStokUrunleri,
  topluUrunArsivdenCikar,
  topluUrunArsivle,
} from '../src/modules/admin/stok-yonetimi.service';

const OPTELLI_BARKODLAR = ['8682037201319', '8682037201630', '8682037200190'];

async function findTemplatesByBarcode(barcodes: string[]) {
  const variants = (await execute(
    'product.product',
    'search_read',
    [[['barcode', 'in', barcodes]]],
    { fields: ['id', 'barcode', 'product_tmpl_id', 'active'], context: { active_test: false }, limit: 20 },
  )) ?? [];
  const tmplIds = [...new Set(variants.map((v: any) => (Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id)))];
  const templates = tmplIds.length
    ? await execute('product.template', 'read', [tmplIds], {
        fields: ['id', 'name', 'active', 'product_variant_count'],
        context: { active_test: false },
      })
    : [];
  return { variants, templates };
}

async function variantActiveMap(tmplId: number) {
  const variants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'barcode', 'active'], context: { active_test: false }, limit: 50 },
  )) ?? [];
  return variants.map((v: any) => ({ id: v.id, barcode: v.barcode || '', active: !!v.active }));
}

async function stockMoveCount(tmplId: number) {
  const variants = (await execute(
    'product.product',
    'search',
    [[['product_tmpl_id', '=', tmplId]]],
    { context: { active_test: false }, limit: 50 },
  )) ?? [];
  if (!variants.length) return 0;
  return execute('stock.move.line', 'search_count', [[['product_id', 'in', variants]]]);
}

async function satisArama(q: string) {
  const domain = [
    ['type', 'in', ['product', 'consu']],
    ['active', '=', true],
    '|',
    ['name', 'ilike', q],
    ['default_code', 'ilike', q],
  ];
  return execute('product.template', 'search_read', [domain], {
    fields: ['id', 'name', 'default_code'],
    limit: 20,
  });
}

async function main() {
  console.log('=== OPTELLİ şablonları bul ===');
  const { variants, templates } = await findTemplatesByBarcode(OPTELLI_BARKODLAR);
  console.log('Varyant sayısı:', variants.length);
  for (const v of variants) {
    const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id;
    console.log(`  varyant ${v.id} barkod=${v.barcode} tmpl=${tmplId} active=${v.active}`);
  }
  for (const t of templates ?? []) {
    console.log(`  tmpl ${t.id}: ${t.name} active=${t.active} varyant=${t.product_variant_count}`);
  }
  const tmplIds = [...new Set((templates ?? []).map((t: any) => t.id))];
  if (variants.length !== 3) {
    console.warn('UYARI: 3 barkod varyantı bulunamadı, bulunan:', variants.length);
  }

  console.log('\n=== TEST 0: 3 OPTELLİ kaydını arşivle ===');
  const arsivSonuc = await topluUrunArsivle(tmplIds);
  console.log('Arşiv sonucu:', arsivSonuc.basarili, '/', arsivSonuc.toplam, arsivSonuc.sonuclar);

  console.log('\n=== TEST 1: Aktif listede görünmemeli ===');
  for (const barkod of OPTELLI_BARKODLAR) {
    const aktif = await listStokUrunleri({ q: barkod, durum: 'aktif', limit: 50 });
    const found = aktif.data.some((r) => r.icReferans.includes(barkod) || r.urunAdi.includes('OPTELL'));
    console.log(`  barkod ${barkod}: aktif listede ${found ? 'VAR (HATA)' : 'YOK (OK)'}`);
  }

  console.log('\n=== TEST 2: Arşiv görünümünde görünmeli ===');
  const arsivListe = await listStokUrunleri({ q: 'OPTELL', durum: 'arsiv', limit: 50 });
  console.log('Arşiv OPTELL kayıt sayısı:', arsivListe.data.filter((r) => r.urunAdi.includes('OPTELL')).length);
  for (const id of tmplIds) {
    const row = arsivListe.data.find((r) => r.id === id);
    console.log(`  tmpl ${id}: ${row ? 'arşivde OK' : 'arşivde YOK (HATA)'}`);
  }

  console.log('\n=== TEST 3: Birini arşivden çıkar ===');
  const restoreId = tmplIds[0];
  if (restoreId) {
    const restore = await topluUrunArsivdenCikar([restoreId]);
    console.log('Geri çıkarma:', restore);
    const aktifTek = await listStokUrunleri({ q: 'OPTELL', durum: 'aktif', limit: 50 });
    const restored = aktifTek.data.some((r) => r.id === restoreId);
    console.log(`  tmpl ${restoreId} aktif listede: ${restored ? 'OK' : 'HATA'}`);
    await topluUrunArsivle([restoreId]);
    console.log(`  tmpl ${restoreId} tekrar arşivlendi (test temizliği)`);
  }

  console.log('\n=== TEST 4: Varyantlı şablon arşivleme ===');
  const varyantli = (await execute(
    'product.template',
    'search_read',
    [[['product_variant_count', '>', 1], ['active', '=', true]]],
    { fields: ['id', 'name', 'product_variant_count'], limit: 1 },
  ))?.[0];
  if (varyantli) {
    console.log(`  Test şablon: ${varyantli.id} ${varyantli.name} (${varyantli.product_variant_count} varyant)`);
    const once = await variantActiveMap(varyantli.id);
    await topluUrunArsivle([varyantli.id]);
    const sonra = await variantActiveMap(varyantli.id);
    const tmpl = (await execute('product.template', 'read', [[varyantli.id]], {
      fields: ['active'],
      context: { active_test: false },
    }))?.[0];
    console.log(`  template active=${tmpl?.active}`);
    console.log(`  varyantlar: önce aktif=${once.filter((v) => v.active).length}/${once.length}, sonra aktif=${sonra.filter((v) => v.active).length}/${sonra.length}`);
    const hepsiPasif = !tmpl?.active && sonra.every((v) => !v.active);
    console.log(`  Tüm varyantlar arşivlendi: ${hepsiPasif ? 'OK' : 'KONTROL GEREK'}`);
    await topluUrunArsivdenCikar([varyantli.id]);
    console.log('  Test şablon geri aktifleştirildi');
  } else {
    console.log('  Varyantlı aktif şablon bulunamadı, atlandı');
  }

  console.log('\n=== TEST 5: Stok geçmişi korunuyor mu ===');
  const testTmpl = tmplIds[0];
  if (testTmpl) {
    const moves = await stockMoveCount(testTmpl);
    console.log(`  tmpl ${testTmpl} stock.move.line kayıt sayısı: ${moves} (0 değilse geçmiş korunuyor)`);
  }

  console.log('\n=== TEST 6: Satış aramasında çıkmamalı ===');
  for (const barkod of OPTELLI_BARKODLAR) {
    const satis = await satisArama(barkod);
    const found = (satis ?? []).some((r: any) => String(r.default_code || '').includes(barkod));
    console.log(`  barkod ${barkod}: satış aramasında ${found ? 'VAR (HATA)' : 'YOK (OK)'}`);
  }

  console.log('\n=== Bitti ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
