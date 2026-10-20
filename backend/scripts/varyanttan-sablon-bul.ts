/**
 * Salt-okunur: verilen product.product (varyant) id'sinden kendi
 * product_tmpl_id'sini bulur. Hiçbir şeyi değiştirmez.
 *
 * Kullanım:
 *   npm run varyanttan-sablon-bul -- --varyant=16978
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const arg = process.argv.find((a) => a.startsWith('--varyant='));
  return { varyant: arg ? Number(arg.split('=')[1]) : null };
}

async function main() {
  const { varyant } = parseArgs();
  if (!varyant) {
    console.log('Kullanım: npm run varyanttan-sablon-bul -- --varyant=16978');
    process.exit(1);
  }
  const data = (await execute(
    'product.product', 'read', [[varyant]],
    { fields: ['id', 'name', 'barcode', 'product_tmpl_id', 'active'], context: { active_test: false } },
  )) as { id: number; name: string; barcode: string | false; product_tmpl_id: [number, string] | false; active: boolean }[];
  console.log(JSON.stringify(data[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
