# Ürün/varyant arşivlenince barkod ve UTS kodu "DELETE_" öneki alsın

## Durum

Görkem'in yaşadığı zincir: ZAROSSI ürünleri bir noktada arşivlenmiş. Şimdi AYNI barkod/UTS
kodlarıyla envanteri yeniden (temiz/doğru şekilde) Envanter Girişi'nden aktarmaya çalışınca, sistem
haklı olarak **"Barkod Odoo'da zaten kayıtlı"** diyerek TÜM satırları reddediyor — çünkü arşivdeki
eski kayıt hâlâ AYNI barkodu taşıyor. Görkem'in istediği çözüm: **"Barkodlar UTS'leri arşive
atılınca, numaraların başına 'DELETE_' diye bir şey oluşsun. Bu sayede arşive attığımız bir ürünün
barkodlarını ve UTS'lerini tekrar girerken benzeşme ortadan kalkar ve hata almayız."**

## Mevcut durum (kodda doğrulandı)

- `backend/src/modules/admin/stok-yonetimi.service.ts`, `setTemplateActiveBatch()` (satır
  448-476, `topluUrunArsivle`/`topluUrunArsivdenCikar`'ın kullandığı) ve
  `setVariantActiveBatch()` (satır 486-505, `topluVaryantArsivle`/`topluVaryantArsivdenCikar`'ın
  kullandığı) — İKİSİ DE sadece `active` alanını yazıyor, `barcode` alanına HİÇ dokunmuyor.
- `backend/src/modules/admin/envanter-import.service.ts`, `loadOdooLookup()`'taki `barcodeSet`
  (satır 251-259), `product.product` üzerindeki `barcode` alanını okuyup çakışma kontrolü yapıyor
  — arşivli kaydın barkodu HÂLÂ ORİJİNAL haliyle durduğu için yeni bir satır aynı barkodla
  denendiğinde çakışma tespit ediliyor (bu aslında DOĞRU/güvenli davranış, ama Görkem'in gerçek
  ihtiyacını — "bu ürünü artık kullanmıyorum, barkodunu yeni bir kayıt için serbest bırak" —
  engelliyor).
- UTS kodu tarafında, `x_uts_kodu` alanı `stock.lot` üzerinde tutuluyor (`product.product`/
  `product.template` üzerinde DEĞİL — `stock-lot.service.ts`, `getOrCreateStockLot()`). Yani
  "UTS'yi de öneklendirmek" burada `product.product.barcode` değil, ilgili varyanta bağlı
  `stock.lot` kayıtlarının `x_uts_kodu` (ve muhtemelen `ref`) alanlarını kapsamalı.

## İstenen

### 1) Arşivleme sırasında barkod + UTS kodu "DELETE_" önekini alsın

`setTemplateActiveBatch()` ve `setVariantActiveBatch()`'i güncelleyin — **sadece `active=false`
YAZARKEN** (yani arşivleme yönünde, arşivden çıkarma yönünde DEĞİL):

- İlgili `product.product` (varyant) kaydının `barcode` alanını okuyun. Doluysa ve HENÜZ
  `DELETE_` ile başlamıyorsa (çift önekleme olmasın — idempotent olsun), `barcode` alanını
  `DELETE_${orijinalBarkod}` olarak YAZIN.
- Aynı varyanta bağlı `stock.lot` kayıtlarını (`product_id = variantId`) bulup, `x_uts_kodu` doluysa
  ve henüz `DELETE_` ile başlamıyorsa AYNI şekilde `DELETE_${orijinalUtsKodu}` yapın. (`ref` alanı
  da barkodu tutuyor olabilir — `getOrCreateStockLot`'ta `lotVals.ref = barkod` yazıldığını
  gördük — o alanı da aynı mantıkla öneklendirin.)
- `setTemplateActiveBatch()`'te şablonun TÜM varyantları için bunu yapın (zaten fonksiyon içinde
  varyant id listesini topluyor, aynı döngüde barkod/UTS öneklemeyi de ekleyin).

### 2) Arşivden çıkarınca önek KALDIRILSIN (orijinal geri gelsin)

Aynı fonksiyonların **`active=true` YAZDIĞI** (arşivden çıkarma) dalında, tam tersini yapın:

- `barcode` alanı `DELETE_` ile başlıyorsa, öneki kaldırıp ORİJİNAL barkodu geri yazın (`DELETE_`
  önekini strip etmek yeterli — ayrı bir "orijinal değer" deposu tutmanıza gerek yok, önek
  kaldırılabilir/tersine çevrilebilir bir işlem).
- Aynı şekilde ilgili `stock.lot` kayıtlarının `x_uts_kodu`/`ref` alanlarındaki `DELETE_` önekini
  kaldırın.
- **Çakışma ihtimaline dikkat edin:** arşivden çıkarırken, o orijinal barkod/UTS kodu bu ARADA
  BAŞKA bir (yeni aktarılmış) ürüne atanmış olabilir. Böyle bir çakışma tespit ederseniz (restore
  etmeden ÖNCE `barcode`'un o an Odoo'da BAŞKA bir aktif kayıtta kullanılıp kullanılmadığını
  kontrol edin), sessizce üzerine yazmayın — sonuç listesinde bu satırı "barkod çakışıyor, önek
  kaldırılamadı" gibi AÇIK bir uyarıyla işaretleyin, kullanıcı manuel karar versin.

### 3) Diğer arşivleme yolları da tutarlı olsun

Codebase'te başka bir yerden de `product.template`/`product.product` üzerine `active: false`
yazan bir kod yolu varsa (ör. Odoo'nun kendi arşiv butonu değil, bizim API'lerimiz üzerinden), aynı
öneklemeyi orada da uygulayın — tek merkezi bir yardımcı fonksiyona (`arsivlerkenBarkodUtsOneklendir`/
`arsivdenCikarirkenOnekKaldir` gibi) çıkarıp HER İKİ fonksiyondan da (`setTemplateActiveBatch`,
`setVariantActiveBatch`) çağırmanız kod tekrarını önler.

## Test (ZORUNLU)

1. Gerçek barkodlu/UTS'li bir varyantı arşivleyip, Odoo'da `barcode` ve ilgili `stock.lot.x_uts_kodu`
   alanlarının `DELETE_` önekiyle güncellendiğini gösterin.
2. Aynı (orijinal, öneksiz) barkod/UTS koduyla Envanter Girişi'nden YENİ bir satır aktarıp, artık
   "Barkod Odoo'da zaten kayıtlı" hatası ALMADIĞINI ve başarıyla aktarıldığını gösterin.
3. Arşivlenen ürünü "Arşivden Çıkar" ile geri çıkarıp, `barcode`/`x_uts_kodu`'nun ORİJİNAL (öneksiz)
   haline döndüğünü doğrulayın.
4. 3. maddedeki geri-çıkarma sırasında, o barkodun bu arada BAŞKA bir aktif üründe kullanılmaya
   başladığı bir çakışma senaryosunu deneyip, sistemin sessizce üzerine YAZMADIĞINI, açık bir uyarı
   verdiğini gösterin.
5. Görkem'in gerçek ZAROSSI barkodlarıyla (22442529, 22442680, 22442697, 86932839003381) bu akışı
   uçtan uca deneyip artık başarıyla yeniden aktarılabildiğini gösterin.

## Rapor formatı

Değişen dosyalar/satırlar + test 1-5'in gerçek Odoo verisiyle sonucu (öncesi/sonrası barkod ve
x_uts_kodu değerleri).
