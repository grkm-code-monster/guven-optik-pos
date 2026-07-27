/**
 * ZAROSSI barkod teşhisi — sadece okuma, kod değişikliği yok
 * npx ts-node --transpile-only backend/scripts/teşhis-zarossi-barkod.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { ARCHIVE_DELETE_PREFIX } from '../src/modules/admin/archive-barcode.util';

const BARKODLAR = ['22442529', '22442680', '22442697', '86932839003381'];
const ctx = { context: { active_test: false } };

async function findByBarcode(barkod: string) {
  const exact = (await execute(
    'product.product',
    'search_read',
    [[['barcode', '=', barkod]]],
    {
      fields: ['id', 'display_name', 'barcode', 'active', 'product_tmpl_id'],
      ...ctx,
    },
  )) ?? [];

  const prefixed = (await execute(
    'product.product',
    'search_read',
    [[['barcode', '=', `${ARCHIVE_DELETE_PREFIX}${barkod}`]]],
    {
      fields: ['id', 'display_name', 'barcode', 'active', 'product_tmpl_id'],
      ...ctx,
    },
  )) ?? [];

  return { exact, prefixed };
}

async function lotsAndQuants(productId: number) {
  const lots = (await execute(
    'stock.lot',
    'search_read',
    [[['product_id', '=', productId]]],
    { fields: ['id', 'name', 'x_uts_kodu', 'ref'], limit: 20, ...ctx },
  )) ?? [];

  const quants = (await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', productId], ['quantity', '!=', 0]]],
    { fields: ['location_id', 'quantity', 'lot_id'], limit: 20, ...ctx },
  )) ?? [];

  return { lots, quants };
}

async function main() {
  console.log('=== ZAROSSI BARKOD TEŞHİSİ ===\n');
  console.log(`Tarih: ${new Date().toISOString()}\n`);

  let toplamAktifOrijinal = 0;
  let toplamArsivPrefixed = 0;

  for (const barkod of BARKODLAR) {
    console.log(`--- Barkod: ${barkod} ---`);
    const { exact, prefixed } = await findByBarcode(barkod);
    console.log(`  Orijinal barkod (${barkod}): ${exact.length} kayıt`);
    for (const p of exact) {
      console.log(`    #${p.id} active=${p.active} | ${p.display_name}`);
      toplamAktifOrijinal += p.active ? 1 : 0;
      const { lots, quants } = await lotsAndQuants(p.id);
      console.log(`      lot: ${lots.length}, quant (≠0): ${quants.length}`);
      for (const l of lots.slice(0, 3)) {
        console.log(`        lot#${l.id} name="${String(l.name).slice(0, 50)}" uts=${l.x_uts_kodu ?? '—'}`);
      }
      for (const q of quants) {
        console.log(`        ${q.location_id?.[1]} qty=${q.quantity} lot=${q.lot_id?.[1] ?? '—'}`);
      }
    }

    console.log(`  DELETE_ önekli (${ARCHIVE_DELETE_PREFIX}${barkod}): ${prefixed.length} kayıt`);
    for (const p of prefixed) {
      console.log(`    #${p.id} active=${p.active} | ${p.display_name}`);
      toplamArsivPrefixed += 1;
      const { lots, quants } = await lotsAndQuants(p.id);
      if (lots.length || quants.length) {
        console.log(`      lot: ${lots.length}, quant: ${quants.length}`);
      }
    }
    console.log('');
  }

  // ZAROSSI template özeti
  const tmpl = await execute('product.template', 'read', [[1956]], {
    fields: ['id', 'name', 'active'],
    ...ctx,
  });
  const allVariants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', 1956]]],
    { fields: ['id', 'barcode', 'active', 'display_name'], ...ctx },
  )) ?? [];
  console.log('=== ZAROSSI şablon #1956 varyantları ===');
  console.log(`  Şablon active=${tmpl?.[0]?.active}`);
  for (const v of allVariants) {
    console.log(`  #${v.id} active=${v.active} barcode=${v.barcode ?? '—'} | ${v.display_name}`);
  }

  console.log('\n=== ÖZET ===');
  console.log(`Orijinal barkodlu kayıt (4 barkod toplam): aktif=${toplamAktifOrijinal}`);
  console.log(`DELETE_ önekli arşiv kayıt: ${toplamArsivPrefixed}`);
  console.log(`Toplam varyant (tmpl 1956): ${allVariants.length} (aktif: ${allVariants.filter((v: { active: boolean }) => v.active).length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
