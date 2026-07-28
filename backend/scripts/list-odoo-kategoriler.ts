/**
 * Odoo product.category ağacını okunabilir (girintili) şekilde döker.
 * Patron paneli "Kategori dağılımı" grafiğini alt segmentlerle (alt/orta/orta üst/üst)
 * genişletmeden önce gerçek kategori isimlerini görmek için kullanılır.
 *
 * Kullanım:
 *   cd backend
 *   npm run list-odoo-kategoriler
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

type CategoryRow = {
  id: number;
  name: string;
  complete_name: string;
  parent_id: false | [number, string];
};

async function main() {
  const rows = (await execute(
    'product.category',
    'search_read',
    [[]],
    { fields: ['id', 'name', 'complete_name', 'parent_id'], order: 'complete_name asc', limit: 2000 },
  )) as CategoryRow[];

  const byParent = new Map<number | null, CategoryRow[]>();
  for (const row of rows) {
    const parentId = Array.isArray(row.parent_id) ? row.parent_id[0] : null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(row);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  function print(parentId: number | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const row of children) {
      console.log(`${'  '.repeat(depth)}- #${row.id} ${row.name}`);
      print(row.id, depth + 1);
    }
  }

  console.log(`Toplam kategori: ${rows.length}\n`);
  print(null, 0);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Hata:', err?.message ?? err);
    process.exit(1);
  });
