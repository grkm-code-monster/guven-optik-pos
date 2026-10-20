/**
 * Bir şablonun adını TAM OLARAK verilen değere yazar (sablon-tip-kilidi-coz
 * script'inin copy() çağrısı Odoo'nun otomatik " (kopya)" ekini
 * eklemesine yol açtığı için — bu script onu orijinal ada geri döndürür).
 *
 * Kullanım:
 *   npm run sablon-ad-duzelt -- --tmpl=13702 --ad="Org Et 1.56 0100 -0000"
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const tmplArg = process.argv.find((a) => a.startsWith('--tmpl='));
  const tmpl = tmplArg ? Number(tmplArg.split('=')[1]) : null;
  const adArg = process.argv.find((a) => a.startsWith('--ad='));
  const ad = adArg ? adArg.slice('--ad='.length).replace(/^"|"$/g, '') : null;
  return { tmpl, ad };
}

async function main() {
  const { tmpl, ad } = parseArgs();
  if (!tmpl || !ad) {
    console.log('Kullanım: npm run sablon-ad-duzelt -- --tmpl=13702 --ad="Org Et 1.56 0100 -0000"');
    process.exit(1);
  }

  const before = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ['id', 'name'], context: { active_test: false } },
  )) as { id: number; name: string }[];
  console.log('ÖNCE:', JSON.stringify(before[0]));

  await execute('product.template', 'write', [[tmpl], { name: ad }]);

  const after = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ['id', 'name'], context: { active_test: false } },
  )) as { id: number; name: string }[];
  console.log('SONRA:', JSON.stringify(after[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
