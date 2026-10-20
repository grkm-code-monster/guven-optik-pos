/**
 * Salt-okunur teşhis: product.template üzerindeki type/tracking ile ilgili
 * TÜM alanları (fields_get ile) ve belirtilen şablonun bu alanlardaki
 * GÜNCEL değerlerini gösterir. "Ayrıntılı Tür" hatasının kaynağı olan
 * gerçek alan adını bulmak için.
 *
 * Kullanım:
 *   cd backend
 *   npm run teshis-tip-alanlari -- --tmpl=3816
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const tmplArg = process.argv.find((a) => a.startsWith('--tmpl='));
  const tmpl = tmplArg ? Number(tmplArg.split('=')[1]) : null;
  return { tmpl };
}

async function main() {
  const { tmpl } = parseArgs();
  if (!tmpl) {
    console.log('Kullanım: npm run teshis-tip-alanlari -- --tmpl=3816');
    process.exit(1);
  }

  const fields = (await execute(
    'product.template', 'fields_get', [], { attributes: ['string', 'type', 'selection'] },
  )) as Record<string, { string: string; type: string; selection?: [string, string][] }>;

  const ilgili = Object.keys(fields).filter((k) => /type|tip|tür|detailed/i.test(k) || /tip|tür/i.test(fields[k].string || ''));
  console.log('İLGİLİ ALANLAR:');
  for (const k of ilgili) {
    console.log(`  ${k} (${fields[k].string}) [${fields[k].type}]`, fields[k].selection ? JSON.stringify(fields[k].selection) : '');
  }

  const data = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ilgili, context: { active_test: false } },
  )) as Record<string, unknown>[];
  console.log('\nŞABLONUN GÜNCEL DEĞERLERİ:', JSON.stringify(data[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
