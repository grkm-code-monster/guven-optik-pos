/**
 * "SWING GÜNEŞ GÖZLÜĞÜ" gibi ÇOK sayıda MODEL değeri olan ürün grupları için
 * TEK şablonda gerçek varyant açabilmek amacıyla, MODEL/RENK/ÖLÇÜ'nün
 * "Talep Üzerine" (dynamic) modunda YENİ bir kopyasını oluşturur.
 *
 * NEDEN YENİ NİTELİK GEREKİYOR (mevcut MODEL/RENK/ÖLÇÜ değiştirilemiyor):
 * Mevcut MODEL/RENK/ÖLÇÜ nitelikleri onlarca başka şablonda "Anında" (always)
 * modda ve gerçek varyantlarla kullanıldığı için, Odoo bu nitelerin modunu
 * global olarak değiştirmeye izin vermiyor (bkz. fix-variant-explosion.ts —
 * daha önce tam olarak bu denenmiş ve Odoo reddetmiş). "Anında" modda bir
 * şablona MODEL gibi 90+ farklı değeri olan bir nitelik + RENK + ÖLÇÜ birlikte
 * eklenirse, Odoo TÜM olası kombinasyonu (on binlerce) peşinen üretmeye
 * çalışıp reddediyor ("izin verilen sınırın üzerinde" hatası).
 *
 * "Talep Üzerine" (dynamic) modda ise Odoo hiçbir şeyi peşinen üretmeye
 * çalışmaz — sadece kodumuzun açıkça "şu MODEL + şu RENK + şu ÖLÇÜ
 * kombinasyonunu oluştur" dediği varyantlar açılır. Bu yüzden MODEL kaç
 * farklı değer alırsa alsın hiçbir zaman patlama riski olmaz VE hepsi TEK
 * şablonda kalır (bölünmüş alt şablon YOK).
 *
 * Bu script, isim çakışmasını (kodun "MODEL" diye arayıp hangi niteliği
 * bulacağını şaşırmaması için) önlemek amacıyla yeni nitelikleri farklı,
 * açıkça ayırt edici isimlerle oluşturur: "MODEL (Çoklu)", "RENK (Çoklu)",
 * "ÖLÇÜ (Çoklu)". Değer havuzu (2140, Siyah, 52 gibi) mevcut MODEL/RENK/ÖLÇÜ
 * ile PAYLAŞILMAZ — bu yeni nitelikler için ayrı, temiz bir değer listesi
 * oluşur (mevcut küçük-katalog ürünler hiç etkilenmez).
 *
 * Kullanım:
 *   cd backend
 *   npm run dinamik-nitelik-olustur              (dry-run — sadece rapor)
 *   npm run dinamik-nitelik-olustur -- --execute  (gerçekten oluşturur)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { DINAMIK_NITELIK_ADLARI } from '../src/modules/admin/odoo-varyant-import-dinamik.service';

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();

  console.log('='.repeat(70));
  console.log('Çok-modelli ürünler için "Talep Üzerine" (dynamic) nitelik seti');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const hedefAdlar = Object.values(DINAMIK_NITELIK_ADLARI);

  const mevcut = (await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', hedefAdlar]]],
    { fields: ['id', 'name', 'create_variant', 'display_type'] },
  )) as { id: number; name: string; create_variant: string; display_type: string }[];

  console.log('Mevcut durum:');
  for (const ad of hedefAdlar) {
    const bulunan = mevcut.find((m) => m.name === ad);
    console.log(`  ${ad}: ${bulunan ? `zaten var (id ${bulunan.id}, mod: ${bulunan.create_variant})` : 'YOK, oluşturulacak'}`);
  }

  const eksikler = hedefAdlar.filter((ad) => !mevcut.find((m) => m.name === ad));

  if (!eksikler.length) {
    console.log('\nHepsi zaten mevcut — bir şey yapılmayacak.');
    return;
  }

  if (!executeMode) {
    console.log(`\nDry-run — ${eksikler.length} yeni nitelik oluşturulacaktı: ${eksikler.join(', ')}`);
    console.log('Gerçekten oluşturmak için: npm run dinamik-nitelik-olustur -- --execute');
    return;
  }

  for (const ad of eksikler) {
    const yeniId = Number(await execute(
      'product.attribute', 'create',
      [{ name: ad, create_variant: 'dynamic', display_type: 'select' }],
    ));
    console.log(`✓ "${ad}" oluşturuldu (id ${yeniId}, mod: dynamic)`);
  }

  console.log('\nTamamlandı. Bu nitelikler artık çok-modelli ürünlerde TEK şablonda');
  console.log('gerçek varyant açmak için kullanılabilir (bkz. odoo-varyant-import-dinamik.service.ts).');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
