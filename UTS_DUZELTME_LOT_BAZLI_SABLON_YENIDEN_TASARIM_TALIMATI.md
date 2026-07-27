# UTS Düzeltme şablonu YANLIŞ tasarlanmış — varyant değil, LOT bazlı olmalı

## ÖNEMLİ — bu talimat, önceki `ACIL_UTS_TEST_STOK_BOZULMASI_TEMIZLIK_TALIMATI.md`'nin
## 2. maddesindeki ("aynı UTS'i boş olan tüm lotlara yaz") öneriyi GEÇERSİZ kılıyor

O önerinin dayandığı varsayım (UTS kodu ürün SKU'suna sabit, tüm birimlerde aynı) YANLIŞ.
Görkem'in gönderdiği gerçek export çıktısı bunu netleştirdi ve düzeltti: **UTS kodu her FİZİKSEL
BİRİME (her lot/seri no'ya) özel ve eşsizdir.** Bir varyantın "Adet" alanı 16 ise, o varyant için
16 AYRI lot vardır ve her birinin KENDİ (muhtemelen farklı) UTS kodu olabilir/olmalı. Şu anki
export tek satırda tek "UTS Kodu" hücresiyle bunu temsil etmeye çalışıyor — bu YAPISAL OLARAK
yanlış, "Adet" ve tek bir "UTS Kodu" hücresi bir arada anlamsız.

**Önceki talimattaki 2. maddeyi UYGULAMAYIN (eğer henüz uygulanmadıysa) — bunun yerine bu talimatı
uygulayın. Zaten uygulandıysa, bu talimatla değiştirin/üzerine yazın.**

Önceki talimatın **1. maddesi (ürün #5572'nin bozulan gerçek stoğunun acilen düzeltilmesi) hâlâ
GEÇERLİ ve ACİL** — bu ayrıca, bağımsız olarak tamamlanmalı.

## Doğru tasarım: şablon LOT bazlı olmalı, VARYANT bazlı değil

### Export (Stok Kontrol → "UTS Düzeltme Şablonu İndir")

Seçili her varyant için, o varyantın Odoo'daki HER GERÇEK LOT KAYDI için AYRI BİR SATIR üretin
(`searchTransferProductLots`/doğrudan `stock.lot` sorgusuyla — Stok Kontrol'ün lot panelinin zaten
kullandığı aynı veri kaynağı). Yani "Adet: 16" olan bir varyant için 16 SATIR olmalı, her biri o
varyantın GERÇEKTEN VAR OLAN bir lotuna karşılık gelmeli.

Şablona (`ENVANTER_IMPORT_HEADERS`'ın SONUNA, geriye dönük uyumlu, opsiyonel) YENİ bir sütun daha
ekleyin: **`'Odoo Lot ID'`** (o satırın temsil ettiği `stock.lot.id`, ham Odoo id'si — "Odoo Varyant
ID" ile AYNI mantık, ama lot seviyesinde).

Her satırda:
- Kategori/Ürün Adı/Model/Renk/Ölçü/Barkod/Odoo Varyant ID: o varyantın bilgisi (tüm satırlarında
  aynı tekrar edebilir).
- **Lot No** (zaten var olan bir sütun mu kontrol edin, yoksa ekleyin) — o lotun GERÇEK adı
  (örn. `GRS-2026-07-5767-S18-001` ya da barkodun kendisi).
- **Odoo Lot ID** — o lotun gerçek `stock.lot.id`'si.
- **UTS Kodu** — o SPESİFİK lotun MEVCUT `x_uts_kodu` değeri, doluysa onunla, boşsa BOŞ.
- **Adet** — HER SATIRDA sabit `1` (her satır zaten tek bir lotu/birimi temsil ediyor, ayrıca
  toplam adet hesaplamaya GEREK YOK).

### Import (Envanter Girişi — aynı dosya tekrar yüklenince)

`row['Odoo Lot ID']` doluysa:
1. Bu id ile DOĞRUDAN `stock.lot.read([[id]], {fields:['id','product_id','x_uts_kodu']})` yapın.
2. Bulunan lotun `product_id`'sinin, satırdaki `Odoo Varyant ID` ile eşleştiğini doğrulayın —
   eşleşmezse "Lot ID ile Varyant ID uyuşmuyor" diye AÇIKÇA hata verin.
3. `x_uts_kodu` BOŞSA ve Excel'deki `UTS Kodu` DOLUYSA → SADECE bu lotun `x_uts_kodu` alanını
   `write` ile güncelleyin.
4. `x_uts_kodu` ZATEN DOLUYSA → HİÇBİR ŞEY YAPMAYIN (var olan veriyi asla ezmeyin), Excel'de farklı
   bir değer yazılmış olsa bile.
5. **STOK MİKTARINA (`stock.quant`/`applyStockAdjustmentForLot`) KESİNLİKLE DOKUNMAYIN** — bu akış
   artık TAMAMEN metadata (UTS kodu) düzeltmesi, stok/miktar işlemi DEĞİL. `Adet` sütunu bu satır
   tipinde YOK SAYILMALI (ya da her zaman sabit 1 olduğu için zaten anlamlı bir değişiklik
   üretmeyecek şekilde tasarlanmalı) — önceki `skipStockAdjust`/`getVariantTotalStock` mantığı
   `Odoo Lot ID` dolu satırlarda TAMAMEN DEVRE DIŞI kalmalı.

Bu tasarımla artık "adet eşleşiyor mu" heuristiği, `findLotNameForUtsCorrection`'daki keyfi
`byRef`/`emptyUts` tahminleri TAMAMEN GEREKSİZ hâle gelir — doğrudan ID ile kesin eşleşme var,
belirsizlik kalmaz. Bu fonksiyonları/mantığı bu akıştan kaldırın (sadece eski, ID'siz/legacy
senaryo için gerekiyorsa bırakın, ama `Odoo Lot ID` dolu satırlarda kullanılmasın).

## Test

1. ULTRA KONTAKT LENS -0125 (#5572, GERÇEK stok düzeltmesi tamamlandıktan sonra) gibi çok lotlu
   bir üründe: Stok Kontrol'den seç → şablon indir → çıktının VARYANT sayısı kadar değil, o
   varyantın GERÇEK LOT SAYISI kadar (14 lot varsa 14 satır) satır ürettiğini gösterin.
2. Farklı iki satıra (aynı üründen iki farklı lota) FARKLI UTS kodları girip yükleyin, ikisinin de
   KENDİ lotuna doğru yazıldığını, birbirine karışmadığını doğrulayın.
3. Stok miktarının bu işlem sonrası HİÇ değişmediğini (öncesi/sonrası tam aynı, her lokasyonda)
   doğrulayın.
4. UTS'si zaten dolu olan bir lot satırında Excel'e farklı bir değer yazılsa bile mevcut değerin
   korunduğunu doğrulayın.
5. `Odoo Lot ID` ile `Odoo Varyant ID` kasıtlı uyuşmayacak şekilde değiştirilirse doğru hatanın
   verildiğini gösterin.

## Rapor formatı

Yeni export/import mantığının kod değişiklikleri (dosya/satır) + test 1-5 sonucu (ekran
görüntüsüyle, özellikle "16 adet → 16 satır" örneği) + `ACIL_UTS_TEST_STOK_BOZULMASI_TEMIZLIK_TALIMATI.md`'nin
1. maddesinin (gerçek stok düzeltmesi) ayrıca tamamlanıp tamamlanmadığının teyidi.
