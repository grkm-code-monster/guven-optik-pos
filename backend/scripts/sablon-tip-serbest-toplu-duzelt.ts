/**
 * teshis-cam-tip-kilidi-toplu.ts'in bulduğu "SERBEST" (üzerinde hiç stok
 * hareketi olmayan, dolayısıyla type alanı hâlâ değiştirilebilir) şablonları
 * TOPLU olarak type='product', detailed_type='product', tracking='serial'
 * yapar. KİLİTLİ olanlara DOKUNMAZ (onlar için sablon-tip-kilidi-coz.ts
 * kullanılmalı, tek tek --tmpl=ID ile).
 *
 * Varsayılan: dry-run (sadece ne yapılacağını listeler).
 * Gerçekten uygulamak için --confirm ekle.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-tip-serbest-toplu-duzelt            (dry-run)
 *   npm run sablon-tip-serbest-toplu-duzelt -- --confirm
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

type Tmpl = {
  id: number;
  name: string;
  type: string;
  detailed_type: string;
  tracking: string;
  categ_id: [number, string] | false;
};

async function main() {
  const confirm = process.argv.includes('--confirm');

  const templates = (await execute(
    'product.template', 'search_read',
    [[]],
    {
      fields: ['id', 'name', 'type', 'detailed_type', 'tracking', 'categ_id'],
      limit: 10000,
      context: { active_test: false },
    },
  )) as Tmpl[];

  const bozuk = templates.filter((t) => {
    if (t.type === 'product' && t.tracking === 'serial' && t.detailed_type === 'product') return false;
    if (t.name.startsWith('[ESKİ-TİP-KİLİTLİ]')) return false;
    return true;
  });

  if (!bozuk.length) {
    console.log('Hiçbir sorunlu şablon yok.');
    return;
  }

  const serbest: Tmpl[] = [];
  const kilitli: Tmpl[] = [];
  for (const t of bozuk) {
    const moveCount = await execute(
      'stock.move', 'search_count',
      [[['product_id.product_tmpl_id', '=', t.id]]],
      { context: { active_test: false } },
    ) as number;
    if (moveCount > 0) kilitli.push(t);
    else serbest.push(t);
  }

  console.log(`${serbest.length} şablon SERBEST (düzeltilecek), ${kilitli.length} şablon KİLİTLİ (atlanacak — sablon-tip-kilidi-coz.ts kullan).\n`);

  for (const t of serbest) {
    console.log(`#${t.id} "${t.name}" [${t.categ_id ? t.categ_id[1] : '-'}]  ${t.type}/${t.detailed_type}/${t.tracking} -> product/product/serial`);
  }

  if (!confirm) {
    console.log('\n--- DRY-RUN --- Gerçekten uygulamak için sonuna --confirm ekleyip tekrar çalıştır.');
    return;
  }

  console.log('\nUygulanıyor...');
  for (const t of serbest) {
    try {
      await execute('product.template', 'write', [[t.id], {
        type: 'product',
        detailed_type: 'product',
        tracking: 'serial',
      }]);
      console.log(`  #${t.id} "${t.name}" -> OK`);
    } catch (e: unknown) {
      console.log(`  #${t.id} "${t.name}" -> HATA: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log('\nBitti.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
