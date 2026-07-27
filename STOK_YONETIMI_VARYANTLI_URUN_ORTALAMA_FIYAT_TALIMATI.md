# Stok Yönetimi — varyantlı üründe şablon satırı ortalama satış/alış göstermeli

## Durum — ekran görüntüsüyle doğrulandı

OPTELLİ OPTİK ÇERÇEVE (tmpl 1950) şablon satırında: **Satış ₺ = 2.800,00, Alış ₺ = 0,00**. Ama
genişletilince 3 varyantın HER BİRİ: **Satış ₺ = 2.800,00, Maliyet ₺ = 700,00**. Şablon satırındaki
Alış ₺ yanlış (0,00) — varyantların gerçek maliyeti 700 iken şablon 0 gösteriyor.

Görkem'in istediği genel kural: **bir ürünün birden fazla varyantı varsa, şablon satırındaki Satış
₺ ve Alış ₺, varyantların KENDİ değerlerinin ORTALAMASI olmalı** (toplam ÷ varyant sayısı) — sabit
bir "şablon fiyatı" değil. Örnek: varyantlar 2800/2300/2800 ise şablon satırı (2800+2300+2800)/3 =
2633,33 göstermeli. Aynı kural Alış ₺ (şablon seviyesi) / Maliyet ₺ (varyant seviyesi) için de
geçerli — Görkem'in belirttiği gibi bunlar zaten AYNI kavram (maliyet), sadece iki tabloda farklı
isimlendirilmiş.

## Kök neden (kodda doğrulandı)

`backend/src/modules/admin/stok-yonetimi.service.ts`, `listStokUrunleri()` (satır 110-164) ve
`getStokUrunRowsByIds()` (satır 190-220, dışa aktarma için) — ikisi de şablon satırının
`satisFiyati`/`alisFiyati` değerlerini DOĞRUDAN `product.template`'in kendi alanlarından okuyor:

- `satisFiyati: Number(t.list_price) || 0` — Odoo'da `product.template.list_price`, varyantlar
  arasında fiyat farkı (`price_extra`) yoksa tesadüfen tutarlı görünebilir (bu örnekte 3 varyant da
  2800 olduğu için şablon da 2800 gösteriyor), ama varyantlar arasında fiyat FARKI varsa
  `list_price` sadece TEK bir "baz" değeri yansıtır, ortalamayı DEĞİL.
- `alisFiyati: alisFiyatiMap.get(t.id)` → `resolveTemplateStandardPriceMap()`
  (`odoo-standard-price.util.ts`) — bu fonksiyon `product.template.standard_price` alanını
  okuyor. **Asıl kök neden burada:** varyant bazlı Excel/varyant-import akışı (`guncelleVaryantFiyatlari`,
  daha önce eklenen varyant fiyat güncelleme) maliyeti HER ZAMAN `product.product` (varyant)
  seviyesine yazıyor, `product.template.standard_price` alanına HİÇ yazmıyor. Çok varyantlı bir
  şablonda Odoo bu alanı genelde 0 ya da anlamsız bir değer olarak tutar — bu yüzden şablon satırı
  Alış ₺ = 0,00 gösteriyor, oysa gerçek maliyet SADECE varyantlarda var.

## İstenen

### 1) Yeni ortak yardımcı — varyant ortalaması

`backend/src/modules/odoo/odoo-standard-price.util.ts`'e (ya da `stok-yonetimi.service.ts`'e) yeni
bir fonksiyon ekleyin, `resolveTemplateStandardPriceMap()`'teki AYNI BATCH(100) + çok-şirket-deneme
desenini izleyerek:

```
resolveTemplateVariantAverages(templateIds: number[]): Promise<Map<number, {
  ortalamaSatis: number; ortalamaMaliyet: number; varyantSayisi: number;
}>>
```

Mantık:
- Sadece `product_variant_count > 1` olan (çok varyantlı) şablonlar için çalıştırın — tek varyantlı
  şablonlarda MEVCUT davranış zaten doğru (şablonun kendi değeri = tek varyantın değeri), gereksiz
  Odoo çağrısı yapmayın.
- İlgili şablonların TÜM varyantlarını (`product.product`, `product_tmpl_id in [...]`) `lst_price`
  ve `standard_price` alanlarıyla batch okuyun (BATCH=100, `resolveTemplateStandardPriceMap`'teki
  gibi).
- `standard_price` company-dependent olduğundan, `resolveTemplateStandardPriceMap`'in yaptığı gibi
  ÇOKLU ŞİRKET bağlamını (`ODOO_ALL_COMPANY_IDS`) deneyerek her varyant için pozitif bir maliyet
  bulmaya çalışın (bir varyant için hangi şirket bağlamında pozitif değer bulunduysa onu kullanın).
- Her şablon için: `ortalamaSatis = varyantların lst_price toplamı / varyant sayısı`,
  `ortalamaMaliyet = varyantların bulunan standard_price toplamı / varyant sayısı` (bulunamayan
  varyantlar 0 sayılır — Görkem'in "toplam ÷ varyant sayısı" tarifiyle birebir).

### 2) `listStokUrunleri()` ve `getStokUrunRowsByIds()`'ü güncelleyin

Her iki fonksiyonda da, template listesini oluşturduktan sonra `resolveTemplateVariantAverages()`'ı
çağırın ve `varyantSayisi > 1` olan satırlarda `satisFiyati`/`alisFiyati` değerlerini bu ORTALAMA
değerlerle DEĞİŞTİRİN (tek varyantlı satırlarda MEVCUT hesaplamayı aynen koruyun — davranış
DEĞİŞMESİN).

### 3) Dışa aktarma (PDF/Excel/CSV) ile tutarlılık

`stok-export.service.ts`'teki `exportStokUrunleri()` zaten `getStokUrunRowsByIds()`'i kullandığı
için, 2. maddedeki düzeltme otomatik olarak dışa aktarmaya da yansıyacak — ayrıca kontrol edip
raporda doğrulayın (export edilen PDF/Excel'de de artık ortalama görünmeli).

### 4) Varyantlı üründe tek "Etiket" butonu — ORTALAMA fiyatla ASLA etiket basılmasın, varyant bazlı basılsın

Görkem'in ek talimatı: **"burada varyant bazlıda etiket basmalıyız"** — 1-3. maddelerdeki ortalama
fiyat düzeltmesinin doğal sonucu olarak, şablon satırındaki tek **"Etiket"** butonu (checkbox'la
varyant SEÇMEDEN, doğrudan satırdaki "Etiket" butonuna tıklanan akış) artık YANLIŞ bir riski
büyütüyor: bu buton, ürünün gerçek fiyatı yerine ORTALAMA fiyatla basılmış bir etiketi fiziksel
ürüne yapıştırma riski doğurur. Bu KABUL EDİLEMEZ — müşteriye satılan fiziksel ürün her zaman TEK
BİR varyanttır ve etiketinde O VARYANTIN GERÇEK fiyatı/barkodu olmalı, asla ortalama değil.

**Kök neden (kodda doğrulandı):** `packages/web/src/pages/admin/StokYonetimiPage.tsx`,
`etiketBas()`/`etiketUret()` (satır 562-628):

- Ürün TEK varyantlıysa (satır 578-585) zaten DOĞRU çalışıyor: `getSablonVaryantlari()` ile o tek
  varyantın gerçek `barcode`'unu buluyor.
- Ürün ÇOK varyantlıysa VE seçilen lokasyonda lot/seri bazlı stok bulunduysa (`getUrunLotlari()`,
  satır 567-604), bu fonksiyon zaten `stock.quant`'ı `product_id` (varyant) bazında sorguladığı
  için HER lot kendi doğru varyant fiyatını/barkodunu (`l.fiyat`, `l.barkod`) taşıyor — bu senaryo
  ZATEN DOĞRU, dokunmayın.
- **SORUN sadece şu fallback'te (satır 601-607):** lot bulunamazsa (`lotlar.length === 0`),
  kod `adet` tane GENERİK etiket üretiyor, HEPSİ `etiketUrun.satisFiyati` (artık ORTALAMA) ve AYNI
  `varsayilanBarkod`'u (çok varyantlı üründe genelde boş/anlamsız) kullanıyor — yani basılan HER
  etiket birbirinin aynısı, hiçbiri gerçek bir varyantı doğru YANSITMIYOR.

**İstenen:** Şablon satırındaki "Etiket" butonuna tıklandığında ürün çok varyantlıysa
(`varyantSayisi > 1`):

- Generic/ortalama fiyatlı etiket üretme fallback'ini KALDIRIN. Bunun yerine, modal açıldığında
  KULLANICIYA hangi varyant(lar) için kaç adet basılacağını seçtirin — mevcut "Seçili Varyantlara
  Etiket Bas" akışıyla AYNI/paylaşılan bir seçim bileşeni kullanmanız TERCİH EDİLİR (kod
  tekrarından kaçının): örn. "Etiket" butonuna tıklayınca o şablonu otomatik genişletip varyant
  seçim moduna geçirin, ya da modal içinde `getSablonVaryantlari()`'den gelen varyant listesini
  gösterip kullanıcıya işaretletin.
- Eğer bir sebeple gerçekten generic/toplu basım gerekiyorsa (örn. lot yok ama yine de basılmalı),
  HER ZAMAN varyantları TEK TEK dolaşıp HER BİRİNİN KENDİ `lst_price`/`barcode` değeriyle ayrı
  etiketler üretin (adet varyant sayısına bölünerek dağıtılabilir) — asla template'in ortalama
  `satisFiyati`'sı ya da tek bir `varsayilanBarkod` ile generic/tekrarlı etiket ÜRETMEYİN.
- Tek varyantlı ürünlerdeki mevcut doğru davranışı (satır 578-585) DEĞİŞTİRMEYİN.

**Test (ZORUNLU):** OPTELLİ gibi farklı fiyatlı 3 varyantı olan (2800/2300/2800) bir üründe, o
lokasyonda lot/seri stok kaydı OLMADAN doğrudan şablon satırındaki "Etiket" butonuna basın —
sonucun YA bir varyant seçim ekranı istemesi YA DA basılan her etiketin KENDİ gerçek varyant
fiyatını/barkodunu taşıması gerektiğini, kesinlikle 2633,33 ortalamasıyla basılmış generic bir
etiket ÇIKMADIĞINI gösterin.

## Test (ZORUNLU)

1. OPTELLİ gibi 3 varyantı da AYNI fiyatta olan bir şablonda (2800/2800/2800), şablon satırının
   HÂLÂ 2800 gösterdiğini doğrulayın (regresyon kontrolü — ortalama = sabit değerle aynı olmalı).
2. Varyantlardan birinin satış fiyatını farklı yapıp (örn. 2800/2300/2800), şablon satırının artık
   **(2800+2300+2800)/3 = 2633,33** gösterdiğini doğrulayın.
3. Aynı testi maliyet/Alış ₺ için de yapın — varyant maliyetlerini farklılaştırıp (örn.
   700/650/700), şablon satırının **(700+650+700)/3 = 683,33** gösterdiğini doğrulayın (şu anki
   0,00 yerine).
4. Tek varyantlı (varyantsız) bir ürünün şablon satırının davranışının DEĞİŞMEDİĞİNİ doğrulayın.
5. Dışa aktarma (PDF/Excel/CSV) çıktısında da şablon satırının ortalama değerleri gösterdiğini
   doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + test 1-5'in gerçek Odoo verisiyle (varyant fiyatları + hesaplanan
ortalama) sonucu + 4. maddedeki etiket basma testinin sonucu (varyant seçim ekranı ekran görüntüsü
ya da basılan etiketlerin her birinin gerçek varyant fiyatı/barkoduyla çıktığının kanıtı).
