# Stok Kontrol — ürün adında renk kodu eksik + satır genişletince UTS/Lot bilgisi

## İstek (2 madde)

1. Stok Kontrol tablosunda ürün adı sütunu "OPTELLİ OPTİK ÇERÇEVE (OP11854, 53)" gibi görünüyor —
   **RENK (C6-5) hiç yok**, sadece Model ve Ölçü var. Stok Yönetimi'ndeki (aynı varyant için) "MODEL:
   OP11854 / RENK: C6-5 / ÖLÇÜ: 53" etiketiyle KARŞILAŞTIRIN — orada renk doğru görünüyor.
2. Stok Kontrol'deki her satır (ürün/varyant) genişletilebilir olsun — açılınca o SATIRIN altına bir
   panel/popup açılsın, içinde **o varyantın UTS bilgisi ve lot kayıtları** görünsün. Görkem'in
   notu: bu tür bir lot/UTS gösterimi ZATEN satış POS ekranında var — **AYNI mekanizmayı/endpoint'i
   yeniden kullanın, sıfırdan yazmayın.**

## Kök neden (kodda doğrulandı)

### Madde 1 — renk kodu neden kayboluyor

`backend/src/modules/admin/stok-yonetimi.service.ts`, `listStokKontrol()` (satır 784-875), ürün adı
için:

```ts
urunAdi: p.display_name ?? p.name ?? '',
```

Burada `product.product`'ın Odoo tarafından ÜRETİLEN `display_name` alanı kullanılıyor. **Odoo'nun
kendi `display_name` mantığı, bir şablonun TÜM varyantları arasında AYNI değere sahip (yani
varyantları birbirinden AYIRT ETMEYEN) nitelikleri otomatik olarak GİZLER.** Bu üründe RENK
(`C6-5`) her 3 varyantta da AYNI olduğu için (sadece MODEL ve ÖLÇÜ farklı), Odoo `display_name`'den
RENK'i düşürüyor — bu bir bug değil, Odoo'nun kendi tasarımı, ama bizim ekranımızda RENK'in HER
ZAMAN görünmesi gerekiyor.

**Karşılaştırma — doğru çalışan yer:** `backend/src/modules/admin/stok-export.service.ts`,
`varyantEtiketi(attrs)` (satır 17-24) ve Stok Yönetimi'nin varyant alt satırları, `display_name`
KULLANMIYOR — `product_template_attribute_value_ids`'i `product.template.attribute.value`'dan okuyup
(`attribute_id`, `product_attribute_value_id`) HER nitelik değerini (ayırt edici olsun olmasın)
elle birleştiriyor. Bu yüzden orada RENK her zaman görünüyor.

### Madde 2 — UTS/Lot bilgisi zaten var, sadece Stok Kontrol'e bağlanmamış

`packages/web/src/components/sale/StokTeminStep.tsx` (satış POS ekranının stok/temin adımı) ZATEN
şu mekanizmayı kullanıyor: `searchTransferProductLots(productId, lokasyon, 'pos')` →
`transfer.api.ts` → `GET /transfer/urun-lotlari` → `backend/src/modules/transfer/transfer.service.ts`,
`searchUrunLotsByProduct(productId, lokasyon)` (satır 902-927) → `mapQuantToUrun()` (satır 455+).

`mapQuantToUrun()` (satır 482-505) ZATEN her lot için `utsKodu` ve `utsDurumu`'nu Odoo'nun
`stock.lot` üzerindeki `x_uts_kodu`/`x_uts_durumu`/`x_uts_mi` alanlarından okuyup dönüyor — yani
Görkem'in "bunu satış POS ekranında yapmıştık" dediği mekanizma TAM OLARAK budur ve İSTENEN veriyi
(lot no + UTS kodu + UTS durumu + stok miktarı) zaten üretiyor. **Bu fonksiyonu/endpoint'i AYNEN
yeniden kullanın — yeni bir UTS/lot sorgulama mantığı YAZMAYIN.**

Tek fark: bu endpoint TEK BİR lokasyon parametresi alıyor (`lokasyon`), oysa Stok Kontrol satırında
ürün BİRDEN FAZLA şubede stoklu olabilir (`u.lokasyonlar`). Popup'ı doldururken, o satırın
`lokasyonlar` listesindeki (miktar > 0 olan) HER şube için `searchUrunLotsByProduct`'ı ayrı ayrı
çağırıp sonuçları birleştirin (ya da yeni bir "tüm şubeler" toplu endpoint'i eklemek isterseniz,
İÇİNDE yine `mapQuantToUrun`'u/aynı mantığı çağırın — kod tekrarı yapmayın).

## İstenen

### 1) `urunAdi` düzeltmesi

`listStokKontrol()`'da `p.display_name ?? p.name` yerine, `stok-export.service.ts`'teki
`varyantEtiketi(attrs)` + `buildPtavMap(ptavIds)` mantığını (ya da ortak bir yardımcıya çıkarıp
oradan) kullanarak, HER ürün için `Şablon Adı (MODEL, RENK, ÖLÇÜ)` şeklinde TÜM nitelik
değerlerini içeren bir isim üretin. `product.product` `search_read` çağrısına (satır 810-815)
`product_template_attribute_value_ids` alanını da ekleyin, sonucu bu yeni ortak fonksiyonla
işleyin.

### 2) Satır genişletme + UTS/Lot popup'ı

`StokKontrolTab.tsx`'e (Stok Yönetimi'ndeki `expandedTmplIds`/`toggleExpand` deseniyle AYNI
mantıkta) her satıra bir genişlet/daralt kontrolü ekleyin. Genişletilince:

- İlgili satırın `lokasyonlar` listesinden miktar > 0 olan şube kodlarını alın.
- Her biri için `GET /transfer/urun-lotlari?productId=...&lokasyon=...` (mevcut
  `searchTransferProductLots`/`searchUrunLotsByProduct`) çağırıp sonuçları birleştirin.
- Açılan panelde (popup ya da satırın altına açılan inline panel — ikisi de kabul edilebilir, mevcut
  Stok Yönetimi'nin varyant-genişletme paneli gibi bir inline panel muhtemelen en tutarlısı) HER
  lot için: **Lot/Seri No, Şube, Miktar, UTS Kodu, UTS Durumu** kolonlarını gösterin.
- Lot bulunamazsa "Bu ürün için lot/UTS kaydı yok" gibi net bir mesaj gösterin.

## Test (ZORUNLU)

1. OPTELLİ'nin 3 varyantını Stok Kontrol'de arayıp, HER satırın ürün adında artık RENK (C6-5) dahil
   TÜM nitelik değerlerinin göründüğünü doğrulayın.
2. Bir satırı genişletip açılan panelde o varyantın gerçek lot no + UTS kodu + UTS durumu + şube +
   miktar bilgisinin (satış POS ekranındaki AYNI veriyle birebir tutarlı) göründüğünü doğrulayın.
3. Birden fazla şubede stoklu bir ürünü genişletip, TÜM şubelerdeki lotların panelde göründüğünü
   doğrulayın (tek şubeyle sınırlı kalmadığını).
4. Lot/UTS kaydı olmayan bir ürünü genişletip net bir "kayıt yok" mesajı gösterildiğini doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + ekran görüntüsü (renk kodu görünen ürün adı + genişletilmiş UTS/Lot
paneli) + test 1-4'ün sonucu.
