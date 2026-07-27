# e-İrsaliye — Uyumsoft "1195 SİSTEM HATASI" kök nedeni + zarf durumu hiç sorgulanmıyor

## Durum

Alias düzeltmesi (defaultpk placeholder filtreleme) doğrulandı, çalışıyor. Ama son iki canlı testte
(`IRS-1784554289503`, `IRS-1784554580751`) `SendDespatch` çağrısı `IsSucceded=true` dönüyor (bizim
log'da "basarili" görünüyor), ama Uyumsoft'un giden kutusu sorgusunda (`GetOutboxDespatchList`)
gerçek durum **`StatusEnum=Error`, `Message=1195 SİSTEM HATASI`** — yani irsaliye Uyumsoft'a kabul
edilmiş ama GİB tarafına iletiminde/işlenmesinde reddedilmiş. Bizim sistemimiz bunu hiç fark etmiyor,
kullanıcıya "başarılı" gösteriyor.

## Kök neden adayı (kodda bulundu — doğrulanması gerekiyor)

`backend/src/modules/efatura/uyumsoft-irsaliye.service.ts`, `buildPartyXml()` (satır 186-193):

```ts
<cbc:StreetName>${escapeXML(party.adres || '-')}</cbc:StreetName>
<cbc:CitySubdivisionName>${escapeXML(party.ilce || '-')}</cbc:CitySubdivisionName>
<cbc:CityName>${escapeXML(party.il || 'İZMİR')}</cbc:CityName>
```

`party.adres`/`party.ilce` boşsa literal **`"-"`** karakteri UBL XML'e yazılıyor. Bu değerler
`getSupplierInfo()` → `Branch` kaydından geliyor. Daha önce bu oturumda NG/ADESE/POTENTIAL
şubelerinin `il`/`ilce` alanlarının veritabanında boş olduğu tespit edilmişti (Görkem'in henüz
tamamlamadığı bir veri girişi). GİB e-belge doğrulaması gerçek il/ilçe adı bekler — tek karakter
"-" göndermek, GİB/Uyumsoft tarafında "1195 SİSTEM HATASI" gibi genel bir reddin makul bir sebebi.

## İstenen

### 1. Kök neden doğrulaması (öncelik)

1. GVN2 şubesinin (ve bu testte kullanılan alıcı/gönderen taraf her neyse) veritabanındaki
   `Branch.adres`/`Branch.il`/`Branch.ilce` alanlarını doğrudan sorgulayıp gerçekten boş/`"-"` olup
   olmadığını doğrulayın.
2. Boşsa: bu şubeye (test amaçlı, geçici de olsa) gerçek bir il/ilçe/adres girip AYNI transferi
   tekrar deneyin — eğer bu sefer `StatusEnum=Success` dönerse kök neden kesinleşmiş olur.
3. Sonucu ne olursa olsun (doğrulandı/doğrulanmadı) net raporlayın — tahminle "büyük ihtimalle
   budur" demeyin, gerçek test sonucunu yazın.
4. Kök neden doğrulanırsa: `buildPartyXml()`'de `adres`/`ilce` boşken **göndermeden önce** açık bir
   hata fırlatın ("Şube adres/ilçe bilgisi eksik, e-İrsaliye gönderilemez") — sessizce "-" göndermek
   yerine, transfer başlamadan/post-action'da net bir uyarı gösterin. Görkem'e de hangi şube(ler)in
   veri girişini tamamlaması gerektiğini (Branch adı + eksik alan) ayrıca listeleyin.

### 2. Zarf durumu hiç sorgulanmıyor — kalıcı görünürlük düzeltmesi

1. `sendDespatch()` başarılı (`IsSucceded=true`) döndükten sonra, Uyumsoft'un zarf/durum sorgulama
   servisini (`GetOutboxDespatchList` / `GetOutboxDespatch` veya varsa daha uygun bir
   `QueryOutboxDespatchStatus` benzeri metod) kullanarak **kısa bir gecikmeyle (ör. 5-10 sn sonra,
   ya da bir arka plan job/cron ile)** gerçek `StatusEnum`'u kontrol eden bir adım ekleyin.
2. `StatusEnum=Error` ise: `TransferAksiyonLog` kaydını `basarisiz` olarak GÜNCELLEYİN (gerçek
   Uyumsoft mesajıyla), ve `notifyEirsaliyeFailure()` bildirimini bu noktada tetikleyin — şu anki
   davranış (ilk kabulde "basarili" yazıp bırakmak) yanıltıcı, düzeltilmeli.
3. Aynı kör noktanın e-Fatura tarafında (`uyumsoft-efatura.service.ts`, `tetikleTransferEFatura`)
   olup olmadığını kontrol edin — orada da sadece ilk kabul mü kontrol ediliyor, yoksa gerçek
   Uyumsoft durumu sorgulanıyor mu? Aynı sorunsa aynı düzeltmeyi orada da uygulayın.
4. Anlık senkron sorgu pratik değilse, mevcut bir cron/job altyapısı varsa (yoksa basit bir
   `setTimeout`/periyodik job yeterli, aşırı mühendislik yapmayın) durumu birkaç dakika içinde
   tekrar kontrol edip günceller.

## Test

1. Kök neden testi: eksik adres/ilçe dolduruldu, aynı transfer denendi, gerçek Uyumsoft sonucu
   (Success/Error) raporlandı.
2. Bilerek eksik bırakılmış bir başka şubeyle transfer denenip artık sessizce "-" gönderilmediği,
   net bir hata/uyarı çıktığı gösterildi.
3. Durum sorgulama eklendikten sonra: bir irsaliye gönderimi yapılıp birkaç dakika içinde
   `TransferAksiyonLog`/bildirimin gerçek nihai durumu (Success ya da Error+mesaj) yansıttığı
   gösterildi.

## Rapor formatı

Kök neden doğrulama sonucu (gerçek test) + değişen dosyalar + hangi şube(ler)in veri eksik olduğu
listesi + durum-sorgulama akışının önce/sonra davranışı.
