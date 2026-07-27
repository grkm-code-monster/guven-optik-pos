# ACİL — UTS Düzeltme testleri gerçek ürün #5572'nin stoğunu bozmuş olabilir + çoklu-lot tasarım açığı

## Durum — commit ATILMADAN önce bunlar netleşmeli

Son rapor kendi test çıktısında şunu söylüyor: *"Lot #555 → 99999'a set edildi"* ve *"#5572
(ULTRA -0125) çok lotlu seri ürün; test koşuları toplam stoğu şişirmiş olabilir. Gerekirse
temizlik scripti ile kontrol edin."* — bu, test scriptinin GERÇEK ürün #5572 üzerinde
(disposable/test ürünü DEĞİL, tüm oturum boyunca debug ettiğimiz gerçek ULTRA KONTAKT LENS -0125)
çalıştığı ve en az bir lotun miktarını 99999 gibi anlamsız bir değere SET ettiği anlamına geliyor.
Bu, ZAROSSI'de daha önce yaşadığımız "test scripti canlı veriye dokundu" durumunun aynısı — commit
atmadan ÖNCE gerçek veri bütünlüğü doğrulanmalı.

## 1) ACİL — #5572'nin gerçek stok durumunu doğrulayın ve düzeltin

1. Ürün #5572 (ULTRA KONTAKT LENS -0125, barkod 785811314552)'nin TÜM lokasyonlardaki
   `stock.quant` kayıtlarını (`context: active_test:false`, lot_id dahil) okuyun.
2. Lot #555 dahil, anormal görünen (99999 gibi) herhangi bir miktar var mı kontrol edin.
3. Varsa: bu testten ÖNCEKİ gerçek/doğru miktarı (mümkünse test öncesi log'lardan veya bu oturumun
   önceki teşhis raporlarındaki "13 lot, ANADEPO×11 GVN2×1 GVN3×1" bilgisinden) tespit edip, o
   spesifik lot/lokasyon quant'ını GERÇEK değerine geri döndürün (`applyStockAdjustment`
   ile — ZAROSSI temizliğinde kullanılan AYNI güvenli desen).
4. Test sırasında dokunulan BAŞKA gerçek lot/quant var mı (sadece #555 değil, tüm test
   çalıştırmalarını gözden geçirin) — hepsini tespit edip düzeltin.
5. Düzeltme sonrası #5572'nin toplam stoğunun teşhis raporlarındaki bilinen gerçek değere
   (13 birim, ilgili lokasyonlara dağılmış) döndüğünü doğrulayın.

**Bundan sonraki testler için:** gerçek/canlı ürünler üzerinde (özellikle stok miktarını
DEĞİŞTİREN testlerde) ASLA gerçek veriye yazmayın — ya tamamen disposable bir test ürünü/varyantı
oluşturup testi onun üzerinde yapın ya da dry-run/mock modunda test edin. Bu, bu oturumda ZAROSSI
ile de yaşandı, tekrar etmemeli.

## 2) Tasarım açığı — çoklu lotlu ürünlerde UTS düzeltmesi belirsiz/riskli

`findLotNameForUtsCorrection()` ve `skipStockAdjust` mantığı TEK lotlu ürünler için doğru
çalışıyor ama ÇOKLU lotlu ürünlerde (ULTRA KONTAKT LENS gibi — aynı barkod altında onlarca ayrı
seri/lot) iki gerçek sorun var:

- `findLotNameForUtsCorrection`'daki `byRef` eşleşmesi `.find()` ile İLK eşleşen lotu seçiyor —
  aynı barkoda (`ref`) sahip 13 lot varsa hangisinin seçileceği KEYFİ. UTS Kodu genelde ürün
  SKU'suna (GTIN) bağlı olduğu için tüm lotlara aynı değerin yazılması muhtemelen DOĞRU olan ama
  şu anki kod SADECE BİRİNİ günceller, diğer 12 lot hâlâ UTS'siz kalır.
- `skipStockAdjust` sadece `row.adet === toplam_stok` ise stok değişikliğini atlıyor — eşitse
  sorun yok, ama eşit DEĞİLSE (örn. şablon export edildikten sonra stok değiştiyse, ya da kullanıcı
  yanlışlıkla farklı bir sayı yazdıysa) `applyStockAdjustmentForLot` TEK BİR lotun miktarını
  `row.adet` (muhtemelen TOPLAM stoğu temsil eden bir sayı) değerine SET ediyor — bu, o tek lotun
  miktarını yanlışlıkla toplam stok kadar şişirebilir (muhtemelen #5572'de olan tam olarak bu).

**İstenen düzeltme:** Çoklu lotlu ürünlerde UTS düzeltme akışını GÜVENLİ hâle getirin:
- Varyantın birden fazla AKTİF/stoklu lotu varsa, `odooVaryantId` ile gelen tek satırlık UTS
  düzeltmesini SADECE "boş UTS'si olan TÜM lotlara aynı UTS kodunu yaz" olarak uygulayın (`byRef`
  ile ilk bulunanı değil, `x_uts_kodu` boş olan HEPSİNİ güncelleyin) — stok miktarına KESİNLİKLE
  dokunmayın bu durumda (`skipStockAdjust`'ı çoklu lotlu ürünlerde HER ZAMAN true yapın, adet
  eşleşmesine bakmadan — çünkü tek bir "Adet" hücresi çoklu lotu güvenle temsil edemez).
- Tek lotlu ürünlerde mevcut davranış (adet eşleşirse atla, eşleşmezse mevcut TEK lotu güncelle)
  aynen kalsın.

## Test

1. #5572'nin düzeltilmiş/doğru stok durumunu ekran görüntüsü ve Odoo sorgu çıktısıyla gösterin.
2. Çoklu lotlu bir üründe (yine #5572 kullanılabilir, artık gerçek veri düzeltildikten sonra)
   UTS düzeltme akışını çalıştırıp TÜM boş-UTS lotların doldurulduğunu, stok miktarının
   DEĞİŞMEDİĞİNİ doğrulayın.
3. Tek lotlu bir üründe (ZAROSSI gibi) önceki davranışın bozulmadığını doğrulayın.

## Rapor formatı

#5572'nin bulunan/düzeltilen gerçek durumu + çoklu-lot mantığındaki değişiklik (dosya/satır) +
test 1-3 sonucu. Bu talimat tamamlanıp doğrulanana kadar commit ATILMAMALI.
