import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TMPL_ID = 1913;

async function probe(label: string, companyId?: number) {
  const tmpl = await execute(
    'product.template',
    'read',
    [[TMPL_ID]],
    { fields: ['id', 'name', 'company_id', 'barcode'] },
    companyId,
  ).catch((e) => ({ error: String(e?.faultString ?? e?.message ?? e) }));

  const variants = await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', TMPL_ID]]],
    { fields: ['id', 'name', 'company_id', 'product_tmpl_id'] },
    companyId,
  ).catch((e) => ({ error: String(e?.faultString ?? e?.message ?? e) }));

  console.log(`\n=== ${label} (cid=${companyId ?? 'default/admin'}) ===`);
  console.log('template:', JSON.stringify(tmpl, null, 2));
  console.log('variants:', JSON.stringify(variants, null, 2));
}

async function main() {
  console.log('ULTRA LENS company_id teşhisi — template #' + TMPL_ID);

  await probe('Admin/default', undefined);
  await probe('Güven Optik 1959', 1);
  await probe('NG', 2);
  await probe('ADESE', 3);
  await probe('POTENTIAL', 4);

  // Referans: birden fazla şirkette kullanılan paylaşılan ürün örneği
  const shared = await execute(
    'product.template',
    'search_read',
    [[['company_id', '=', false], ['active', '=', true], ['type', '=', 'product']]],
    { fields: ['id', 'name', 'company_id'], limit: 5, order: 'id desc' },
  );
  console.log('\n=== Referans paylaşılan ürünler (company_id=false) ===');
  console.log(JSON.stringify(shared, null, 2));

  const company1Sample = await execute(
    'product.template',
    'search_read',
    [[['company_id', '=', 1], ['active', '=', true], ['type', '=', 'product']]],
    { fields: ['id', 'name', 'company_id'], limit: 3, order: 'id desc' },
    2,
  ).catch((e) => ({ error: String(e?.faultString ?? e?.message ?? e) }));
  console.log('\n=== company_id=1 ürünler — NG bağlamında görünür mü? ===');
  console.log(JSON.stringify(company1Sample, null, 2));

  // ULTRA LENS serisi company_id dağılımı
  const ultra = await execute(
    'product.template',
    'search_read',
    [[['name', 'ilike', 'ULTRA KONTAKT LENS%']]],
    { fields: ['id', 'name', 'company_id'], limit: 5, order: 'id asc' },
  );
  const ultraCount = await execute(
    'product.template',
    'search_count',
    [[['name', 'ilike', 'ULTRA KONTAKT LENS%']]],
  );
  console.log(`\n=== ULTRA KONTAKT LENS serisi (toplam ${ultraCount}) — ilk 5 ===`);
  console.log(JSON.stringify(ultra, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
