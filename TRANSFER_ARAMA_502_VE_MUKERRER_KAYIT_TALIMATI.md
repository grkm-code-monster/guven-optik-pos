# Transfer ürün arama — ham GS1 barkodu 502'ye düşürüyor + arama sonuçlarında mükerrer kayıt

## Durum

Görkem, Transfer ekranında kamerayla taranan ham bir GS1 barkodunu (`01007858113145901730010210R42015835`
— GTIN(01)+son kullanma(17)+lot(10) art arda, ayraçsız) arama kutusuna göndermesi sonucunda
**dört arama yönteminde de (Ürün adı, Lot/Seri, İç referans, UTS kodu) 502 Bad Gateway** aldı —
tekrarlanabilir, tek seferlik değil. Aynı anda tarayıcı konsolunda arama sonuçlarında React "aynı
key" uyarıları da var (`Encountered two children with the same key, "5520--MU7135 / C1 / 50"` vb.) —
bu, arama sonuç listesinde gerçek mükerrer kayıtlar döndüğü anlamına geliyor.

## Olası kök nedenler (araştırılması istenen)

1. **"Ürün adı" araması N+1 desenli:** `backend/src/modules/transfer/transfer.service.ts`,
   `searchUrunByNameCatalog()` (satır 546-618), her `product.template` sonucu için AYRI bir
   `product.product` XML-RPC çağrısı yapıyor (satır 579-585, sıralı `for` döngüsü içinde), üstelik
   bunu 3 şirket (`sirketIds = [2,3,4]`) için tekrarlıyor (satır 561-573). 36 karakterlik bu tuhaf
   string `ilike` ile beklenenden fazla şablonla eşleşiyorsa (veya Odoo bu uzun terimde yavaşsa),
   bu sıralı N+1 XML-RPC zinciri kolayca proxy zaman aşımına (→ 502) sebep olabilir — geçen hafta
   Uyumsoft tarafında çözdüğümüz sorunla aynı desen. `mapWithConcurrency` (zaten
   `backend/src/utils/map-with-concurrency.ts`'te var) burada da uygulanabilir.
2. **Ham barkod filtrelenmeden gönderiliyor:** Kamera bileşeni (`BarkodKameraInput.tsx`) okuduğu
   kodu doğrudan `aramaMetni`'ne yazıyor, GS1 AI (Application Identifier) ayrıştırması yapmıyor.
   Gerçek bir UTS/lot arama kutusuna bu kadar uzun/karma bir ham string gitmemeli — en azından
   ilgili AI segmentini (ör. sadece seri/lot kısmını) ayıklayıp göndermek hem daha doğru sonuç
   verir hem de yukarıdaki #1'deki riski azaltır.
3. **Mükerrer arama sonucu satırları:** React key çakışması, aynı ürün/lot için birden fazla
   `stock.quant` satırının (veya `mergeCatalogVariants`/PTAV eşleştirmesinin, satır 611-615)
   duplicate sonuç ürettiğini gösteriyor. Kaynağını bulup (muhtemelen aynı lot birden fazla
   konumda/partide parçalanmışsa veya PTAV+katalog sonuçları çakışıyorsa) sonuçları `id`+`lotId`
   bazında dedup'layın.

## İstenen

1. Backend loglarında bu spesifik string ile yapılan `urun-ara` isteklerinin ne kadar sürdüğünü/
   kaç XML-RPC çağrısı yaptığını ölçün — gerçekten zaman aşımı mı, yoksa başka bir hata mı (backend
   konsolunda bu istekler için stack trace olup olmadığına bakın).
2. `searchUrunByNameCatalog()`'daki sıralı per-template `product.product` döngüsünü ve 3-şirket
   döngüsünü `mapWithConcurrency` ile sınırlı paralelliğe geçirin (Uyumsoft'ta yaptığımız gibi).
3. Arama sonuçlarındaki mükerrer kayıtları (`id`+`lotId`+`varyant` bazında) backend'de veya
   frontend'de dedup'layın — React key uyarısı bir daha çıkmamalı.
4. (Opsiyonel ama önerilir) Kamera taramasında, aktif arama yöntemi Lot/Seri veya UTS kodu ise ve
   okunan kod GS1 formatında (AI'larla) görünüyorsa, ilgili AI segmentini ayıklayıp sadece onu
   arama kutusuna yazın — ham stringi olduğu gibi göndermeyin.

## Test

1. Aynı ham barkod string'iyle dört arama yöntemini de tekrar deneyip artık 502 almadığınızı
   (ya "sonuç yok" ya da makul sürede sonuç döndüğünü) gösterin.
2. Arama sonuçlarında artık React "aynı key" uyarısı çıkmadığını (tarayıcı konsolu temiz) gösterin.

## Rapor formatı

Değişen dosyalar + önce/sonra süre ölçümü + konsol ekran görüntüsü (uyarı yok).
