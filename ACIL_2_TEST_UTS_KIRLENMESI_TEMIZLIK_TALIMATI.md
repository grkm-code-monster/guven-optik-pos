# ACİL (2. kez) — Test scripti #5572'nin GERÇEK lotlarına sahte UTS kodu yazdı, temizlenmedi

## Durum

`test-uts-duzeltme-lot-bazli.ts`, gerçek üründe (#5572, ULTRA KONTAKT LENS -0125) TEST 2 ve TEST 4
adımlarında sahte UTS değerleri (`0868LOTA<timestamp>`, `0868LOTB<timestamp>`,
`08689999999999`) yazıyor ve script sonunda bunları GERİ ALMIYOR — rollback/cleanup kodu yok.
Kodu okudum, doğruladım: bu gerçekten böyle.

Bu, bu oturumda ÜÇÜNCÜ kez yaşanan aynı hata (önce ZAROSSI, sonra #5572'nin stok miktarı, şimdi
#5572'nin UTS kodu) — test scriptleri disposable/test verisi yerine CANLI ürünler üzerinde
çalışıp temizlenmeden bırakılıyor. Bu artık sistemik bir alışkanlık sorunu, sadece bu seferki veri
düzeltmesiyle değil, İLERİYE DÖNÜK bir kural değişikliğiyle de çözülmeli.

## 1) ACİL — #5572'nin hangi lotlarına sahte UTS yazıldığını bulup temizleyin

1. Product #5572'nin TÜM `stock.lot` kayıtlarını okuyun (`context: active_test:false`), `x_uts_kodu`
   alanı `0868LOTA`, `0868LOTB`, `08689999999999`, `0868TEST` gibi ÖNEKLERLE başlayan HERHANGİ bir
   kayıt var mı tarayın (bu script + önceki UTS testinin bıraktığı TÜM sahte değerleri kapsayın,
   sadece bu son testi değil).
2. Bulunan her sahte kayıt için `x_uts_kodu` alanını `false`/boş yapın (`stock.lot.write`) — GERÇEK
   UTS kodu bu lotlar için henüz bilinmiyor, boş bırakmak doğru olan, uydurma bir değer YAZMAYIN.
3. Düzeltme sonrası #5572'nin 13 gerçek lotunun HİÇBİRİNDE test-kaynaklı UTS kalmadığını,
   hepsinin ya gerçek bir UTS koduna ya da boşa sahip olduğunu raporlayın.

## 2) YAPISAL DÜZELTME — bundan sonra hiçbir test canlı ürüne yazmasın

Bu üçüncü tekrar — bir sonraki talimatta da unutulmasın diye somut bir kural koyalım:

- Yazdığınız/yazacağınız TÜM test scriptlerinde, gerçek yazma işlemi gerektiren testler
  (create/write/unlink çağıran) SADECE script içinde YENİ oluşturulan, tamamen disposable bir
  test ürünü/varyantı/lotu üzerinde çalışmalı — `PRODUCT_ID = 5572` gibi GERÇEK, üretimde olan bir
  id'yi asla hard-code etmeyin.
- Eğer gerçek bir ürün üzerinde test etmek KAÇINILMAZSA (örn. bu konudaki gibi export/import
  entegrasyon testi), script ZORUNLU olarak: (a) test öncesi durumu okuyup kaydetsin, (b) test
  sonunda yazdığı HER ŞEYİ (yazdığı alanları eski hâline) geri alsın — `finally` bloğunda, hata
  olsa bile çalışacak şekilde.
- `fix-tracking-serial.ts`'teki gibi `--execute` bayrağı olmadan varsayılan DRY-RUN çalışan bir
  desen tercih edin; gerçek yazma gerektiren testler varsayılan olarak sadece OKUSUN, yazma
  adımları AÇIKÇA istenmedikçe çalışmasın.
- Bundan sonraki her raporda, "bu test hangi GERÇEK kayıtlara dokundu ve nasıl geri alındı"
  sorusuna açık cevap verin — cevap veremiyorsanız, test tasarımını değiştirin.

## Test

1. #5572'nin lot listesini (id, name, x_uts_kodu) tam olarak gösterin — hiçbir satırda test öneki
   kalmadığını kanıtlayın.
2. Bundan sonra yazacağınız test scriptlerinin (varsa bu talimat kapsamında yeni yazılan) gerçek
   veriye kalıcı iz bırakmadığını, disposable veri kullandığını gösterin.

## Rapor formatı

Bulunan/temizlenen sahte UTS kayıtları (lot id + eski/yeni değer) + #5572'nin nihai temiz lot
listesi + ileriye dönük test disiplini için yapılan somut değişiklik (varsa kod/script örneği).
