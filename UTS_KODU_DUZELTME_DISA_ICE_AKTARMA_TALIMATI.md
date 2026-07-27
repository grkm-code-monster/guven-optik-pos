# Eksik UTS kodlarını dışa aktar → doldur → tekrar yükle ile tamamlama

## Durum

Görkem'in bazı ürünlerin UTS kodları elinde var ama sistemde eksik (geçmiş `/urun-giris`
girişlerinde UTS hiç yazılmamıştı — bu bug ayrı bir talimatla düzeltildi, ama ESKİ kayıtlar hâlâ
boş). Önerisi: Stok Kontrol'de bu ürünleri seçip mevcut "Envanter Girişi" Excel şablonuna aktarsın,
eksik UTS Kodu hücrelerini doldursun, aynı dosyayı tekrar Envanter Girişi'nden yüklesin — sistem
bunu "aynı ürünü yeniden düzenleme/tamamlama" olarak algılayıp sadece eksik alanı doldursun.

## Kod okuyarak bulduğum İKİ önemli teknik detay (fikrin çalışması için bunlar şart)

1. **Stok miktarı re-import'ta güvenli** — `stock-adjustment.service.ts`'teki
   `applyStockAdjustmentForLot()` miktarı EKLEMİYOR, Odoo'nun envanter sayımı gibi MUTLAK bir
   değere SET ediyor (`inventory_quantity: targetQty`). Yani Excel'deki "Adet" sütununda aynı ürünün
   GÜNCEL gerçek stok miktarı yazarsa (0 fazla, 0 eksik), tekrar yükleme stoğu bozmaz/çoğaltmaz.
   Şablon dışa aktarılırken "Adet" sütunu OTOMATİK olarak ürünün O ANKİ gerçek stok miktarıyla
   doldurulmalı (kullanıcı yanlışlıkla farklı bir sayı girip stoğu bozmasın).

2. **KRİTİK EKSİK — şu an UTS güncellemesi ÇALIŞMAZ, önce bunu düzeltmemiz lazım:**
   `stock-lot.service.ts`'teki `getOrCreateStockLot()`, lot ZATEN VARSA (aynı `name` + `product_id`
   ile eşleşen bir `stock.lot` bulunursa) sadece mevcut `lotId`'yi döndürüp çıkıyor —
   `x_uts_kodu`/`ref` gibi alanları GÜNCELLEMİYOR, sadece YENİ oluşturulan lotlarda yazıyor:
   ```ts
   if (existing?.[0]?.id) {
     ...
     return { lotId: existing[0].id, created: false };   // ← utsKodu burada YAZILMIYOR
   }
   ```
   Yani Görkem'in senaryosunda (barkod zaten var, lot zaten var — sadece UTS eksik) mevcut kodla
   aynı Excel'i tekrar yüklese bile UTS kodu YİNE yazılmaz. Bunu düzeltmemiz gerekiyor.

## EK — Görkem'in kritik uyarısı: eşleştirme METİN yerine Odoo ID'siyle yapılmalı

Görkem doğru bir nokta belirtti: şu anki tasarımda satırların hangi Odoo kaydına ait olduğu
Kategori/Model/Renk/Ölçü METNİ üzerinden (`varyantKey`/`findVariantProductId`,
`envanter-import.service.ts`) çözülüyor. Bu, YENİ ürün girişi için mantıklı (henüz Odoo id'si yok)
ama bir DÜZELTME/tamamlama senaryosunda (kayıt zaten var, sadece eksik alan dolduruluyor) gereksiz
risk taşıyor — yazım farkı, boşluk, Türkçe karakter normalizasyonu gibi nedenlerle yanlış varyanta
eşleşme ya da "belirsiz eşleşme" hatası ihtimali var. Görkem'in önerisi: şablona Odoo'nun kendi
kayıt kimliğini (Odoo'nun kendi export ekranından bildiği `__export__.product_product_1721_...`
gibi bir "External ID" — bu string'in içindeki `1721` kısmı doğrudan `product.product.id`,
sonundaki hash Odoo'nun kendi ürettiği anlamsız bir etikettir, BİZE gerekmiyor) ekleyip, düzeltme
akışında eşleşmeyi METİN yerine bu DÜZ SAYISAL ID ile yapmak.

**Bunu şu şekilde uygulayın:**

1. `envanter-import.constants.ts`'teki `ENVANTER_IMPORT_HEADERS`'a, listenin SONUNA (mevcut
   sütun sırasını bozmadan, geriye dönük uyumluluk için) YENİ ve OPSİYONEL bir sütun ekleyin:
   `'Odoo Varyant ID'`. Bu sütun YENİ ürün girişlerinde BOŞ bırakılabilir (zorunlu alanlar listesine
   EKLEMEYİN) — sadece "UTS Düzeltme" akışında dolu gelecek.
2. `envanter-import.service.ts`'teki `ParsedEnvanterRow` tipine `odooVaryantId?: number` ekleyin,
   parse sırasında bu sütunu okuyun (boşsa `undefined`).
3. `envanter-import-uygula.service.ts`'te, satır işlenirken: **eğer `row.odooVaryantId` doluysa**,
   `findVariantProductId`/model-renk-ölçü eşleştirmesini TAMAMEN ATLAYIN, `varyantId` DOĞRUDAN bu id
   olsun (Odoo'da bu id'nin gerçekten var olduğunu ve barkodunun satırdaki barkodla eşleştiğini
   `product.product.read` ile TEK bir sorguyla doğrulayın — barkod uyuşmazsa "ID ile barkod
   eşleşmiyor" diye AÇIKÇA hata verin, sessizce yanlış ürüne yazmayın).
4. `row.odooVaryantId` BOŞSA, mevcut davranış (Model/Renk/Ölçü ile eşleştirme, yeni varyant/şablon
   oluşturma) AYNEN devam etsin — bu değişiklik SADECE id doluyken devreye girsin, mevcut yeni-ürün
   girişi akışını hiçbir şekilde etkilemesin.

Bu değişiklik hem UTS düzeltme akışını hem de ileride "varyant düzeyinde" benzer toplu
düzeltme/güncelleme ihtiyaçlarını (Görkem'in belirttiği gibi) güvenli şekilde destekler.

## İstenen

### 1) `getOrCreateStockLot()`'u güncelle (SADECE eksik alanı doldur, var olanı asla ezme)

`stock-lot.service.ts`'te, lot zaten varsa ve gelen `utsKodu` doluysa ama mevcut kayıtta
`x_uts_kodu` boşsa (`false`/`''`/`null`), SADECE bu durumda `stock.lot`'u `write` ile güncelle:

```ts
if (existing?.[0]?.id) {
  const avail = await isLotAvailableForReceipt(existing[0].id, cid);
  if (!avail.available) { throw ... }

  if (utsKodu) {
    const mevcut = await execute('stock.lot', 'read', [[existing[0].id]], { fields: ['x_uts_kodu'] }, cid);
    const mevcutUts = mevcut?.[0]?.x_uts_kodu;
    if (!mevcutUts) {
      await execute('stock.lot', 'write', [[existing[0].id], { x_uts_kodu: utsKodu }], {}, cid);
    }
    // mevcutUts DOLUYSA: HİÇBİR ŞEY YAPMA — var olan gerçek veriyi asla ezme
  }
  return { lotId: existing[0].id, created: false };
}
```

**Bunun DIŞINDA hiçbir alanı (barkod, miktar, isim vb.) bu "var olan lotu güncelle" yolunda
DEĞİŞTİRME** — sadece UTS kodu, sadece boşsa.

### 2) Stok Kontrol'e "UTS Düzeltme Şablonu İndir" seçeneği ekle

Stok Kontrol'de zaten var olan ürün seçim (`secili`/checkbox) mekanizmasını kullanarak:
- Seçili ürünler için, MEVCUT Envanter Girişi Excel şablonuyla AYNI sütun sırasında
  (`ENVANTER_IMPORT_HEADERS`, yukarıdaki EK'te eklenen "Odoo Varyant ID" sütunu dahil) bir dosya
  üretin — Kategori/Model/Renk/Ölçü/Barkod hücreleri ürünün GÜNCEL Odoo bilgisiyle ÖNCEDEN DOLU
  gelsin (kullanıcı yeniden yazmasın), "Adet" sütunu ürünün O ANKİ gerçek toplam stoğuyla dolu
  gelsin, "UTS Kodu" sütunu MEVCUT değeri varsa onunla yoksa BOŞ gelsin (kullanıcı sadece boşları
  dolduracak), **"Odoo Varyant ID" sütunu her satırda o varyantın gerçek `product.product.id`'siyle
  dolu gelsin** (bu, yukarıdaki EK'teki ID-bazlı eşleştirmenin çalışması için ZORUNLU).
- Bu, `stok-export.service.ts`'teki mevcut export altyapısını (Excel üretme kısmı) referans alabilir
  ama format `ENVANTER_IMPORT_HEADERS` ile birebir uyumlu olmalı ki aynı dosya doğrudan Envanter
  Girişi ekranından tekrar yüklenebilsin.

### 3) Envanter Girişi'nin önizleme adımı, "barkod zaten kayıtlı" hatasını bu senaryoda YANLIŞLIKLA
   BLOKLAMADIĞINDAN emin olun

Barkod zaten aynı ÜRÜNE/varyanta aitse (yani normal bir "restok" senaryosuysa) önizleme hata
vermemeli — muhtemelen zaten böyle çalışıyor (yoksa normal restok da bozuk olurdu), ama bu akış
için AYRICA test edin, varsaymayın.

## Test

0. Excel'de "Odoo Varyant ID" dolu bir satırda Model/Renk/Ölçü hücrelerini KASITLI olarak bozup
   (yanlış yazıp) yükleyin — sistem yine de ID'ye güvenip DOĞRU varyantı bulmalı (metne değil ID'ye
   göre eşleştiğini kanıtlayın). Barkodu da satırdaki değerle uyuşmayacak şekilde değiştirip ayrı
   bir denemede "ID ile barkod eşleşmiyor" hatasının doğru şekilde tetiklendiğini gösterin.
1. UTS kodu bilinen ama sistemde boş olan gerçek bir üründe: Stok Kontrol'den seç → şablon indir →
   Excel'de UTS Kodu hücresini doldur (adet sütununa dokunma) → Envanter Girişi'nden yükle.
2. Sonrasında Stok Kontrol'ün lot panelinde UTS kodunun göründüğünü doğrulayın.
3. Aynı üründe STOK MİKTARININ değişmediğini (öncesi/sonrası aynı) doğrulayın.
4. UTS kodu ZATEN dolu olan bir üründe aynı akışı deneyip, mevcut değerin DEĞİŞMEDİĞİNİ
   (ezilmediğini) doğrulayın — Excel'de o hücreye farklı bir değer yazılsa bile.
5. Excel'de "Adet" sütunu kasıtlı olarak farklı bir sayıyla değiştirilirse (kullanıcı hatası),
   stoğun o yeni (muhtemelen yanlış) sayıya SET edildiğini gösterin ve bunun beklenen/bilinen bir
   davranış olduğunu raporda not edin (Görkem'e ayrıca uyarı gösterilmesi gerekip gerekmediğini
   önerin — örn. içe aktarma önizlemesinde "mevcut stok: X, yeni: Y — stok değişecek" uyarısı).

## Rapor formatı

Yapılan kod değişiklikleri (dosya/satır) + yeni "Şablon İndir" butonunun UI'daki yeri + test 1-5
sonucu (ekran görüntüsüyle) + adet-değişikliği uyarısı için önerdiğiniz çözüm.
