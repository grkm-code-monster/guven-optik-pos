# Envanter Girişi — "Kategori adı birden fazla olası eşleşmeye sahip" hatası ZAROSSI importunu tamamen blokluyor

## Durum

Görkem, ZAROSSI OPTİK ÇERÇEVE satırlarını Envanter Girişi'nden içe aktarmaya çalıştı — 4 satırın
4'ü de **"Kategori adı birden fazla olası eşleşmeye sahip, tam adını netleştirin."** hatasıyla
`BAŞARISIZ` döndü. Bu, arşivli kayıtlarla İLGİLİ DEĞİL — daha önce eklenen
`KATEGORI_IKILENMESI_ONLEME_TALIMATI.md`'deki güvenlik kontrolü (`resolveOrCreateCategoryId()`,
`odoo-category.util.ts`) devreye giriyor: Excel'deki Kategori hücresi ("All / OPTİK ÇERÇEVE / ALT
GRUP" gibi) Odoo'da BİRDEN FAZLA kategoriyle eşleşiyor, kontrol sessizce birini seçmek yerine
hata veriyor (TASARIM GEREĞİ doğru davranış) — ama bu import'u tamamen TIKIYOR ve HANGİ
kategorilerin çakıştığını göstermediği için kimse (Görkem dahil) sorunu göremiyor/çözemiyor.

## İstenen

### 1) Gerçek çakışan kategorileri tespit edin ve raporlayın

`uygulaEnvanterImport()`'un `createEnvanterSablon()` çağrısını saran try/catch (satır ~106-116
civarı), `OdooCategoryMatchError` yakalandığında sadece `e.message`'ı alıyor,
`e.candidates`'ı (id + complete_name listesi) TAMAMEN atıyor. Önce bu candidates listesini
loglayın/raporda gösterin — ZAROSSI'nin Excel'deki tam Kategori metni ("All / OPTİK ÇERÇEVE / ALT
GRUP" ya da neyse) hangi 2+ gerçek Odoo kategorisiyle (id + complete_name) eşleşiyor, bunu AÇIKÇA
raporda gösterin. Bu muhtemelen Görkem'in çok önce fark ettiği "bir kategori ikiye bölünmüş"
durumunun HÂLÂ Odoo'da duran hali.

### 2) Hata mesajına candidates'ı ekleyin (kalıcı iyileştirme)

`EnvanterUygulaSatirSonuc`'a opsiyonel bir `kategoriAdaylari?: Array<{id:number; completeName:
string}>` alanı ekleyin. `OdooCategoryMatchError` yakalandığında bu alanı doldurun, frontend
(`ExcelEnvanterImportTab.tsx`, "Başarısız satırlar" listesi) bu adayları görünür şekilde
gösterisin (örn. "Olası kategoriler: #12 All/Optik Çerçeve, #47 All/Optik Çerçeve/Alt Grup —
hangisi doğruysa Excel'e tam yolunu yazın"). Böylece bu tür bir hata BİR DAHA çıktığında kullanıcı
Cursor'a sormadan kendi başına çözebilir.

### 3) ZAROSSI importunu şimdi tamamlayın

1. maddede bulduğunuz gerçek adaylardan hangisinin doğru kategori olduğunu (mevcut ZAROSSI/OPTİK
ÇERÇEVE ürünlerinin şu an hangi kategoride olduğuna bakarak) belirleyip, Görkem'e Excel'in Kategori
sütununa hangi TAM `complete_name`'i yazması gerektiğini söyleyin (ya da isterseniz siz test
importunu o tam adla deneyip başarılı olduğunu gösterin). Kategorileri KENDİLİĞİNİZDEN
birleştirmeyin/silmeyin — bu ayrı bir manuel veri temizliği kararı, sadece hangi tam adın
kullanılması gerektiğini netleştirin.

## Test

1. 1. maddedeki adayları gösterin (id + complete_name).
2. Doğru tam kategori adıyla ZAROSSI satırlarının artık BAŞARILI şekilde aktarıldığını gösterin.
3. `kategoriAdaylari` alanının frontend'de göründüğünü, kasıtlı olarak belirsiz bir kategori adıyla
   tekrar deneyip hata mesajının artık adayları listelediğini gösterin.

## Rapor formatı

Bulunan gerçek çakışan kategoriler (id + complete_name) + değişen dosyalar/satırlar + ZAROSSI
importunun başarılı sonucu.
