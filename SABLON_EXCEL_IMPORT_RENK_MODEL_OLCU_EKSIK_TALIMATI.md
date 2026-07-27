# Excel toplu ürün aktarımı Model/Renk/Ölçü'yü hiç sormuyor — varyantsız/renksiz ürün oluşuyor

## Durum

Görkem'in akışı: önce bir ürün şablonu + varyant (Model/Renk/Ölçü niteliklerini kullanarak,
`/odoo-varyant-import` uç noktasıyla) tanımladı. Sonra Stok Yönetimi/Ürün Yapılandırma'dan bir
Excel şablonu indirip doldurdu ve "içe aktar" dedi. Sonuç: Stok Kontrol ekranında "OPTELLİ OPTİK
ÇERÇEVE" adlı 3 ayrı satır görünüyor, HER BİRİNİN BARKODU FARKLI ama **renk bilgisi hiçbir yerde
yok** — sadece "(OP11850, 50)" gibi model+ölçü görünüyor, renk tamamen kayıp. Kaynak Excel'de renk
bilgisi VARDI (Görkem'in teyidi) ama sisteme hiç yansımamış.

## Kök neden (kodda doğrulandı)

`backend/src/modules/admin/sablon-excel-import.constants.ts` — bu aracın Excel şablonu SADECE şu
sütunları biliyor:

```ts
export const SABLON_EXCEL_HEADERS = [
  'Kategori (tam yol)', 'Ürün Şablon Adı', 'Barkod', 'İç Referans',
  'KDV Oranı', 'Satış Fiyatı', 'Maliyet', 'Şirket', 'İzleme',
] as const;
```

**Model, Renk, Ölçü sütunları YOK.** `sablon-excel-import.service.ts`'de de (tüm dosya
tarandı) `model`/`renk`/`olcu`/`attribute`/`varyant` geçen TEK BİR satır yok — bu araç her Excel
satırı için doğrudan **YENİ bir `product.template` oluşturuyor** (`durum: 'created'`), var olan
şablon+varyant yapısını hiç aramıyor/eşleştirmiyor.

**Karşılaştırma — doğru olan araç zaten var:** `admin.controller.ts`, `POST /odoo-varyant-import`
(satır 5719+) ve `backend/src/modules/admin/odoo-varyant-import.service.ts`, TAM OLARAK bunu doğru
yapıyor: MODEL/RENK/ÖLÇÜ niteliklerini (`product.attribute`) bulup, her satır için nitelik
değerlerini (`product.attribute.value`) bulup/oluşturup, doğru `product.template.attribute.line`
kombinasyonunu eşleştirip VAR OLAN varyantı güncelliyor ya da eksikse doğru attribute
kombinasyonuyla yeni varyant oluşturuyor.

Yani Görkem, RENK/ÖLÇÜ destekleyen doğru aracı DEĞİL, tek-SKU/varyantsız ürünler için tasarlanmış
BAŞKA bir Excel aracını kullanmış — ikisi arasında hiçbir çapraz kontrol/uyarı yok, kullanıcıya
"bu araç renk/ölçü desteklemiyor" diye bir bilgi de verilmiyor.

## İstenen

### 1) Excel şablonuna Model/Renk/Ölçü sütunlarını ekleyin (OPSİYONEL)

`sablon-excel-import.constants.ts`'e üç yeni hedef alan ekleyin: `model`, `renk`, `olcu` (hepsi
opsiyonel — dolu değillerse mevcut "düz şablon oluştur" davranışı AYNEN kalsın, geriye dönük
uyumluluk bozulmasın).

### 2) İçe aktarma mantığını güncelleyin

`sablon-excel-import.service.ts`'deki aktarım fonksiyonuna (satır ~400-450 civarı, `product.template
create` çağrısının olduğu yer), her satır için:

- Eğer `model`/`renk`/`olcu` HEPSİ doluysa: yeni bir şablon oluşturmadan önce, AYNI
  `urunSablonAdi`ya sahip mevcut bir `product.template` olup olmadığını kontrol edin (`name` ile
  arayın, ya da kullanıcıdan Excel'de bir `tmplId` sütunu doldurmasını isteyin — hangisi daha
  sağlam görünüyorsa). Bulursanız, `odoo-varyant-import.service.ts`'deki AYNI mantığı (nitelik
  bulma/oluşturma, `product.template.attribute.line` eşleştirme, doğru varyantı bulma/oluşturma)
  ÇAĞIRIP kullanın — kod tekrarı yerine ortak bir fonksiyona çıkarıp iki yerden de çağırmanız
  tercih edilir.
- Eğer model/renk/ölçü boşsa: MEVCUT davranışı (düz, varyantsız şablon oluştur) AYNEN koruyun.
- Doğrulama adımına (`SablonDogrulamaSonuc`), model/renk/ölçü dolu olan ama karşılık gelen nitelik
  DEĞERİ Odoo'da bulunamayan satırlar için bir uyarı ekleyin (mevcut `gecersizKdvSatirlar`
  deseniyle tutarlı).

### 2.1) KRİTİK GÜVENLİK KURALI — varyantı olan bir şablon ASLA yeniden açılıp yeni şablon/varyant OLUŞTURULMASIN

Görkem'in açık talimatı: **"Excel eğer varyant varsa yeniden açmasın sakın."** Yani:

- Excel satırındaki `urunSablonAdi` (ve/veya barkod/iç referans), Odoo'da `product_variant_count >
  1` olan (yani zaten Model/Renk/Ölçü ile varyantlanmış) bir `product.template`'e karşılık
  geliyorsa, bu satır için KESİNLİKLE yeni bir `product.template` OLUŞTURMAYIN — ne "isim
  benzer ama tam eşleşmiyor" durumunda, ne de eşleştirme belirsizse. Böyle bir durumda:
  - Model/Renk/Ölçü sütunları DOLUYSA ve mevcut nitelik değerleriyle TAM eşleşiyorsa: sadece o
    VARYANTIN barkod/fiyat/maliyet/KDV'sini güncelleyin (yeni template/yeni attribute line
    AÇMADAN).
  - Model/Renk/Ölçü sütunları BOŞSA ya da eşleşme belirsizse: bu satırı `skipped-duplicate` (ya
    da yeni bir `skipped-variant-exists` durumu) olarak İŞARETLEYİP ATLAYIN, kullanıcıya "bu ürün
    zaten varyantlı, Excel'den değil Ürün Yapılandırma/varyant ekranından düzenleyin" gibi AÇIK
    bir mesaj gösterin. SESSİZCE atlamayın.
- Bu kontrolü, "aynı isimde şablon var mı" aramasından BAĞIMSIZ ayrıca yapın: önce
  `product_variant_count` kontrolü, SONRA (sadece varyantsızsa ya da tam eşleşme varsa) diğer
  mantık işlesin. Amaç: bu aracın, önceden özenle Model/Renk/Ölçü ile kurulmuş bir varyant
  yapısını ASLA bozmaması/çoğaltmaması — belirsiz her durumda "oluşturma", "atla ve bildir"
  tercih edilsin.
- Bu davranışı test ederken, KASITLI olarak zaten varyantlı bir ürünün adını/barkodunu içeren bir
  Excel satırı deneyip, sistemin YENİ bir şablon OLUŞTURMADIĞINI, bunun yerine "atlandı, zaten
  varyantlı" mesajı verdiğini AÇIKÇA doğrulayın — bu test raporun ZORUNLU bir parçası.

### 2.2) KRİTİK GÜVENLİK KURALI — kategori zaten varsa ASLA yeniden oluşturulmasın (aynı kategoriden 2 tane açılmasın)

Görkem'in ikinci açık talimatı: **"Kategorilerde aynı şekilde varsa açmasın sakın. Bir tanesini 2
tane yapmış zaten."** — yani sistemde GERÇEKTEN bir kategori zaten ikiye bölünmüş durumda. Kod
taraması şu 3 `product.category`/`create` çağrı noktasını buldu:

1. `sablon-excel-import.service.ts`, `resolveKategoriId()` (satır ~279-287) — bu fonksiyon
   `complete_name` üzerinde TAM eşleşme arıyor, bulamazsa `null` dönüyor ve import tüm satırı
   doğrulama aşamasında reddediyor (`kategoriOk=false`). **Bu fonksiyon kategori OLUŞTURMUYOR** —
   bu araç kategori kopyalama bugının kaynağı DEĞİL, dokunmanıza gerek yok, davranışı AYNEN koruyun.
2. `odoo-varyant-import.service.ts`, `createEnvanterSablon()` (satır ~317-332) — `name` alanında
   **`ilike` (bulanık/kısmi) arama** yapıyor, eşleşme yoksa HEMEN yeni bir `product.category`
   `create` ediyor. Görkem'in akışında ("önce ürün şablonu ve varyant tanımladım") ilk adım
   muhtemelen bu fonksiyonu/uç noktayı kullanıyor — **bu, gözlemlenen kategori ikilenmesinin ANA
   ŞÜPHELİSİ.** `ilike` + boşluk/büyük-küçük harf/Türkçe İ-I-ı-i karakter farklılıkları yüzünden
   aslında var olan bir kategori bulunamayıp yenisi yaratılmış olabilir.
3. `admin.controller.ts`, `POST /odoo-kategori-ekle` (satır 5330-5341) — bu, kullanıcının BİLEREK
   "yeni kategori ekle" dediği AYRI, KASITLI bir uç nokta (frontend'de muhtemelen "Yeni Kategori"
   butonu). Kasıtlı kullanıcı eylemi olduğu için prensipte "otomatik/sessiz" oluşturma değil, AMA
   BURADA DA aynı ilike-öncesi-kontrol prensibi uygulanmalı: kullanıcı "yeni kategori ekle" dese
   bile, GİRİLEN isimle TAM ya da neredeyse TAM eşleşen bir kategori zaten varsa, sessizce ikinci
   bir tane açmak yerine kullanıcıyı uyarıp var olanı kullanmayı önermelidir.
   `admin.controller.ts` satır 1471 içindeki (başka bir ürün oluşturma uç noktasının içinde gömülü)
   ilike-arama + create de AYNI şüpheli deseni taşıyor — bunu da 2. maddedeki gibi düzeltin.

**İstenen davranış (2 ve 1471 için, 3'teki kasıtlı uç nokta için de UYARI şeklinde uygulanabilir):**

- Kategori arama mantığını `ilike` yerine ÖNCE **tam eşleşme** (`name` ya da `complete_name` `=`,
  `trim()`lenmiş, mümkünse Odoo tarafında case-insensitive ama TAM metin eşleşmesi — kısmi/substring
  DEĞİL) ile yapın.
- Tam eşleşme bulunamazsa, YİNE DE hemen `create` etmeyin:ikinci bir adım olarak normalize edilmiş
  bir karşılaştırma deneyin (baştaki/sondaki boşlukları temizleyip, Türkçe karakter/büyük-küçük harf
  farklarını göz önünde bulundurarak) var olan kategoriler arasında GERÇEKTEN yakın bir eşleşme olup
  olmadığını kontrol edin. Yakın bir eşleşme varsa onu KULLANIN, yeni oluşturmayın.
- Sadece gerçekten hiçbir eşleşme (tam ya da normalize edilmiş) yoksa yeni kategori oluşturun.
- Belirsiz durumlarda (örn. birden fazla yakın eşleşme bulunursa) SESSİZCE birini seçip
  oluşturmayın/kullanmayın — kullanıcıya AÇIK bir mesajla bildirip elle seçim/onay isteyin (Excel
  akışında satırı `skipped-category-ambiguous` gibi bir durumla işaretleyip atlayın).
- Bu değişiklik SONRASINDA, sistemde zaten OLUŞMUŞ olan ikilenmiş kategoriyi OTOMATİK
  birleştirmeyin/silmeyin — bu, "Mevcut bozuk veri" bölümündeki OPTELLİ kaydı gibi AYRI, manuel bir
  veri temizliği konusu. Sadece BUNDAN SONRA yeni ikilenme OLUŞMASINI engelleyin.

**Test:** Var olan bir kategori adını (baştan/sondan boşluklu, büyük/küçük harf farklı bir
varyasyonuyla, örn. " optik çerçeve " vs "Optik Çerçeve") hem `/odoo-varyant-import` akışından hem
(varsa) `admin.controller.ts:1471` akışından deneyip, YENİ bir `product.category` OLUŞMADIĞINI,
var olanın kullanıldığını Odoo'da doğrulayın — bu test raporun ZORUNLU bir parçası.

### 3) Kullanıcı deneyimi — hangi aracın ne zaman kullanılacağını netleştirin

Excel şablonu indirme ekranına (frontend, muhtemelen `StokYonetimiPage.tsx`/
`UrunYapilandirmaPage.tsx` içinde) kısa bir not/tooltip ekleyin: "Renk/ölçü varyantlı ürünler için
Model/Renk/Ölçü sütunlarını doldurun; boş bırakırsanız her satır İÇİN AYRI, varyantsız bir ürün
şablonu oluşturulur." Bu, Görkem'in yaşadığı karışıklığın tekrarlanmasını önler.

## Mevcut bozuk veri — AYRI bir konu, bu talimatın kapsamı DIŞINDA

Ekran görüntüsündeki 3 "OPTELLİ OPTİK ÇERÇEVE" kaydı zaten YANLIŞ (renksiz, muhtemelen 3 ayrı düz
`product.template` olarak) oluşmuş durumda. Bu talimat sadece BUNDAN SONRAKİ aktarımları düzeltir
— mevcut kayıtları OTOMATİK DÜZELTMEZ/BİRLEŞTİRMEZ. Mevcut kayıtları temizlemek (doğru
varyantlarla birleştirmek ya da silip yeniden doğru araçla aktarmak) ayrı, manuel bir veri
temizliği gerektirir — bunu şimdi yapmayın, sadece raporda "mevcut OPTELLİ kayıtları düzeltme
kapsamında değil, ayrı ele alınmalı" diye belirtin. Görkem isterse bunun için ayrı bir talimat
yazarım.

## Test

1. Model/Renk/Ölçü sütunları BOŞ bırakılmış bir Excel ile mevcut davranışın (düz şablon
   oluşturma) BOZULMADIĞINI gösterin.
2. Model/Renk/Ölçü DOLU, aynı `urunSablonAdi`ya sahip birden fazla satırlı (farklı renk/ölçü
   kombinasyonlarında) bir test Excel'i aktarıp, sonucun TEK bir şablon altında DOĞRU
   varyantlar (her biri kendi renk/ölçü/barkoduyla) olarak oluştuğunu, Stok Kontrol ekranında
   artık renk bilgisinin göründüğünü (örn. "(Kırmızı, 53)") gösterin.
3. Aynı senaryoyu, VAR OLAN bir şablona YENİ bir renk/ölçü varyantı EKLEME durumu için de test
   edin (mevcut varyantları bozmadan yeni birini ekleyebilmeli).
4. 2.2'deki kategori-ikilenmemesi testini (var olan kategoriyi boşluk/büyük-küçük harf farklı bir
   yazımla yeniden "oluşturmaya" çalışıp yeni kayıt AÇILMADIĞINI göstermek) ayrıca çalıştırın.

## Rapor formatı

Değişen dosyalar/satırlar + yeni Excel şablonunun sütun listesi + test 2/3'ün Odoo'daki gerçek
sonucu (varyant listesi + attribute değerleri ekran görüntüsü/verisi) + test 4'ün (kategori
ikilenmemesi) sonucu.
