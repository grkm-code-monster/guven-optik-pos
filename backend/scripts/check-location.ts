/**
 * Belirli bir isme göre Odoo'daki stock.location kayıtlarını tüm detaylarıyla
 * (usage, active, company_id, parent_id dahil) listeler. Yeni oluşturulan bir
 * lokasyonun neden "/admin/branches" dropdown'ında görünmediğini teşhis etmek
 * için kullanılır (dropdown sadece usage='internal' AND active=true olanları
 * gösterir).
 *
 * Kullanım:
 *   cd backend
 *   npm run check-location -- GVNP
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const arama = process.argv[2] || 'GVNP';

  console.log('='.repeat(70));
  console.log(`"${arama}" için stock.location araması (aktif + arşivlenmiş dahil)`);
  console.log('='.repeat(70));

  const sonuclar = (await execute(
    'stock.location',
    'search_read',
    [['|', ['name', 'ilike', arama], ['complete_name', 'ilike', arama]]],
    {
      fields: ['id', 'name', 'complete_name', 'usage', 'active', 'company_id', 'parent_id'],
      context: { active_test: false },
    },
  )) as Array<{
    id: number;
    name: string;
    complete_name?: string;
    usage: string;
    active: boolean;
    company_id?: [number, string] | false;
    parent_id?: [number, string] | false;
  }>;

  if (!sonuclar.length) {
    console.log('\nHiçbir sonuç bulunamadı — bu isimde bir lokasyon Odoo\'da yok.');
    return;
  }

  for (const loc of sonuclar) {
    console.log('');
    console.log(`#${loc.id}  ${loc.complete_name || loc.name}`);
    console.log(`  usage (Konum Tipi): ${loc.usage}  ${loc.usage === 'internal' ? '(OK)' : '(DROPDOWN\'DA GÖZÜKMEZ — internal değil)'}`);
    console.log(`  active (Aktif mi): ${loc.active}  ${loc.active ? '(OK)' : '(DROPDOWN\'DA GÖZÜKMEZ — arşivlenmiş)'}`);
    console.log(`  company_id: ${loc.company_id ? `${loc.company_id[0]} - ${loc.company_id[1]}` : 'YOK (şirket atanmamış)'}`);
    console.log(`  parent_id: ${loc.parent_id ? `${loc.parent_id[0]} - ${loc.parent_id[1]}` : 'YOK (kök seviye)'}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
