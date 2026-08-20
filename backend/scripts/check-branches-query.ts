/**
 * GET /admin/branches endpoint'inin ÇALIŞTIRDIĞI GERÇEK sorguyu birebir
 * tekrarlar ve sonuç listesinde GVNP'nin olup olmadığını gösterir.
 * check-location.ts ile bulunan değerlerin (usage=internal, active=true,
 * company_id=3) neden filtreden geçmediğini/geçtiğini teşhis eder.
 *
 * Kullanım:
 *   cd backend
 *   npm run check-branches-query
 */
import 'dotenv/config';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const ODOO_ALL_COMPANIES_KWARGS = {
  context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] },
};

async function main() {
  console.log('allowed_company_ids:', ODOO_ALL_COMPANY_IDS);

  const odooLocations = (await execute(
    'stock.location',
    'search_read',
    [[['usage', '=', 'internal'], ['active', '=', true]]],
    { fields: ['id', 'name', 'complete_name', 'company_id'], limit: 300, ...ODOO_ALL_COMPANIES_KWARGS },
  )) as Array<{ id: number; name: string; complete_name?: string; company_id?: [number, string] }>;

  console.log(`\nToplam dönen kayıt: ${odooLocations.length}`);

  const gvnp = odooLocations.find((l) => l.id === 66 || l.name === 'GVNP');
  console.log(`GVNP (#66) listede var mı: ${gvnp ? 'EVET -> ' + JSON.stringify(gvnp) : 'HAYIR'}`);

  console.log('\nİlk 20 kayıt:');
  for (const l of odooLocations.slice(0, 20)) {
    console.log(`  #${l.id} ${l.complete_name || l.name} (company: ${l.company_id?.[1] ?? '-'})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
