# Ürün Girişi — aynı tedarikçi ürününü tek eşleştirmeyle tüm satırlara uygula

## Durum

Görkem, "Ürün Satırları" adımında (216 satırlık OPA2026000289158 faturası örneği) aynı ürünün
("100ML BIOTRUE /TR") çok sayıda satırda tekrar ettiğini görüyor (her birim ayrı satır olarak
geliyor — bu normal, fatura formatı böyle, bug değil). Bir satırı "Odoo'dan Seç" ile eşleştirdi
(BIOTRUE 100ML), ama geri kalan aynı isimli onlarca satırı tek tek eşleştirmek zorunda kalıyor.
İstenen: bir satırı eşleştirince, aynı tedarikçi ürün adına sahip diğer satırlara da **tek
tıkla** aynı eşleşmeyi uygulayabilmek.

## Referans — mevcut benzer desen

`DepoPage.tsx`'te zaten "Toplu Üretici" diye bir alan var (`topluUreticiUygula`, satır ~2891) —
kullanıcının elle yazdığı bir üretici adını TÜM satırlara uyguluyor. Burada istenen ona benzer
ama otomatik tespitli: kullanıcı elle bir şey yazmasın, sistem hangi satırların aynı tedarikçi
ürün adına sahip olduğunu kendisi bulsun.

`urunSec()` fonksiyonu (satır ~2785) bir satırı eşleştirirken şu alanları set ediyor:
`bizimUrunId, bizimUrunAdi, bizimUrunOdooId, bizimUrunProductId, bizimUrunBarkod,
varyantEtiketi, eslesti: true`. Toplu uygulama da aynı alan setini kopyalamalı.

## İstenen

1. **Genel/toplu buton (asıl istenen):** Satırların üstünde (örn. "Toplu Üretici" kutusunun
   yanında) bir **"Eşleşen isimleri otomatik tamamla"** butonu ekleyin. Tıklanınca:
   - Satırları `tedarikciUrunAdi` (trim + case-insensitive) bazında gruplasın.
   - Her grup için: eğer grupta **en az bir eşleşmiş** (`eslesti===true`) satır varsa, o
     satırın `bizimUrun*` alanlarını grubun **eşleşmemiş diğer tüm satırlarına** kopyalasın.
   - Birden fazla FARKLI eşleşme varsa aynı grup içinde (kullanıcı yanlışlıkla iki farklı ürünle
     eşleştirmişse), ilk eşleşeni baz alın ama bunu bir uyarıyla belirtin — sessizce
     üzerine yazmayın.
   - İşlem sonunda kısa bir özet gösterin: "X grup, Y satır otomatik eşleştirildi."
2. **Satır bazlı kısayol (isteğe bağlı, basitse ekleyin):** Bir satır eşleştirildiğinde, aynı
   isimde eşleşmemiş başka satır(lar) varsa küçük bir ipucu/buton gösterin: "Aynı isimde 34
   satır daha var — hepsine uygula" — tek tıkla o an için de yapılabilsin, genel butonu
   beklemeden.
3. Bu, sadece bu ekranın state'inde (henüz kaydedilmemiş satırlar) çalışan client-side bir
   işlem — backend değişikliği gerekmiyor.

## Test

216 satırlık (veya benzer, tekrarlı) bir faturada: 1 satırı elle eşleştirip "Eşleşen isimleri
otomatik tamamla" butonuna basınca, aynı isimli tüm satırların yeşil/eşleşmiş göründüğünü ve
doğru ürüne bağlandığını (barkod/ad tutarlı) gösterin. Farklı isimli satırların etkilenmediğini
de gösterin.

## Rapor formatı

Değişen dosya/satırlar + öncesi/sonrası ekran görüntüsü (216 satırın kaç saniyede/tek tıkla
eşleştiği).
