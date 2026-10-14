/**
 * Doğrulama: "izoleSablonaDusFallback" güvenlik ağının gerçekten devreye
 * girdiğini test eder. Şablon #1984'e tamamen YENİ bir test modeli
 * (TESTMODEL999) eklemeyi dener — bu, ana şablonun hâlâ bozuk iç durumu
 * yüzünden yine "duplicate key" hatasına düşmeli, ama artık hata ile
 * durmak yerine otomatik izole şablona düşüp BAŞARILI sonuç dönmeli.
 *
 * Test sonunda oluşan "ALLIGATOR OPTİK ÇERÇEVE TESTMODEL999" şablonunu
 * temizlemek istersen elle arşivleyebilirsin (bu script otomatik silmez).
 *
 * Kullanım:
 *   npm run test-izole-fallback
 */
import 'dotenv/config';
import { importVaryantlarDinamikTekSablon } from '../src/modules/admin/odoo-varyant-import-dinamik.service';

async function main() {
  const sonuc = await importVaryantlarDinamikTekSablon(1984, [
    { index: 0, model: 'TESTMODEL999', renk: 'TESTRENK', olcu: '50', barkod: '', fiyat: 0 },
  ]);
  console.log(`Oluşturulan: ${sonuc.olusturulan}, hata: ${sonuc.hatalar.length}`);
  console.log(JSON.stringify(sonuc.sonuclar, null, 2));
  console.log(JSON.stringify(sonuc.hatalar, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
