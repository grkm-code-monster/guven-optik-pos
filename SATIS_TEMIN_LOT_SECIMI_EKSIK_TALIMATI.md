# "5.5 Temin" adımı — lot/seri takipli ürünlerde lot hiç seçilmiyor, transfer bu yüzden düşüyor

## Durum

Mesaj-gizleme düzeltmesinden sonra İlker Yolcu'nun ANADEPO'dan temin denemesinde gerçek hata ortaya
çıktı: `"Bu ürün lot/seri takipli, transfer için lot seçilmeli: ..."`. Kök neden bulundu — Temin
adımında lot seçme UI'si hiç yok, bu yüzden lot/seri takipli her ürün için temin her zaman
başarısız olacak.

## Kök neden (kodda doğrulandı)

`packages/web/src/components/sale/StokTeminStep.tsx`, `stokKontrolHesapla()` (satır 130-189):
```ts
const lotId = saleItemLotId(item)   // satır 137
```
`saleItemLotId()` (satır 46-51) SADECE satış kaleminin ÜZERİNDE zaten kayıtlı bir `odooLotId`/`lotId`
varsa değer döndürüyor. Lens/cam gibi lot takipli ürünler satışa eklenirken henüz hangi lot'tan
karşılanacağı belli olmadığı için bu alan boş oluyor — `lotId: null`.

`transferTalepGonder()` (satır 204-288), bu `null` lotId'yi doğrudan backend'e gönderiyor:
```ts
lotId: urun.lotId ?? null,
```
Backend (`transfer-core.service.ts`, `baslatTransfer()` → `assertTrackedKalemlerHaveLot()`) lot
takipli ürün için lot zorunlu kılıyor, `lotId: null` geldiğinde reddediyor — mesaj artık doğru
görünüyor ama transfer hiçbir zaman geçmiyor.

**Bu, `YeniTransfer.tsx`'te aynı sorunu çözmek için zaten kurduğumuz altyapıyla birebir aynı sorun**
(bkz. `TRANSFER_URUN_ADI_LOT_SECIMI_TALIMATI.md`, uygulanmış durumda): `searchUrunLotsByProduct()`
(`backend/src/modules/transfer/transfer.service.ts`) ve `GET /transfer/urun-lotlari?productId=&lokasyon=`
endpoint'i zaten var ve çalışıyor — sadece Temin akışına hiç bağlanmamış.

## İstenen

1. `StokTeminStep.tsx`'te, bir ürün lot/seri takipli olduğu halde `lotId` boşsa (bunu önceden bilmenin
   yolu: transfer denemesi `"lot/seri takipli"` mesajıyla başarısız olduğunda, VEYA ürünün
   `tracking` bilgisini `stok-kontrol-urun` yanıtına ekleyip baştan bilerek), `transferTalepGonder()`
   çağrılmadan önce (veya ilk deneme başarısız olduğunda) `GET /transfer/urun-lotlari?productId=&
   lokasyon=<kaynakKod>` ile o kaynak lokasyondaki mevcut lotları çekin.
2. Basit senaryo (önerilir, hızlı çözüm): tek bir uygun lot varsa (miktar her zaman 1 olduğu için
   çoğunlukla tek seçenek olacaktır) otomatik seçip transferi o lot ile tekrar deneyin — kullanıcıya
   ekstra tıklama yaptırmadan. Birden fazla lot varsa küçük bir seçim listesi/dropdown gösterin
   (`YeniTransfer.tsx`'teki lot-picker panelinin küçük bir versiyonu yeterli, aynı UI'yi kopyalamaya
   gerek yok — sade bir liste/modal olabilir).
3. Seçilen/otomatik bulunan `lotId`'yi `urunEkle`/`transferTalepGonder` payload'ına ekleyip
   `POST /admin/transfer-olustur`'u tekrar çağırın.
4. Eğer o kaynak lokasyonda hiç uygun lot bulunamazsa (beklenmedik durum), kullanıcıya net bir mesaj
   gösterin ("Bu lokasyonda uygun lot bulunamadı") — sessizce eski "Transfer başarısız" mesajına
   dönmeyin.

## Test

1. İlker Yolcu (STORE_MANAGER) ile aynı senaryo: lot takipli bir lens ürünü, yerel stok yok, ANADEPO'da
   1 adet var. "5.5 Temin" adımında artık kullanıcı ekstra bir şey yapmadan (veya varsa lot seçip)
   transferin gerçekten oluştuğunu, `INSUFFICIENT_PERMISSION`/`"Transfer başarısız"` almadığını
   gösterin.
2. Lot takipli OLMAYAN bir ürünle (ör. çerçeve, `tracking: none`) aynı akışın hâlâ eskisi gibi
   sorunsuz çalıştığını doğrulayın (regresyon kontrolü).
3. Kaynak lokasyonda gerçekten uygun lot yoksa (edge case) net bir hata mesajı gösterildiğini
   doğrulayın.

## Rapor formatı

Değişen dosyalar + üç test senaryosunun ekran görüntüsü/sonucu (özellikle İlker'in orijinal
senaryosunun artık çalıştığını gösteren).
