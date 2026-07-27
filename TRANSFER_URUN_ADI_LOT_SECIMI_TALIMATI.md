# Transfer — "Ürün adı" ile arama, lot/seri takipli üründe lot seçtiremiyor

## Durum

Görkem, Transferler → Yeni Transfer ekranında kamera/barkod okuma çalışmadığında "Ürün adı" arama
yöntemiyle ürünü (ör. ULTRA KONTAKT LENS -0100) bulup eklediğinde şu hatayı alıyor: "Bu ürün lot/seri
takipli, transfer için lot seçilmeli". Ürünü isimle bulduktan sonra hangi lotu kastettiğini seçecek
hiçbir arayüz yok.

## Kök neden (kodda doğrulandı)

`backend/src/modules/transfer/transfer.service.ts`:

- `searchUrun()` (satır 647), `yontem === 'ad'` ise doğrudan `searchUrunByNameCatalog()`'a gidiyor
  (satır 658) — bu fonksiyon `stock.quant`/lot sorgusuna hiç uğramıyor, sadece Odoo
  `product.template`/`product.product` üzerinden ürün/varyant bilgisi çekiyor.
- Sonuç, `mapVariantToTransferUrun()` (satır 157-174) ile şekilleniyor ve **`lotNo: null` sabit**
  (satır 168), ayrıca dönüşte `tracking` alanı **hiç yok**.
- Buna karşılık `yontem === 'barkod' | 'uts' | 'lot' | 'ref'` yolları `stock.quant`'ı gerçek
  lokasyona göre sorgulayıp (`quantDomain`, satır 700-707) her satırı `mapQuantToUrun()` (satır
  318-370) ile lot'u ve gerçek `tracking` değerini (Odoo `product.product.tracking` alanı) doğru
  dolduruyor.

Frontend (`packages/web/src/components/transfer/YeniTransfer.tsx`, `urunEkle()`, satır 118-125),
backend'den `tracking` gelmediği için `String(u.tracking ?? 'none')` ile sessizce `'none'`
varsayıyor — yani "Ürün adı" sonucu bazen hatasız da eklenebiliyor ama gerçekte lotsuz, ve transfer
başlatılırken (`transferBaslat()`, satır 166-170) aynı kontrol tekrar çalışıp reddediyor. Kısacası:
**"Ürün adı" ile arama, lot/seri takipli bir ürünü asla geçerli şekilde transfere ekleyemez** —
kullanıcının elinde şu an tek çözüm barkod/UTS/Lot-Seri yöntemiyle aramak, ki bunlar için de zaten
o spesifik lotun barkodunu/kodunu bilmesi/okutması gerekiyor.

## İstenen

"Ürün adı" ile arayıp bir sonuca tıklandığında, seçilen ürün lot/seri takipliyse (Odoo
`product.product.tracking !== 'none'`) doğrudan transfer listesine eklemek yerine **ikinci bir adım**
açılsın: o ürünün, seçili Çıkış Lokasyonu'ndaki mevcut lotlarını listeleyen bir seçim listesi
(lot no, miktar, UTS durumu ile). Kullanıcı bir lot seçince asıl `urunEkle()` o lot bilgisiyle
çalışsın. Aynı mantık zaten `mapQuantToUrun()`'da var — o sorguyu (ürün id'sine göre daraltılmış
`stock.quant` sorgusu) buraya da uygulayın, tekerleği yeniden icat etmeyin.

Öneri akış:
1. Backend: `GET /transfer/urun-ara?yontem=ad` sonucundaki her satıra artık gerçek `tracking`
   değerini de ekleyin (Odoo'dan `tracking` alanını okuyup dönün — `mapVariantToTransferUrun()`'a
   `tracking` parametresi geçirin).
2. Yeni bir uç nokta veya mevcut `urun-ara`'ya `productId` parametresiyle "bu ürünün bu
   lokasyondaki lotlarını getir" modu ekleyin (temelde `mapQuantToUrun()`'un kullandığı
   `stock.quant` sorgusunun aynısı, sadece `product_id` sabit).
3. Frontend: `urunEkle()`'de, seçilen sonucun `tracking !== 'none'` olduğu ve `lotNo` boş geldiği
   durumda, direkt eklemek yerine o ürünün lotlarını çeken bir alt liste/modal açın; kullanıcı
   lotu seçtikten sonra asıl ekleme (`lotId`/`lotNo` dolu) gerçekleşsin.
4. Ürünün o lokasyonda hiç lotu/stoku yoksa ("0 adet") kullanıcıya net bir mesaj gösterin
   ("Bu üründe [lokasyon] içinde stokta lot yok") — sessizce reddetmeyin.

## Test

1. Lot/seri takipli bir ürünü (ör. ULTRA KONTAKT LENS) "Ürün adı" ile arayıp seçin.
2. O ürünün seçili lokasyondaki mevcut lotlarının listelendiğini, birini seçince transfer
   satırına doğru lot bilgisiyle eklendiğini gösterin.
3. "Transferi Başlat" artık bu ürün için hata vermemeli.
4. Barkod/UTS/Lot-Seri arama yöntemlerinin davranışı değişmemiş olmalı (regresyon yok).

## Rapor formatı

Değişen dosyalar + önce/sonra ekran görüntüsü (ürün adıyla arama → lot seçimi → transfere ekleme).
