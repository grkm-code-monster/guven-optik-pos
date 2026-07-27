# Uyumsoft satış faturasında müşteri adresi/TCKN eksik, KDV oranı 0 görünüyor

## Durum

Ekran görüntüsünde (Uyumsoft, e-Arşiv Fatura önizleme, satış faturası ANA2026000000006) iki sorun
var:

1. **Adres tamamen boş**, TCKN alanı `11111111111` (varsayılan/geçici değer) yazıyor — gerçek
   müşteri Görkem Kırlı, telefonu var ama adres/kimlik no girilmemiş bir POS müşterisi.
2. **KDV Oranı %0,00, KDV Tutarı 0,00 TL** — hem MUSTANG ÇERÇEVE hem lens kaleminde. "Vergiler
   Dahil Toplam" da vergisiz toplamla aynı çıkıyor.

## Kod tarafı — kök neden bulundu

`backend/src/modules/efatura/uyumsoft-efatura.service.ts`, `satistenFaturaData()` (satır
631-674):

```ts
const identity = satis.customer.identityNo?.trim() || '11111111111';
return {
  aliciVkn: identity,
  aliciAdi: satis.customer.name || 'Bireysel Müşteri',
  aliciAdres: '-',        // ← HER ZAMAN sabit '-'
  aliciIl: 'İZMİR',       // ← HER ZAMAN sabit, doğru olmayabilir
  aliciIlce: '-',         // ← HER ZAMAN sabit
  ...
```

**Adres hiçbir zaman müşteri kaydından okunmuyor çünkü okunacak alan yok** — `Customer` modelinde
(`schema.prisma` satır 85+) `name/phone/note/identityNo/birthDate` ve reçete alanları var, ama
**adres, il, ilçe alanı hiç tanımlı değil**. `Branch` modelinde de sadece tek bir serbest metin
`adres` alanı var (`il`/`ilce` ayrı alan yok).

### GÜNCELLEME — KDV teşhisi düzeltildi, yeni sayısal kanıt var

Görkem ek bir veri noktası verdi: aynı satışta **POS'ta tahsil edilen toplam ₺63,80**, ama
**Odoo'daki `sale.order`'a geçen tutar ₺58,00** ve **Uyumsoft faturasındaki tutar da ₺58,00**.
63,80 ÷ 1,10 = **58,00 tam** — yani POS doğru şekilde %10 KDV dahil fiyatla tahsilat yapmış, ama
Odoo tarafı KDV'yi hiç uygulamadan çıplak (vergisiz) tutarı yazmış. Uyumsoft'un da Odoo ile birebir
aynı rakamı (58,00) göstermesi önemli bir ipucu: **Uyumsoft faturası muhtemelen benim ilk
hipotezimdeki `satistenFaturaData()`/Postgres `taxRate` yolundan değil, doğrudan Odoo'da oluşan
satış siparişinden/faturasından üretiliyor.** Yani asıl aranması gereken yer değişti.

`sale.service.ts` (satır 875-936) ve `odoo-tax.util.ts`'yi okudum — ilk tahminimin aksine burada
KDV'yi Postgres'ten değil **Odoo'dan canlı okuyan, oldukça gelişmiş bir mekanizma zaten var**:

```ts
// sale.service.ts satır 878-908
const taxRate = await readProductSaleTaxRate(odooProductId, taxCompanyId);
const { taxId: odooTaxId, priceUnit } = await resolvePosLineTax({
  companyId: taxCompanyId, taxRate, unitPriceInclusive: Number(item.unitPrice),
});
...
orderLines.push([0, 0, {
  ...(odooTaxId ? { tax_id: [[6, 0, [odooTaxId]]] } : {}),   // ← odooTaxId null ise VERGİ HİÇ YAZILMIYOR
  product_id: ..., price_unit: priceUnit, ...
}]);
```

`readProductSaleTaxRate()` (`odoo-tax.util.ts` satır 210-238), ürünün Odoo `taxes_id`'sini okuyup
`type_tax_use==='sale' && amount>0` olan bir vergi bulamazsa **her zaman 20 döner** (satır 223 ve
237) — yani bu fonksiyon kendi başına asla "gerçek" 0 döndürmemeli. `resolveOdooTaxId()` de
(satır 64-147) `rate>=0` olduğu sürece uygun vergiyi bulur, bulamazsa **otomatik yeni bir
`account.tax` kaydı oluşturur** — yani `odooTaxId`'nin `null` kalması normalde beklenmez, ancak
şu durumlarda olabilir: (a) Odoo `account.tax.create()` çağrısı bu şirket/ortam için hata veriyor
(yetki, eksik zorunlu alan vb. — kod bunu `console.warn('[odoo-tax] create hata...')` ile
loglar), (b) `readProductSaleTaxRate` içindeki `execute('product.product','read',...)` çağrısı bu
ürünü bu `companyId` (=`ODOO_TAX_CHART_COMPANY_ID`=1, "Güven Optik 1959") bağlamında bulamıyor/
erişemiyor ve `catch` bloğuna düşüp yine 20 dönüyor olması gerekirken bir yerde bu akış kırılıyor
olabilir — bu oturumda daha önce `company_id` çoklu şirket görünürlüğüyle ilgili gerçek bir bug
bulunmuştu (ULTRA KONTAKT LENS vakası), burada da benzer bir şey olabilir.

**Kısacası: ilk hipotezim (Postgres `Product.taxRate`) muhtemelen bu spesifik sayı için yanlış
yer — asıl bakılması gereken, bu satıştaki ürünler için `readProductSaleTaxRate`/
`resolvePosLineTax`'ın gerçekte ne döndürdüğü ve neden `odooTaxId`'nin boş kaldığı (ya da vergi
oranının 0 olarak hesaplandığı).**

## İstenen

### 1) Müşteri adresi/TCKN

1. `Customer` modeline `adres`, `il`, `ilce` (opsiyonel) alanları ekleyin (Prisma migration).
2. POS'ta müşteri kayıt/düzenleme formuna (frontend, muhtemelen `NewSalePage.tsx` veya müşteri
   kayıt bileşeni) bu alanları ekleyin — zorunlu değil, ama varsa faturaya gitsin.
3. `satistenFaturaData()`'da:
   - `aliciAdres`/`aliciIl`/`aliciIlce`: önce `satis.customer.adres/il/ilce`, doluysa onu kullanın.
   - **Boşsa**, satışın yapıldığı şubenin (branch) bilgisine düşün: `Branch.adres` alanını
     kullanın (il/ilçe ayrımı yoksa, `adres` metnini olduğu gibi `aliciAdres`'e yazın,
     `aliciIl`/`aliciIlce` için Branch'e de `il`/`ilce` alanı eklemeniz gerekebilir — bu iki
     alanı da `Branch` modeline ekleyin ve mevcut şubeler için Görkem'in size vereceği gerçek
     il/ilçe bilgisiyle doldurun).
   - `identity`: `satis.customer.identityNo` boşsa mevcut `'11111111111'` varsayılanı kalabilir
     (bu TCKN olmayan bireysel müşteriler için Uyumsoft'un beklediği standart değer — buna
     dokunmayın, sadece gerçek TCKN varsa onu kullanmaya devam edin).

### 2) KDV oranı — güncellenmiş teşhis planı

1. Bu satışın (POS toplamı ₺63,80, Odoo/Uyumsoft ₺58,00 olan) Odoo `sale.order` kaydını bulun.
   Oluşan `sale.order.line` kayıtlarında `tax_id` alanı gerçekten boş mu, yoksa `amount=0` bir
   vergiye mi bağlı — `execute('sale.order.line','read',[[...]],{fields:['tax_id','price_unit']})`
   ile doğrudan kontrol edin.
2. Backend loglarında bu satışın işlendiği zaman aralığında `[odoo-tax]` ile başlayan satır
   (özellikle `create hata` uyarısı) var mı arayın — varsa tam hata mesajını raporlayın.
3. `readProductSaleTaxRate(odooProductId, taxCompanyId=1)` çağrısını bu ürünün gerçek
   `odooProductId`'si ile elle/scriptle tekrar çalıştırıp ne döndürdüğünü doğrudan gözlemleyin —
   20 mi (fonksiyonun güvenli varsayılanı) yoksa gerçekten farklı bir sayı mı?
4. Bu ürünün Odoo'daki `taxes_id` alanının **hangi `company_id` bağlamında** dolu olduğunu
   kontrol edin (bu oturumda `company_id` çoklu şirket görünürlüğü ile ilgili gerçek bir bug
   zaten bulunmuştu — burada da ürünün vergisi sadece NG (company 2) bağlamında tanımlıysa, kod
   sabit `taxCompanyId=1` ile okuduğu için görmüyor olabilir).
5. Kök nedeni netleştirdikten sonra düzeltin. Eğer sorun gerçekten Odoo'da bu ürüne/şirkete satış
   vergisi tanımlı olmaması ise, Görkem'in dediği gibi "Odoo'da her şirkete tanımlamamız
   gerekiyorsa tanımlayalım" — eksik ürün/şirket kombinasyonları için doğru `account.tax`'ı
   `taxes_id`'ye ekleyin (kaç üründe eksik olduğunu da raporlayın, tek seferlik toplu bir
   düzeltme gerekebilir).
6. Uyumsoft faturasının gerçekten Odoo sale/invoice üzerinden mi yoksa `satistenFaturaData()`
   üzerinden mi gönderildiğini de netleştirin (§1'deki adres/TCKN düzeltmesini hangi fonksiyona
   uygulayacağınızı bu belirleyecek — ikisi aynı yol değilse, KDV düzeltmesi bulunan gerçek yolda,
   adres düzeltmesi ise gerçekte kullanılan fatura-oluşturma yolunda yapılmalı).

## Test

Adres/il/ilçe dolu bir müşteriyle yeni bir satış yapıp Uyumsoft faturasında adresin doğru
göründüğünü; adres boş bir müşteride şube adresinin düştüğünü; ve KDV oranının gerçek ürün vergi
oranıyla (örn. %10 veya %20) doğru göründüğünü ekran görüntüsüyle kanıtlayın.

## Rapor formatı

Şema değişikliği + değişen dosyalar/satırlar + KDV teşhis sonucu + öncesi/sonrası Uyumsoft fatura
önizleme ekran görüntüsü.
