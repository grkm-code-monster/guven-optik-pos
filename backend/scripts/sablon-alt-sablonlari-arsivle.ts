/**
 * Bir ana ürün adı için önceden "split by model" yöntemiyle açılmış TÜM
 * bölünmüş alt şablonları (örn. "SWING GÜNEŞ GÖZLÜĞÜ SS320SG") gerçekten
 * arşivler (active=False). Ana şablonun kendisine DOKUNMAZ.
 *
 * Neden gerekli: Odoo arayüzünden yapılan "arşivle" işlemi bazı durumlarda
 * (örn. sadece varyantlar arşivlenip şablon arşivlenmemişse) tam
 * uygulanmayabiliyor — search_count/search_read hâlâ bu şablonları aktif
 * görüyor, bu da import kodunun "bu ürün eski yöntemle mi açılmış" testinin
 * yanlış sonuç vermesine (ve dinamik-tek-şablon yerine eski split yöntemine
 * yönlenmesine) sebep oluyor.
 *
 * Hiçbir veri SİLİNMEZ — sadece active=False yapılır (Odoo'nun standart
 * arşivleme mekanizması), geri almak için active=True yazmak yeterli.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-alt-sablonlari-arsivle -- --ad="SWING GÜNEŞ GÖZLÜĞÜ"              (dry-run)
 *   npm run sablon-alt-sablonlari-arsivle -- --ad="SWING GÜNEŞ GÖZLÜĞÜ" --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const adArg = process.argv.find((a) => a.startsWith('--ad='));
  const ad = adArg ? adArg.split('=')[1].replace(/^"|"$/g, '') : null;
  const executeMode = process.argv.includes('--execute');
  return { ad, executeMode };
}

async function main() {
  const { ad, executeMode } = parseArgs();
  if (!ad) {
    console.log('Kullanım: npm run sablon-alt-sablonlari-arsivle -- --ad="SWING GÜNEŞ GÖZLÜĞÜ" [--execute]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`"${ad}" bölünmüş alt şablonlarını arşivleme`);
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  // Ana şablonun KENDİSİ hariç, "{ad} %" desenine uyan (yani en az bir boşluk
  // ve devamında metin olan) tüm şablonları bul.
  const altSablonlar = await execute(
    'product.template', 'search_read',
    [[['name', '=like', `${ad.trim()} %`]]],
    { fields: ['id', 'name', 'active', 'product_variant_count'], limit: 5000 },
  ) as { id: number; name: string; active: boolean; product_variant_count: number }[];

  console.log(`Bulunan (aktif) alt şablon sayısı: ${altSablonlar.length}`);
  const toplamVaryant = altSablonlar.reduce((s, t) => s + (t.product_variant_count || 0), 0);
  console.log(`Toplam varyant (bu alt şablonlarda): ${toplamVaryant}\n`);

  if (!altSablonlar.length) {
    console.log('Zaten arşivlenmiş / hiç alt şablon yok — yapılacak bir şey kalmadı.');
    return;
  }

  for (const t of altSablonlar.slice(0, 20)) {
    console.log(`  #${t.id}  ${t.name}  (${t.product_variant_count} varyant, active=${t.active})`);
  }
  if (altSablonlar.length > 20) console.log(`  ... ve ${altSablonlar.length - 20} tane daha`);

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey değiştirilmedi. Uygulamak için sonuna --execute ekleyin.');
    return;
  }

  const ids = altSablonlar.map((t) => t.id);

  // Önce varyantları arşivle — barkodlar (örn. 86800000000001) yeni, tek
  // şablonda açılacak varyantlarla ÇAKIŞMASIN diye. product.product.active
  // Odoo'da şablondan bağımsız bir alan, o yüzden ayrıca yazmak gerekiyor.
  const varyantlar = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', 'in', ids]]],
    { fields: ['id'], limit: 20000 },
  ) as { id: number }[];
  if (varyantlar.length) {
    await execute('product.product', 'write', [varyantlar.map((v) => v.id), { active: false }]);
    console.log(`✓ ${varyantlar.length} varyant arşivlendi (barkod çakışmasını önlemek için).`);
  }

  await execute('product.template', 'write', [ids, { active: false }]);
  console.log(`✓ ${ids.length} alt şablon arşivlendi (active=False). Veri silinmedi, sadece pasif hale geldi.`);

  const dogrulama = await execute(
    'product.template', 'search_count',
    [[['name', '=like', `${ad.trim()} %`]]],
  ) as number;
  console.log(`\nDoğrulama — hâlâ AKTİF görünen alt şablon sayısı: ${dogrulama} (0 olmalı)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
