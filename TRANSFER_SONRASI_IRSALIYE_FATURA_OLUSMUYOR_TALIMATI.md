# Transfer sonrası e-İrsaliye / e-Fatura oluşmuyor — kök neden bulunamıyor (log ekranı yok)

## Durum

Görkem iki senaryoyu canlı test etti:

1. **ANA DEPO → GVN2 (aynı şirket, NG→NG, farklı lokasyon):** Transfer başarıyla tamamlandı, stok
   GVN2'ye geçti (kontrol edildi). Ama Uyumsoft'tan **e-İrsaliye kesilmedi**.
2. **ANA DEPO → GVN1 (farklı şirket, NG→ADESE):** Transfer sırasında Uyumsoft'tan **e-Fatura
   oluşturulamadı**, hata alındı (detay ekran görüntüsü yok).

## Kod tarafı (mevcut mimari — doğrulandı)

`backend/src/modules/transfer/transfer-post-actions.service.ts`, `runTransferPostActions()`:
transfer başarıyla tamamlandıktan SONRA, arka planda ayrı bir adım olarak çalışıyor —
`FARKLI_LOKASYON` senaryosunda `runEIrsaliye()`, `SIRKET_DEGISIYOR` senaryosunda `runEFatura()`
tetikleniyor. İkisi de kendi içinde try/catch ile hataları yutuyor, ana transferi bozmuyor (bu
yüzden stok geçişi başarılı olsa bile fatura/irsaliye sessizce başarısız olabiliyor — bu tasarım
gereği, hata değil). Her ikisi de başarısızlıkta:
- `logTransferAksiyon()` ile bir `transfer-aksiyon-log` kaydı yazıyor (mesaj dahil).
- `notifyEirsaliyeFailure()` / `notifyTransferAksiyonFailure()` ile bir bildirim oluşturuyor.

**Sorun:** Bu logları görüntüleyecek hiçbir admin ekranı yok — `admin.controller.ts`'de
`transfer-aksiyon-log`'a dair hiçbir route bulunamadı. Yani bir post-action sessizce başarısız
olduğunda, gerçek hata mesajını görmenin tek yolu bildirim çanına düşen bildirim (varsa) veya
doğrudan veritabanı sorgusu.

## İstenen

1. **Önce teşhis:** Bu iki spesifik transfer için (`ANA DEPO→GVN2` ve `ANA DEPO→GVN1`, bugünün
   tarihi) `transfer-aksiyon-log` tablosundan gerçek kayıtları çekip (`aksiyon`, `durum`, `mesaj`
   alanları) tam olarak ne olduğunu raporlayın:
   - Post-action hiç çalışmadı mı (log kaydı yok)?
   - Çalıştı ama hata verdi mi (log kaydı var, `durum=basarisiz`, `mesaj` neyi gösteriyor)?
   - Bildirim gerçekten oluşturuldu mu (bildirimler tablosunda karşılığı var mı)?
2. Kök nedeni bulun ve düzeltin (örnek adaylar, doğrulanması gereken — kafanıza göre birini seçip
   "böyle olmalı" demeyin, gerçek log mesajına göre gidin):
   - `getSupplierInfo()`/`isEDespatchUser()`/`isEInvoiceUser()` çağrısı VKN eksik/hatalı olduğu
     için mi başarısız oluyor (GVN1/GVN2 şubelerinin VKN/adres bilgisi eksik olabilir)?
   - `isEirsaliyeTransferEnabled()` false mu dönüyor (ortam değişkeni kapalı olabilir) — GVN2 için
     bunu kontrol edin, öyleyse bu "hata" değil, bilinçli kapalı bir özellik, Görkem'e böyle
     raporlayın.
   - Uyumsoft SOAP çağrısının kendisi mi hata veriyor (yetki, format, eksik alan)?
3. Kısa vadeli, düşük riskli bir admin ekranı/uç nokta ekleyin: `transfer-aksiyon-log` kayıtlarını
   transfer referansına göre listeleyen basit bir `GET /admin/transfer-aksiyon-log?transferRef=...`
   (veya genel liste) + Depo Yönetimi tarafında en azından "Bekleyen Transferler" ekranındaki her
   transfer satırına post-action durumunu (✓/✗ e-Fatura, ✓/✗ e-İrsaliye, ✓/✗ UTS) gösteren küçük
   bir rozet ekleyin — böylece Görkem bir daha bana ekran görüntüsü göndermek zorunda kalmadan
   kendisi görebilsin.

## Test

1. İki spesifik transferin gerçek log mesajlarını (önce/sonra) raporlayın.
2. Aynı iki senaryoyu tekrar deneyip düzeltmeden sonra e-İrsaliye/e-Fatura'nın gerçekten oluştuğunu
   gösterin.
3. Yeni log görüntüleme ekranından bu kayıtların görünebildiğini ekran görüntüsüyle gösterin.

## Rapor formatı

Gerçek log mesajları (önce) + kök neden + değişen dosyalar + sonra log mesajları + yeni ekranın
ekran görüntüsü.
