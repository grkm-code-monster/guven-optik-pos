/**
 * ULTRA KONTAKT LENS #1909-1945 → company_id=false (ortak katalog)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const ids = await execute(
    'product.template',
    'search',
    [[['name', 'ilike', 'ULTRA KONTAKT LENS%'], ['company_id', '=', 1]]],
  );
  console.log('Güncellenecek template sayısı:', ids.length, ids);

  if (!ids.length) {
    console.log('Güncellenecek kayıt yok.');
    return;
  }

  await execute('product.template', 'write', [ids, { company_id: false }]);
  console.log('write tamam — company_id=false');

  for (const cid of [2, 3, 4] as const) {
    const variants = await execute(
      'product.product',
      'search_read',
      [[['product_tmpl_id', 'in', ids]]],
      { fields: ['id', 'name', 'company_id', 'product_tmpl_id'], limit: 3 },
      cid,
    );
    console.log(`NG/ADESE/POTENTIAL cid=${cid} örnek:`, variants);
  }

  const ng1913 = await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', 1913]]],
    { fields: ['id', 'company_id'] },
    2,
  );
  console.log('NG tmpl 1913 variant:', ng1913);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
