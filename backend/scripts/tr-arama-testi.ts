/**
 * Postgres/Odoo'nun ILIKE'ının Türkçe İ/ı/I/i karışıklığını zaten doğru
 * ele alıp almadığını test eder (DB locale'ine bağlı). Sonuca göre, arama
 * normalizasyonu için JS tarafında ek bir fold fonksiyonu gerekip
 * gerekmediğine karar vereceğiz. SALT OKUNUR.
 *
 * Kullanım:
 *   npm run tr-arama-testi
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  // Odoo'da İ harfi geçen birkaç ürün bul (örn. "İçme" ya da "Ö"/"Ü" gibi TR karakterli).
  const ornekler = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', 'İ']]],
    { fields: ['id', 'name'], limit: 5 },
  )) as { id: number; name: string }[];

  console.log('İ harfi içeren örnek ürünler:');
  for (const o of ornekler) console.log(`  #${o.id} — ${o.name}`);

  if (!ornekler.length) {
    console.log('Hiç İ harfli ürün bulunamadı, test için uygun örnek yok.');
    return;
  }

  const hedef = ornekler[0];
  // Hedefin adındaki İ harfini bulup, küçük "i" ile arama yaparak eşleşiyor mu bakalım.
  const kucukIIleArama = hedef.name.replace(/İ/g, 'i');
  console.log(`\nHedef: "${hedef.name}" — küçük "i" ile arama terimi: "${kucukIIleArama}"`);

  const sonuc1 = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', kucukIIleArama], ['id', '=', hedef.id]]],
    { fields: ['id', 'name'], limit: 5 },
  )) as { id: number; name: string }[];
  console.log(`Küçük "i" ile aratınca hedef bulundu mu: ${sonuc1.length > 0 ? 'EVET' : 'HAYIR'}`);

  // Tersi: büyük I (noktasız, İngilizce I) ile dotless ı karışıklığı testi.
  const buyukIIleArama = hedef.name.toUpperCase();
  console.log(`\nBüyük harfe çevrilmiş hali: "${buyukIIleArama}"`);
  const sonuc2 = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', buyukIIleArama], ['id', '=', hedef.id]]],
    { fields: ['id', 'name'], limit: 5 },
  )) as { id: number; name: string }[];
  console.log(`Büyük harfle (JS toUpperCase) aratınca hedef bulundu mu: ${sonuc2.length > 0 ? 'EVET' : 'HAYIR'}`);

  // Postgres'in LC_CTYPE / collation bilgisini de görelim (admin'in DB'sine değil, Odoo'nun kendi DB'sine bakmak lazım ama bizim erişimimiz yok — bu yüzden sadece davranışsal test yeterli).
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
