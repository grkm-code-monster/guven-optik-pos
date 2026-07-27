# Stok Kontrol'de gerçek stoklu ürünlerde "lot/UTS kaydı yok" — muhtemel şirket bağlamı hatası

## Durum

Görkem Odoo'da ZAROSSI ürünlerini kontrol etti: `Stok → Ürünler → ZAROSSI OPTİK ÇERÇEVE` listesinde
4 varyantın hepsinde NG/Stok/ANA-DEPO lokasyonunda 1'er adet stok VE lot/seri numarası (barkodun
kendisi: 22442529, 22442680, 22442697, 86932839003381) açıkça görünüyor — yani Odoo'da veri
tam ve doğru. Ama Stok Kontrol ekranında bu satırlardan birini (ZA10019, C1, 52) açınca panel
"Bu ürün için lot/UTS kaydı yok" diyor — veri Odoo'da varken uygulama bulamıyor. Görkem'in
excelden girdiği veri kayıp değil, sadece ekranda görünmüyor gibi duruyor.

Bu muhtemelen sadece ZAROSSI'ye özgü değil, DAHA GENEL bir bug'a işaret ediyor — kod okumasıyla
güçlü bir hipotez oluşturdum, aşağıda açıklıyorum. Kesinleştirmek ve düzeltmek için gerçek Odoo
verisiyle doğrulama gerekiyor.

## Kod okumasıyla bulduğum hipotez (KESİNLEŞMEDİ — teyit gerekiyor)

`backend/src/modules/odoo/odoo.service.ts`'teki `execute()` fonksiyonu, bir `companyId` parametresi
verildiğinde:

```ts
if (companyId !== undefined && ...) {
  const creds = getOdooCredentials(companyId);   // şirkete özel Odoo kullanıcısı (örn. NG için uid=7)
  uid = creds.uid;
  password = creds.password;
  finalKwargs.context = {
    ...buildOdooCompanyContext(companyId),        // allowed_company_ids: [companyId] — SADECE o şirket
    ...
  };
}
```

Yani NG şirketi bağlamında yapılan HER Odoo çağrısı, NG'ye özel bir servis kullanıcısıyla VE
`allowed_company_ids: [2]` (sadece NG) context'iyle çalışıyor — çoklu şirket erişimi YOK.

`backend/src/modules/transfer/transfer.service.ts`'teki `searchUrunLotsByProduct()` fonksiyonu,
Stok Kontrol'ün lot/UTS panelinin arkasındaki fonksiyon, şu sırayla çalışıyor:

```ts
const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);  // 'ANADEPO' → 2 (NG)
const resolvedProductId = await resolveProductId(pid, companyId);     // execute(..., companyId=2)
const quantlar = await fetchQuantsAtLocation(lokasyonId, companyId, {...});
```

`resolveProductId()` şu şekilde çalışıyor (aynı dosyada):

```ts
const asProduct = await execute('product.product', 'search_read', [[['id','=',id]]], {fields:['id'],limit:1}, companyId);
if (asProduct?.length) return asProduct[0].id;
...
throw new Error(`Ürün bulunamadı (id=${id})`);
```

**Hipotez:** Eğer ZAROSSI'nin `product.product`/`product.template` kaydının `company_id` alanı
`False` (paylaşımlı) ya da `2` (NG) DEĞİL de başka bir şirkete (örn. `1` = Güven Optik 1959,
muhtemelen ürün ilk oluşturulduğunda varsayılan/farklı bir şirket bağlamıyla kaydedilmiş) ayarlıysa,
`allowed_company_ids: [2]` kısıtlı context'inde bu ürün Odoo'nun çoklu şirket kayıt kuralı
(`company_id = False OR company_id in allowed_company_ids`) gereği NG kullanıcısına GÖRÜNMEZ hâle
gelir. Bu durumda `resolveProductId()` "Ürün bulunamadı" hatası fırlatır, bu hata
`withOdoo(...)` sarmalayıcısı tarafından yutulup boş dizi (`[]`) olarak döner — ekranda tam olarak
Görkem'in gördüğü "Bu ürün için lot/UTS kaydı yok" boş durumu oluşur. Halbuki aynı ürün, listeleme
ekranında (Stok Kontrol'ün ana tablosu, `stok-yonetimi.service.ts`'in `listStokKontrol()`'ü) doğru
görünüyor çünkü o muhtemelen farklı/kısıtsız bir Odoo bağlamı kullanıyor.

## İstenen — ÖNCE TEŞHİS

1. ZAROSSI şablonu (#1956) ve 4 gerçek varyantının (#5655, #5687, #5671, #5673)
   `product.template`/`product.product` üzerindeki **`company_id`** alanını okuyun
   (`context: active_test:false`, kısıtsız/admin bağlamla — yani `companyId` PARAMETRESİ
   VERMEDEN `execute()` çağırın ki tüm şirketleri görebilsin).
2. Sonucu net raporlayın: `company_id` False mü, yoksa hangi şirket (1/2/3/4)?
3. Eğer `company_id` NG (2) değilse VE False da değilse: hipotez doğrulanmış olur — bu, `resolveProductId`'nin
   NG bağlamında (`companyId=2`, `allowed_company_ids:[2]`) bu ürünü neden bulamadığını açıklar.
4. Aynı kontrolü, Stok Kontrol'de sorunsuz lot/UTS gösteren BAŞKA bir üründe de (varsa) yapıp
   karşılaştırın — o ürünün `company_id`'si NG/False mı? Bu, hipotezi çürütmek ya da doğrulamak
   için önemli bir kontrol noktası.
5. `resolveProductId`'de gerçekten bir `try/catch` ile hatanın nerede yutulduğunu (`withOdoo`
   sarmalayıcısında mı, başka bir yerde mi) doğrulayın — hatanın gerçekten sessizce `[]`'e
   dönüştüğünü teyit edin (varsayım yapmayın, kodda gösterin).

## Düzeltme (teşhis doğrulanırsa)

Kesin kök neden teyit edildikten sonra İKİ olası düzeltme yolu var — hangisinin doğru olduğuna
teşhis sonucuna göre karar verin, ikisini birden köre körüne uygulamayın:

- **A) Veri düzeltmesi:** Eğer ZAROSSI (ve muhtemelen başka gerçek ürünler) yanlış/eksik
  `company_id` ile kaydedilmişse, bu ürünlerin `company_id`'sini doğru şirkete (ya da paylaşımlı
  kullanım gerekiyorsa `False`'a) düzeltin. Ama bunu yapmadan önce: bu ürün başka şirketlerde de
  satılıyor/stoklanıyor mu kontrol edin (ör. ADESE/POTENTIAL şubelerinde de ZAROSSI var mı) — eğer
  öyleyse `company_id=False` (paylaşımlı) doğru çözüm, tek bir şirkete sabitlemek YANLIŞ olur.
- **B) Kod düzeltmesi:** `resolveProductId`/`fetchQuantsAtLocation`'ın şirket-kısıtlı context yerine,
  en azından ÜRÜN ARAMA adımında kısıtsız (admin) bağlam kullanmasını sağlayın — stok/lokasyon
  sorgusu zaten `location_id` ile doğru şirkete süzülüyor, ürünün kendisini bulurken şirket kısıtı
  şart değil. Bu, gelecekte benzer `company_id` tutarsızlıklarına karşı daha dayanıklı bir çözüm
  olur ve muhtemelen ZAROSSI'ye özel olmayan, sistemik bir düzeltmedir.

Muhtemelen B, sistemik olduğu için daha güvenli ve kalıcı — ama A'nın da (gerçekten yanlış
company_id varsa) ayrıca yapılması gerekebilir. Teşhis sonucuna göre karar verin.

## EK BULGU (yeni ekran görüntüsü — hipotezi kısmen çürütüyor, teşhis yönünü değiştiriyor)

Görkem, ULTRA KONTAKT LENS -0125 için de AYNI "Bu ürün için lot/UTS kaydı yok" durumunu gösterdi.
Odoo tarafında bu ürünün 13 `stock.quant` kaydı var: NG/Stok/ANA-DEPO'da 11 adet, NG/Stok/GVN2'de
1 adet, **ADESE/Stok/GVN3'te 1 adet** — yani bu ürünün stoğu ZATEN BİRDEN FAZLA ŞİRKETTE
(NG ve ADESE) mevcut ve Stok Kontrol'ün üst tablosu bu stoğu (ANADEPO:11 vb.) doğru topluyor/
gösteriyor. Lot adları da bizim kendi üretim deseni gibi görünüyor (`GRS-2026-07-5767-S18-001` vb.)
— yani lot Odoo'ya doğru yazılmış.

Bu, önceki bölümdeki "ürünün `company_id`'si NG değilse şirket-kısıtlı bağlamda görünmez olur"
hipotezini ZAYIFLATIYOR: eğer gerçekten sert bir company_id kısıtı olsaydı, muhtemelen üst
tablonun toplam stok göstermesi de sorunlu olurdu (o da aynı tür sorgu kullanıyorsa) — ama üst
tablo doğru çalışıyor, sadece ALT panel (lot/UTS expand) boş dönüyor. Bu, sorunun genel bir
"ürün görünmüyor" meselesinden çok, ÖZEL OLARAK `searchUrunLotsByProduct` / `resolveProductId` /
`fetchQuantsAtLocation` zincirinde bir yerde sessizce hata yutulduğuna veya frontend'in expand
sırasında gönderdiği parametrelerin (`productId`, `sube`) YANLIŞ/eksik olduğuna işaret ediyor.

**Bu yüzden aşağıdaki teşhis adımlarını, kod okuyup varsayım yapmak yerine GERÇEK bir çağrıyı
UÇTAN UCA İZLEYEREK yapın:**

1. Stok Kontrol frontend'inde (muhtemelen `StokKontrolTab.tsx`) bir satır expand edildiğinde
   `searchTransferProductLots(productId, sube, 'admin')`'e HANGİ `productId` ve `sube` değerleri
   gönderiliyor, tam olarak bulun (kaynak kodda okuyun — hangi state'ten/hangi alandan geliyor).
   `productId` gerçekten o SATIRIN doğru `product.product` id'si mi, yoksa template id'si mi,
   yoksa birden fazla lokasyonu olan bir üründe YANLIŞ/karışık bir id mi?
2. `GET /transfer/urun-lotlari` endpoint'ine (backend) geçici bir `console.log` ekleyin (ya da
   zaten varsa mevcut logları açın) — gelen `productId`/`lokasyon` parametrelerini VE
   `resolveProductId` sonucunu VE `fetchQuantsAtLocation` sonucunu (bulunan quant sayısı) loglayın.
3. Görkem'in tarayıcısında ULTRA KONTAKT LENS -0125 satırını gerçekten expand edip GERÇEK request'i
   tetikleyin (ya da aynı productId/sube ile backend'i doğrudan çağırın) ve logları okuyun.
4. Zincirin TAM OLARAK hangi adımda boş/hatalı sonuç verdiğini (`resolveProductId` mi hata
   fırlatıyor, `fetchQuantsAtLocation` mi 0 satır dönüyor, yoksa `mapQuantToUrun` mi boş bir şey mi
   üretiyor) kesin olarak tespit edin — sadece kod okuyarak DEĞİL, gerçek log çıktısıyla.
5. Bu iz sürme sırasında `company_id` hipotezini de (önceki bölüm) doğrulayın/çürütün — ama artık
   TEK hipotez olarak değil, birkaç olası nedenden biri olarak ele alın.

## Test

1. Düzeltme sonrası ZAROSSI'nin 4 varyantının hepsinde Stok Kontrol panelinin doğru lot no
   (22442529 vb.) ve varsa UTS kodunu gösterdiğini ekran görüntüsüyle doğrulayın.
2. Aynı düzeltmenin, `ULTRA_KONTAKT_LENS_LOT_UTS_GORUNMUYOR_TALIMATI.md` teşhisindeki ULTRA KONTAKT
   LENS sorununu da çözüp çözmediğini kontrol edin — aynı kök nedenden kaynaklanıyor olabilirler,
   TEK bir düzeltme iki sorunu da çözebilir. Eğer öyleyse bunu raporda açıkça belirtin.
3. Bu düzeltmenin diğer şirketlerin/lokasyonların lot/UTS panelini BOZMADIĞINI (ADESE, POTENTIAL
   ürünlerinde de mevcut davranış korunuyor) doğrulayın.

## Rapor formatı

ZAROSSI ve karşılaştırma ürününün `company_id` değerleri + hatanın nerede/nasıl yutulduğunun kod
kanıtı + hangi düzeltme(ler) uygulandığı + test 1-3 sonucu + ULTRA KONTAKT LENS ile ortak kök
neden olup olmadığı.
