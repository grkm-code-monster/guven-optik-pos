/**
 * Merkezi buildOdooCompanyContext + account.tax erişim testi
 * Kullanım: npx ts-node scripts/test-odoo-company-context-tax.ts
 */
import 'dotenv/config';
import {
  buildOdooCompanyContext,
  buildOdooTaxAccessContext,
  execute,
  ODOO_TAX_CHART_COMPANY_ID,
} from '../src/modules/odoo/odoo.service';
import {
  readProductSaleTaxRate,
  resolvePurchaseTaxId,
  resolveSaleTaxIdExcluded,
} from '../src/modules/odoo/odoo-tax.util';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';

const NG = 2;
const ADESE = 3;

async function testContextShape() {
  const ctx2 = buildOdooCompanyContext(NG);
  const taxCtx2 = buildOdooTaxAccessContext(NG);
  console.log('=== buildOdooCompanyContext (varsayılan execute) ===');
  console.log('NG (2):', ctx2);
  console.log('=== buildOdooTaxAccessContext (vergi/fatura) ===');
  console.log('NG (2):', taxCtx2);
  const defaultOk =
    ctx2.allowed_company_ids.length === 1
    && ctx2.allowed_company_ids[0] === NG
    && ctx2.company_id === NG;
  const taxOk =
    taxCtx2.allowed_company_ids.includes(ODOO_TAX_CHART_COMPANY_ID)
    && taxCtx2.allowed_company_ids.includes(NG);
  console.log(defaultOk ? '✅ Varsayılan context yalnızca aktif şirket' : '❌ Varsayılan context hatalı');
  console.log(taxOk ? '✅ Vergi context chart + aktif şirket' : '❌ Vergi context eksik');
  return defaultOk && taxOk;
}

async function testTaxRead(sirketId: number, label: string): Promise<boolean> {
  console.log(`\n=== ${label} — account.tax okuma ===`);
  try {
    const taxes = await execute(
      'account.tax',
      'search_read',
      [[['type_tax_use', '=', 'sale'], ['amount', '=', 20], ['active', '=', true]]],
      { fields: ['id', 'name', 'amount', 'company_id'], limit: 3 },
      sirketId,
    );
    console.log(`  search_read: ${taxes.length} kayıt`, taxes.map((t: { id: number; name: string }) => `${t.id}:${t.name}`).join(', ') || '(boş)');
    return taxes.length > 0;
  } catch (err) {
    console.log('  ❌', err instanceof Error ? err.message : err);
    return false;
  }
}

async function findProductWithTax(companyId: number): Promise<number | null> {
  const rows = await execute(
    'product.product',
    'search_read',
    [[['sale_ok', '=', true]]],
    { fields: ['id', 'taxes_id'], limit: 5 },
    companyId,
  );
  for (const row of rows) {
    if (Array.isArray(row.taxes_id) && row.taxes_id.length) return Number(row.id);
  }
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function testResolveTaxes(sirketId: number, label: string): Promise<boolean> {
  console.log(`\n=== ${label} — resolveSaleTaxIdExcluded + readProductSaleTaxRate ===`);
  try {
    const saleTaxId = await resolveSaleTaxIdExcluded(sirketId, 20);
    console.log('  resolveSaleTaxIdExcluded(20%):', saleTaxId ?? 'null');
    const productId = await findProductWithTax(sirketId);
    if (!productId) {
      console.log('  ⚠️ Vergili ürün bulunamadı, readProductSaleTaxRate atlandı');
      return saleTaxId != null;
    }
    const rate = await readProductSaleTaxRate(productId, sirketId);
    console.log(`  readProductSaleTaxRate(product ${productId}):`, rate);
    const purchaseTaxId = await resolvePurchaseTaxId(sirketId, 20);
    console.log('  resolvePurchaseTaxId(20%):', purchaseTaxId ?? 'null');
    return saleTaxId != null && purchaseTaxId != null;
  } catch (err) {
    console.log('  ❌', err instanceof Error ? err.message : err);
    return false;
  }
}

async function testAccountMovePost(
  kaynakSirketId: number,
  hedefSirketId: number,
  label: string,
): Promise<boolean> {
  console.log(`\n=== ${label} — account.move create + action_post (minimal) ===`);
  let moveId: number | undefined;
  try {
    const aliciSirket = await execute('res.company', 'read', [[hedefSirketId]], { fields: ['partner_id'] }, kaynakSirketId);
    const partnerId = aliciSirket[0]?.partner_id?.[0] as number | undefined;
    if (!partnerId) throw new Error('Alıcı partner yok');

    const productId = await findProductWithTax(kaynakSirketId);
    if (!productId) throw new Error('Test ürünü yok');

    const taxId = await resolveSaleTaxIdExcluded(kaynakSirketId, 20);
    if (!taxId) throw new Error('Satış vergisi bulunamadı');

    const gelirHesap = await execute(
      'account.account',
      'search_read',
      [[['code', '=', '600'], ['company_id', '=', kaynakSirketId]]],
      { fields: ['id'], limit: 1 },
      kaynakSirketId,
    );

    const lineVals: Record<string, unknown> = {
      product_id: productId,
      name: 'Context test satır',
      quantity: 1,
      price_unit: 100,
      tax_ids: [[6, 0, [taxId]]],
    };
    if (gelirHesap[0]?.id) lineVals.account_id = gelirHesap[0].id;

    const taxCtx = { context: buildOdooTaxAccessContext(kaynakSirketId) };
    moveId = await execute(
      'account.move',
      'create',
      [{
        move_type: 'out_invoice',
        partner_id: partnerId,
        company_id: kaynakSirketId,
        invoice_date: new Date().toISOString().slice(0, 10),
        invoice_line_ids: [[0, 0, lineVals]],
        narration: `test-odoo-company-context-tax ${label}`,
      }],
      taxCtx,
      kaynakSirketId,
    );
    console.log('  create move id:', moveId);

    await execute('account.move', 'action_post', [[moveId]], taxCtx, kaynakSirketId);
    const inv = await execute('account.move', 'read', [[moveId]], { fields: ['name', 'state'] }, kaynakSirketId);
    const state = inv[0]?.state;
    const name = inv[0]?.name;
    console.log(`  action_post sonrası: ${name} state=${state}`);
    const ok = state === 'posted';
    console.log(ok ? '  ✅ posted' : '  ❌ posted değil');
    return ok;
  } catch (err) {
    console.log('  ❌', err instanceof Error ? err.message : err);
    return false;
  } finally {
    if (moveId) {
      try {
        const inv = await execute('account.move', 'read', [[moveId]], { fields: ['state'] }, kaynakSirketId);
        if (inv[0]?.state === 'posted') {
          await execute('account.move', 'button_draft', [[moveId]], {}, kaynakSirketId);
        }
        if (inv[0]?.state !== 'cancel') {
          await execute('account.move', 'button_cancel', [[moveId]], {}, kaynakSirketId).catch(() => {});
        }
        console.log('  (test faturası iptal edildi)');
      } catch {
        console.log('  (test faturası temizlenemedi — manuel kontrol gerekebilir)');
      }
    }
  }
}

async function testStockSearchRegression(): Promise<boolean> {
  console.log('\n=== Regresyon — stok sorgusu (company filtresi) ===');
  try {
    const locId = LOKASYON_ID_MAP.GVN2;
    const quants = await execute(
      'stock.quant',
      'search_read',
      [[['location_id', '=', locId], ['quantity', '>', 0]]],
      { fields: ['id', 'product_id', 'quantity'], limit: 3 },
      NG,
    );
    console.log(`  GVN2 lokasyon quant: ${quants.length} kayıt`);
    return true;
  } catch (err) {
    console.log('  ❌', err instanceof Error ? err.message : err);
    return false;
  }
}

async function testSameCompanyInternalPicking(): Promise<boolean> {
  console.log('\n=== ANA DEPO→GVN2 — aynı şirket stock.picking create ===');
  const kaynakId = LOKASYON_ID_MAP.ANADEPO;
  const hedefId = LOKASYON_ID_MAP.GVN2;
  let pickingId: number | undefined;
  try {
    const pt = await execute(
      'stock.picking.type',
      'search_read',
      [[['code', '=', 'internal'], ['active', '=', true], ['company_id', '=', NG]]],
      { fields: ['id'], limit: 1 },
      NG,
    );
    if (!pt.length) throw new Error('internal picking type yok');

    const productId = await findProductWithTax(NG);
    if (!productId) throw new Error('Test ürünü yok');

    pickingId = await execute(
      'stock.picking',
      'create',
      [{
        picking_type_id: pt[0].id,
        location_id: kaynakId,
        location_dest_id: hedefId,
        company_id: NG,
        origin: `test-regresyon-${Date.now()}`,
      }],
      {},
      NG,
    );
    const pickData = await execute(
      'stock.picking',
      'read',
      [[pickingId]],
      { fields: ['id', 'name', 'company_id', 'state'] },
      NG,
    );
    const companyId = pickData[0]?.company_id?.[0];
    console.log(`  picking ${pickData[0]?.name} company_id=${companyId} state=${pickData[0]?.state}`);
    const ok = companyId === NG;
    console.log(ok ? '  ✅ picking NG şirketinde' : '  ❌ yanlış şirket (regresyon)');
    return ok;
  } catch (err) {
    console.log('  ❌', err instanceof Error ? err.message : err);
    return false;
  } finally {
    if (pickingId) {
      try {
        const pick = await execute('stock.picking', 'read', [[pickingId]], { fields: ['state'] }, NG);
        if (pick[0]?.state !== 'cancel') {
          await execute('stock.picking', 'action_cancel', [[pickingId]], {}, NG).catch(() => {});
        }
        console.log('  (test picking iptal edildi)');
      } catch {
        console.log('  (test picking temizlenemedi)');
      }
    }
  }
}

async function main() {
  const results: Array<[string, boolean]> = [];
  results.push(['context shape', await testContextShape()]);
  results.push(['NG tax read', await testTaxRead(NG, 'NG (2)')]);
  results.push(['ADESE tax read', await testTaxRead(ADESE, 'ADESE (3)')]);
  results.push(['NG resolve', await testResolveTaxes(NG, 'NG')]);
  results.push(['ADESE resolve', await testResolveTaxes(ADESE, 'ADESE')]);
  results.push(['ANA DEPO→GVN3 fatura', await testAccountMovePost(NG, ADESE, 'NG→ADESE (GVN3 senaryosu)')]);
  results.push(['ANA DEPO→GVN1 fatura', await testAccountMovePost(NG, 3, 'NG→ADESE (GVN1 senaryosu)')]);
  results.push(['ANA DEPO→GVN2 aynı şirket', await testSameCompanyInternalPicking()]);
  results.push(['stok regresyon', await testStockSearchRegression()]);

  console.log('\n=== ÖZET ===');
  for (const [name, ok] of results) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
  }
  const failed = results.filter(([, ok]) => !ok).length;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
