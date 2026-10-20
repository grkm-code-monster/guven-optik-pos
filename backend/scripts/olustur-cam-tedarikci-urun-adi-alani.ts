/**
 * Tek seferlik kurulum scripti — stock.lot modeline, Cam/Lens içe aktarmada
 * kullanılacak YENİ bir özel alan ekler: x_tedarikci_urun_adi (Char).
 *
 * Bu alan, tedarikçinin/firmanın ürüne kendi kataloğunda verdiği ad (örn.
 * Beta'dan "1,58 Multı-ar", Sude Optik'ten "1,56 hmc", Akay'dan "1,56 et")
 * — bizim "Ürün Şablonu" adımız ("1.56 Org Et -0200-0200") altında
 * toplandığında, HANGİ lotun hangi tedarikçi isimle geldiğini sonradan
 * sorgulayabilmek için.
 *
 * GÜVENLİ: x_uts_kodu alanı da aynı şekilde (ir.model.fields üzerinden,
 * Odoo Studio'nun yaptığı gibi) oluşturulmuştu — stock.lot'un name/ref/
 * x_uts_kodu alanlarına hiç dokunmuyor, sadece YENİ bir alan ekliyor.
 * Zaten varsa (ikinci kez çalıştırılırsa) hata vermeden atlar.
 *
 * Kullanım (SUNUCUDA, Odoo'ya erişimi olan .env ile):
 *   cd backend
 *   npm run olustur-cam-tedarikci-urun-adi-alani
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const existing = (await execute(
    'ir.model.fields', 'search_read',
    [[['model', '=', 'stock.lot'], ['name', '=', 'x_tedarikci_urun_adi']]],
    { fields: ['id'], limit: 1 },
  )) as { id: number }[];

  if (existing.length) {
    console.log(`Alan zaten mevcut (ir.model.fields #${existing[0].id}) — hiçbir şey yapılmadı.`);
    return;
  }

  const models = (await execute(
    'ir.model', 'search_read',
    [[['model', '=', 'stock.lot']]],
    { fields: ['id'], limit: 1 },
  )) as { id: number }[];

  if (!models.length) {
    throw new Error('ir.model kaydı bulunamadı: stock.lot');
  }

  const fieldId = await execute('ir.model.fields', 'create', [{
    name: 'x_tedarikci_urun_adi',
    field_description: 'Tedarikçi Ürün Adı',
    model_id: models[0].id,
    ttype: 'char',
    state: 'manual',
    size: 255,
  }]);

  console.log(`Alan oluşturuldu: ir.model.fields #${fieldId} (stock.lot.x_tedarikci_urun_adi)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
