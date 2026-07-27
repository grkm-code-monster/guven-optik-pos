# Stok Yönetimi'nde Alış Fiyatı boş görünüyor + transfer faturasında KDV hep %20 gidiyor

## Bağlam

Önceki talimatta (`TRANSFER_FATURASI_SIFIR_TUTAR_VE_SEMA_HATASI_TALIMATI.md`) istenen maliyet
guard'ı uygulanmış (`backend/src/modules/transfer/transfer-maliyet.util.ts` — tüm şirketleri
(`ODOO_ALL_COMPANY_IDS`) sırayla deneyip pozitif `standard_price` bulan ilkini kullanıyor, hiçbiri
yoksa net hata fırlatıyor). Görkem bu sırada iki YENİ, somut hata daha buldu:

1. ULTRA lensler faturadan ürün girişiyle oluşturulurken maliyet girildi, ama **Stok Yönetimi**
   sayfasındaki "Alış Fiyatı" kolonuna hiç yansımamış.
2. Aynı üründe **KDV oranı Stok Yönetimi'nde %10** olarak ayarlı ama transfer faturasına **%20**
   gitmiş.

İkisini de kodda buldum, ikisi de gerçek ve kanıtlı.

## Bug 1 — Stok Yönetimi, `standard_price`'ı company context VERMEDEN okuyor

`backend/src/modules/admin/stok-yonetimi.service.ts`:

- `listStokUrunleri()` (satır 104-161), `product.template` `search_read` çağrısını (satır 119-123)
  **hiçbir `companyId` parametresi vermeden** yapıyor:
  ```ts
  const templates = (await execute('product.template', 'search_read', [domain], {
    fields, limit: limit + 200, order: 'name asc',
  })) ?? [];   // <-- execute()'un 5. parametresi (companyId) YOK
  ```
- `backend/src/modules/odoo/odoo.service.ts`, `execute()` (satır 75-99): `companyId` verilmezse
  (satır 94-97) genel admin kullanıcısıyla (`getUid()`/`ODOO_PASS`, sabit global admin), **hiçbir
  `allowed_company_ids`/`company_id` context'i zorlanmadan** çağrı yapıyor. `standard_price` Odoo'da
  **company-dependent** bir alan — yani dönen değer, o admin kullanıcısının o anki VARSAYILAN
  şirketine bağlı, transfer/satış sırasında GERÇEKTEN kullanılan (NG/ADESE/Potential'ın kendi
  company id'siyle) yazılan değerle örtüşmeyebiliyor. Bu yüzden fatura girişinde bir şirket
  bağlamında yazılan maliyet, Stok Yönetimi listesinde (farklı/varsayılan bir bağlamda okunduğu
  için) boş/0 görünüyor.
- Aynı sorun `guncelleStokFiyat()` (satır 228 civarı, alış/satış fiyatı GÜNCELLEME) ve civarındaki
  toplu güncelleme fonksiyonunda (satır ~290-330) da var — oradaki `product.template` `read`/`write`
  çağrıları da companyId'siz.

### İstenen

`listStokUrunleri()` ve `guncelleStokFiyat()` (+ varsa aynı dosyadaki toplu fiyat güncelleme
fonksiyonu), `product.template` okuma/yazma çağrılarına **açık bir `companyId`** vermeli. İki
seçenek (birini seçin, hangisi ürün modeliyle daha tutarlıysa):

- (a) Eğer Stok Yönetimi zaten bir şube/şirket seçimine göre filtreleniyorsa (ör. `filtre.lokasyon`
  gibi), o lokasyonun bağlı olduğu `company_id`'yi kullanın (transfer akışındaki
  `resolveLokasyonlar()`'daki gibi lokasyon → şirket eşlemesini tekrar kullanın).
- (b) Eğer Stok Yönetimi TÜM şirketler için tek bir liste gösteriyorsa (muhtemel, çünkü UI'da şube
  filtresi net değil), `transfer-maliyet.util.ts`'deki `resolveTransferKalemMaliyet()` ile AYNI
  mantığı (tüm `ODOO_ALL_COMPANY_IDS`'i sırayla dene, pozitif değeri bulan ilkini kullan) burada da
  uygulayın — ya da ideal olarak o mantığı ortak bir `resolveStandardPriceAcrossCompanies()`
  yardımcı fonksiyonuna çıkarıp HER İKİ yerden de (transfer-maliyet.util.ts VE
  stok-yonetimi.service.ts) çağırın (kod tekrarını önlemek için).

Hangi seçeneği uyguladığınızı ve NEDEN o seçeneği seçtiğinizi raporda açıklayın.

## Bug 2 — Transfer faturasında KDV oranı SABİT %20 yazılıyor

`backend/src/modules/efatura/uyumsoft-efatura.service.ts`, `transferdenFaturaData()`
(satır 776-824), her kalem için:

```ts
kalemler: transfer.kalemler.map((k, i) => ({
  ...
  kdvOrani: 20,   // <-- HER ZAMAN 20, ürünün gerçek KDV oranı hiç okunmuyor
})),
```

Bu, ürünün Stok Yönetimi'nde ayarlı gerçek KDV oranını (örn. bu ürün için %10) tamamen yok sayıyor.
Karşılaştırma: **`sirketler-arasi-transfer.service.ts`'deki Odoo muhasebe faturası oluşturma kısmı
(satır 470, 573) `readProductSaleTaxRate(product.id, sirketId)` ile ürünün GERÇEK KDV oranını doğru
okuyor** — yani transfer için Odoo'daki asıl muhasebe faturası muhtemelen doğru KDV ile kesiliyor,
ama Uyumsoft'a giden e-Fatura XML'i (`tetikleTransferEFatura` → `transferdenFaturaData`) YANLIŞ,
sabit %20 kullanıyor. Bu asimetri az önce düzeltilen "satıcı TCKN'de Person eksik" hatasıyla AYNI
türden bir "iki farklı kod yolu birbirini tutmuyor" hatası.

### İstenen

1. `TransferEFaturaKalem` tipine (`transfer-maliyet.util.ts`, satır 7-13) bir `kdvOrani?: number`
   alanı ekleyin.
2. `resolveTransferFaturaKalemler()` (`transfer-maliyet.util.ts`, satır 81-104) her kalem için
   `readProductSaleTaxRate(productId, kaynakSirketId)` çağırarak GERÇEK KDV oranını okuyup
   `kdvOrani`'yı doldursun (yalnızca bulunamazsa/hata olursa 20'ye düşsün, `readProductSaleTaxRate`
   zaten kendi içinde bu fallback'i yapıyor).
3. `transferdenFaturaData()`'daki `kalemler: transfer.kalemler.map(...)` bloğunda (satır 813-821),
   `kdvOrani: 20` yerine gelen kalemin `k.kdvOrani ?? 20` değerini kullanın — bunun için
   `transferdenFaturaData()`'nın aldığı `transfer.kalemler` tipine de `kdvOrani?: number` ekleyin ve
   `tetikleTransferEFatura()`'nın bu alanı `faturaKalemler`'den `transferdenFaturaData()`'ya
   geçirdiğinden emin olun (şu an sadece `urunAdi/urunKodu/miktar/birimFiyat` geçiyor gibi
   görünüyor, `kdvOrani` yeni eklenecek).
4. Bu değişikliğin `sirketler-arasi-transfer.service.ts`'deki Odoo muhasebe faturası KDV'siyle
   (aynı ürün, aynı transfer) TUTARLI olduğunu (ikisi de aynı orana kesildiğini) test edin — iki
   fatura (Odoo account.move + Uyumsoft e-Fatura) farklı KDV oranıyla asla kesilmemeli.

## Test

1. KDV oranı %10 olarak ayarlı ULTRA lens ürünüyle yeni bir şirketler arası transfer deneyin —
   Uyumsoft'a giden XML'de `<cbc:Percent>10</cbc:Percent>` (20 DEĞİL) göründüğünü gösterin.
2. Aynı ürünün maliyetinin Stok Yönetimi'nde artık doğru göründüğünü (0/boş DEĞİL) gösterin —
   hangi şirket bağlamında doğru değeri bulduğunuzu belirtin.
3. %20 KDV'li normal bir üründe regresyon olmadığını (hâlâ 20 gittiğini) doğrulayın.
4. Daha önceki talimattaki 0-tutar guard'ının bu düzeltmelerden sonra da çalıştığını (maliyeti
   hiçbir şirkette bulunamayan bir ürünle denemeyi tekrarlayarak) doğrulayın — regresyon olmasın.

## Rapor formatı

Değişen dosyalar/satırlar + hangi company-context stratejisini seçtiğiniz + yeni transfer
faturasının XML'inden `Percent`/`TaxAmount` alanları (önce/sonra) + Stok Yönetimi ekran görüntüsü
(alış fiyatı artık doğru) + regresyon testleri sonucu.
