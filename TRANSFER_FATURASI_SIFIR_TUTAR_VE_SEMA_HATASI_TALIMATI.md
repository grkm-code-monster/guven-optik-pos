# Şirketler arası transfer faturası 0,00 TL çıkıyor + UBL şema hataları (GN22026000000002)

## Durum

`GN22026000000002` (ETTN `693D3411-61E6-4F04-95DA-D1D9EDF72241`, NG→ADESE transfer faturası)
`Ödenecek Tutar: 0,00` olarak kesilmiş ve Uyumsoft'tan 3 farklı hata alınmış:

1. **11201 (Şematron):** "Vergi tipinin KDV ve vergi tutarının 0 olduğu durumda vergi istisna
   muafiyet kodu ve açıklaması (TaxExemptionReason ve TaxExemptionReasonCode) alanı da bulunmak
   zorundadır."
2. **11101 (XML Şema):** `Party`/`SignatoryParty` altında `Contact` elemanı geçersiz konumda
   (beklenen: `WebsiteURI, EndpointID, IndustryClassificationCode, PartyIdentification`); `TaxTotal`
   altında `TaxSubtotal` geçersiz (beklenen: sadece `TaxAmount`).
3. Aynı 11101 hatası tekrar → sonuç: Zarf Durumu Kodu 1195.

Görkem'in kendi teşhisi doğru: **"Alış fiyatına %5 kâr ekleyerek faturaya yüklememişiz, fatura 0
çıkmış."** Kodda kök nedeni bulduk.

## Kök neden 1 — fiyat gerçekten 0 (kodda doğrulandı)

`backend/src/modules/transfer/transfer-post-actions.service.ts`,
`resolveTransferFaturaKalemler()` (satır 140-175):

```ts
let maliyet = k.maliyet ?? 0;
if (!maliyet) {
  // ... product.product'tan standard_price okunuyor (kaynakSirketId bağlamında)
  maliyet = Number(rows[0]?.standard_price ?? 0);
}
result.push({
  ...
  birimFiyat: transferMaliyetSatisFiyati(maliyet), // maliyet*1.05
});
```

- `k.maliyet` (frontend'den gelen `TransferPostActionKalem.maliyet`) **HİÇBİR ZAMAN
  doldurulmuyor** — `packages/web/src/components/sale/StokTeminStep.tsx` içinde `maliyet` alanı hiç
  geçmiyor (grep ile doğrulandı, transfer isteği hiçbir zaman maliyet göndermiyor).
- Yani TEK kaynak: Odoo'daki `product.product.standard_price`, **kaynak şirket (NG) bağlamında**
  okunuyor. Bu alan Odoo'da "company-dependent" bir alandır — ürün başka bir şirket bağlamında
  (`kaynakSirketId`) hiç `standard_price` girilmemişse 0 döner, GERÇEKTEN alış faturasından ürün
  girişi yapılmış olsa bile (o girişin `standard_price`'ı FARKLI bir şirket/DB bağlamına yazılmış
  olabilir).
- `maliyet = 0` → `birimFiyat = transferMaliyetSatisFiyati(0) = 0` → KDV tutarı da 0 → fatura toplamı
  0,00 → GİB'in "vergi 0 ise muafiyet kodu zorunlu" kuralına (11201) takılıyor.
- **AYNI fallback mantığı** `backend/src/modules/admin/sirketler-arasi-transfer.service.ts` satır
  453-454 ve 567'de de var — yani hem Odoo'daki GERÇEK muhasebe faturası (satış+alım `account.move`)
  hem de e-Fatura XML'i AYNI 0 rakamını kullanıyor. Görkem'in Odoo tarafında da 0 görmesinin nedeni
  bu.

## Kök neden 2 — şema hataları muhtemelen kök neden 1'in yan etkisi

`backend/src/modules/efatura/uyumsoft-efatura.service.ts`, `buildUBLXML()` normal (KDV≠0)
faturalarda başarıyla çalışıyor (bugün onaylanan `ANA2026...` faturaları bunun kanıtı). Bu fatura
özelinde farklı olan TEK şey: KDV tutarının 0 olması. Muhtemel açıklama: Uyumsoft, vergi tutarı 0
olan belgeleri MUAFİYET kontrolü için farklı/daha katı bir şematron+şema doğrulama koluna
yönlendiriyor ve bu kol, normal faturalarda hiç tetiklenmeyen (ya da görmezden gelinen) bir yapısal
sorunu ortaya çıkarıyor:

- Katı UBL 2.1 `PartyType` şemasında eleman SIRASI şöyledir: `WebsiteURI, EndpointID,
  IndustryClassificationCode, PartyIdentification, PartyName, Language, PostalAddress,
  PhysicalLocation, PartyTaxScheme, PartyLegalEntity, Contact, Person, AgentParty, ...` — yani
  `Person` şema sırasında `Contact`'TAN SONRA gelir, `PartyName`'in YERİNE geçmez.
- `buildUBLXML()`'de `AccountingSupplierParty` (satır 478-506) ve `buildCustomerPartyXml()` (satır
  306-336), TCKN'li taraflar için `cac:Person`'ı `PartyName`'in slotuna (yani `PostalAddress`'ten
  ÖNCE) yazıyor — bu, gevşek/varsayılan doğrulamada sorun çıkarmıyor ama muhtemelen 0-vergi
  senaryosunda tetiklenen daha katı XSD kontrolünde "beklenmeyen eleman" (`Contact` hatası olarak
  raporlanan, aslında sıralama sorunu) olarak görünüyor.

## İstenenler

**1) Önce ve en önemlisi — 0 tutarlı fatura ASLA sessizce oluşturulmasın/gönderilmesin:**

`resolveTransferFaturaKalemler()` (`transfer-post-actions.service.ts`) VE
`sirketler-arasi-transfer.service.ts`'deki aynı hesaplama noktalarına (satır ~453 ve ~567) bir GUARD
ekleyin: `maliyet` (dolayısıyla `birimFiyat`) 0 ise, sessizce 0 ile devam ETMEYİN — transferi
`hata` durumuna düşürüp AÇIK bir mesaj verin: örn. `"'{ürün adı}' için kaynak şirkette maliyet
bilgisi (standard_price) bulunamadı — transfer faturası kesilemedi, önce ürünün maliyet fiyatını
girin."` Bu, hem Odoo muhasebe faturasının hem e-Faturanın oluşmasını DURDURSUN (rollback dahil),
kullanıcı yanlış/0 tutarlı resmi belge almasın.

**2) Asıl veri sorununu bulun ve düzeltin:**

Bu transferdeki ürünün (XML'de geçen, "ULTRA" ile aratılan ürün — ekran görüntüsündeki Stok
Yönetimi sayfasında görünen kayıt) Odoo'da NG (`kaynakSirketId`) bağlamında `standard_price`
değerini sorgulayıp gerçekten 0/boş olduğunu doğrulayın. Eğer öyleyse, ürün girişi akışının
(`envanter-import.service.ts`, `odoo-varyant-import.service.ts`, veya admin.controller.ts'deki ürün
oluşturma uçları — `standard_price: Number(maliyet) || 0` yazan noktalar) bu ürün için hangi şirket
bağlamında `standard_price` yazdığını kontrol edin — muhtemelen ürün SADECE bir şirkette
(muhtemelen ADESE ya da farklı bir varsayılan) `standard_price` ile oluşturulmuş, NG bağlamında hiç
yazılmamış. Çözüm: ürün oluşturma/güncelleme akışının, transfer/satış işlemlerinde maliyet kaynağı
olarak kullanılan HER şirkette `standard_price`'ı senkron tutması (ya da transfer sırasında
şirketler arasında `standard_price` kopyalama/okuma mantığının en azından bir şirkette bulunanı
diğerine fallback etmesi).

**3) Şema hatalarını (Contact/TaxSubtotal) bağımsız olarak test edin:**

Madde 1-2 uygulanıp fiyat gerçek (0 değil) bir değerle test edildiğinde 11101 hatası TEKRAR
alınıyor mu kontrol edin.
- Eğer alınmıyorsa: bu şema hataları tamamen 0-vergi senaryosunun yan etkisiymiş, ek bir şey
  yapmaya gerek yok.
- Eğer HÂLÂ alınıyorsa: `buildUBLXML()` (satır 478-506) ve `buildCustomerPartyXml()` (satır
  306-336)'da, TCKN'li taraflar için `cac:Person`'ı şu anki (PartyName'in) slotundan çıkarıp,
  `cac:Contact` bloğundan SONRA, ayrı bir `<cac:Person>` elemanı olarak ekleyin (PartyName slotunu
  TCKN'de tamamen boş bırakın). Bu değişikliği yaparken bugün başarıyla onaylanan normal
  (KDV≠0) e-Fatura akışını REGRESE ETMEYİN — değişiklik sonrası en az bir normal satış faturası
  daha göndererek hâlâ onaylandığını doğrulayın.

**4) Savunma amaçlı — gerçek 0-vergi/istisna senaryosu için:**

`buildUBLXML()`'in per-satır `TaxCategory` ve toplam `taxSubtotalXML` bloklarına, `kdvTutar === 0`
olduğunda `cbc:TaxExemptionReasonCode` ve `cbc:TaxExemptionReason` eklemesini sağlayın (11201'in
istediği alanlar). Bunu şimdilik "gerçekten muaf bir satış" senaryosu için bir güvenlik ağı olarak
ekleyin — madde 1'deki guard sayesinde bu artık transfer akışında normalde hiç tetiklenmemeli, ama
ileride gerçek bir istisna satırı gelirse fatura yine reddedilmesin.

## Ayrıca netleştirme (yeni bir hata DEĞİL)

Görkem'in "aynı şirkette hâlâ Uyumsoft'a ulaştıramıyoruz" notu — kontrol ettim, aynı şirket (tek
VKN, şubeler arası) transferlerde zaten e-Fatura/muhasebe faturası hiç oluşturulmuyor (bu mantıklı,
aynı tüzel kişilik içinde "satış" yok). Şirket-içi transferlerde Uyumsoft'a giden TEK belge
e-İrsaliye'dir — ve bu, hâlâ çözülmemiş olan 1195 sorununun ta kendisi (bkz.
`UYUMSOFT_DESTEK_MESAJI_TASLAK.md`, aynı-VKN ETTN `AA4C4487-2701-4270-864E-20536FB06170` zaten bu
senaryoyu kapsıyor). Yani bu YENİ bir hata değil, zaten bildiğimiz/destek talebi hazırladığımız
1195 sorununun aynı-VKN tarafı. Bu talimatta AYRICA ele almanıza gerek yok.

## Test

1. Sorunlu ürünün Odoo'da NG bağlamındaki `standard_price` değerini sorgulayıp raporda paylaşın
   (gerçekten 0 mı çıkıyor doğrulayın).
2. Guard'ı ekleyip, maliyeti hâlâ 0 olan bir ürünle transfer denendiğinde artık NET bir hata
   mesajıyla durduğunu (sessizce 0 tutarlı fatura OLUŞMADIĞINI) gösterin.
3. Maliyeti düzelttikten (ya da test için elle girdikten) sonra AYNI ürünle bir transfer daha
   deneyip: (a) Odoo'daki satış+alım faturalarının artık doğru (%5 kârlı) tutarda oluştuğunu, (b)
   e-Faturanın Uyumsoft'ta "Onaylandı" durumuna geçtiğini (ETTN + ekran görüntüsü) gösterin.
4. Eğer madde 3'te hâlâ 11101 (Contact/TaxSubtotal) hatası alınırsa, Person/Contact sıralama
   düzeltmesini uygulayıp tekrar test edin; DÜZELTME SONRASI normal bir müşteri satışı e-Faturasının
   hâlâ sorunsuz onaylandığını da ayrıca doğrulayın (regresyon kontrolü).

## Rapor formatı

Değişen dosyalar/satırlar + sorunlu ürünün gerçek `standard_price` bulgusu + guard'ın çalıştığının
kanıtı (hata mesajı ekran görüntüsü) + düzeltilmiş transferin Uyumsoft onay kanıtı (ETTN + durum) +
normal satış faturasının regresyon testi sonucu.
