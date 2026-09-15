/**
 * Salt-okunur tanı scripti — belirtilen "ana ürün adı" ile başlayan TÜM
 * şablonları (kendisi + model-bazlı bölünmüş alt şablonlar) ve her birinin
 * gerçek varyant sayısını listeler. Hiçbir şeyi değiştirmez.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-alt-sablonlari-listele -- --ad="SWING GÜNEŞ GÖZLÜĞÜ"
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const adArg = process.argv.find((a) => a.startsWith('--ad='));
  const ad = adArg ? adArg.split('=')[1].replace(/^"|"$/g, '') : null;
  return { ad };
}

async function main() {
  const { ad } = parseArgs();
  if (!ad) {
    console.log('Kullanım: npm run sablon-alt-sablonlari-listele -- --ad="SWING GÜNEŞ GÖZLÜĞÜ"');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`"${ad}" ile başlayan şablonlar`);
  console.log('='.repeat(70));

  const tmpller = (await execute(
    'product.template', 'search_read',
    [[['name', 'like', ad]]],
    { fields: ['id', 'name', 'product_variant_count'], order: 'name asc', limit: 2000 },
  ) as { id: number; name: string; product_variant_count: number }[]);

  console.log(`Toplam eşleşen şablon: ${tmpller.length}\n`);

  const toplamVaryant = tmpller.reduce((s, t) => s + (t.product_variant_count || 0), 0);
  console.log(`Toplam varyant (tüm şablonlar üzerinde): ${toplamVaryant}\n`);

  for (const t of tmpller) {
    console.log(`#${t.id}  ${t.name}  — ${t.product_variant_count} varyant`);
  }

  const sifirVaryantlilar = tmpller.filter((t) => (t.product_variant_count || 0) === 0);
  if (sifirVaryantlilar.length) {
    console.log(`\n0 varyantlı (boş) şablon sayısı: ${sifirVaryantlilar.length}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
