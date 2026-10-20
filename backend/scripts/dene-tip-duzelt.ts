/**
 * Belirtilen product.template'in type/tracking alanını DOĞRUDAN yazmayı
 * dener ve Odoo'nun verdiği GERÇEK hatayı (varsa) gösterir. Salt-okunur
 * değil — gerçekten yazma dener, ama sadece type='product'/tracking='serial'
 * yazmaya çalışır (zaten hedeflenen değer).
 *
 * Kullanım:
 *   cd backend
 *   npm run dene-tip-duzelt -- --tmpl=3816
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
    console.log('Kullanım: npm run dene-tip-duzelt -- --tmpl=3816');
    process.exit(1);
  }

  const before = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ['id', 'name', 'type', 'tracking'], context: { active_test: false } },
  )) as { id: number; name: string; type: string; tracking: string }[];
  console.log('ÖNCE:', JSON.stringify(before[0]));

  try {
    console.log('\ntype=product yazılıyor...');
    await execute('product.template', 'write', [[tmpl], { type: 'product' }]);
    console.log('  BAŞARILI');
  } catch (err) {
    console.log('  HATA:', err instanceof Error ? err.message : err);
  }

  try {
    console.log('\ntracking=serial yazılıyor...');
    await execute('product.template', 'write', [[tmpl], { tracking: 'serial' }]);
    console.log('  BAŞARILI');
  } catch (err) {
    console.log('  HATA:', err instanceof Error ? err.message : err);
  }

  const after = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ['id', 'name', 'type', 'tracking'], context: { active_test: false } },
  )) as { id: number; name: string; type: string; tracking: string }[];
  console.log('\nSONRA:', JSON.stringify(after[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
