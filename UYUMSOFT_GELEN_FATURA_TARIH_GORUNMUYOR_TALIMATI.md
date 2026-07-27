# Gelen fatura listesinde fatura tarihi görünmüyor ("—")

## Durum

Görkem, "Uyumsoft'tan Otomatik Gelen Faturalar" modalinde her kayıtta fatura tarihinin de
görünmesini istiyor — amaç, OPA2026000289021 gibi eski bir faturayı sayfa sayfa "Daha fazla
yükle" tıklayarak aramak yerine, listede tarihe bakıp doğrudan bulabilmek. Ekran görüntüsünde
tarih alanı boş, `—` olarak görünüyor (örn. "— · 1 kalem · ₺0,2").

## Önce doğrulayın — bu güncel mi eski mi

`gelen-fatura.service.ts`'te `faturaTarihi` alanı zaten var ve render ediliyor
(`kayittanOzet()` → `faturaTarihi: veri?.issueDate`, frontend'de
`{f.faturaTarihi || '—'} · {f.kalemSayisi} kalem...`). `issueDate`, her fatura için
`getInboxInvoice()` ile çekilen detaydan (`ublAlanOku(inv.IssueDate)`, UBL XML'den) geliyor —
sadece liste çağrısından değil, her kayıt için ayrıca detay çağrısı yapılıyor.

Bu ekran görüntüsü, geçmişe dönük arama özelliğini eklediğiniz son değişiklikten ÖNCEKİ bir
görüntü olabilir (Görkem aynı ekranı daha önce de paylaşmıştı). Önce **NG için "Uyumsoft'tan
Çek"i taze bir tarih aralığıyla tekrar çalıştırıp** tarihlerin şimdi gelip gelmediğini kontrol
edin.

## Eğer taze çekimde de tarih hâlâ boşsa

`uyumsoft.service.ts` → `parseInboxInvoiceDetail()` satır ~507:
```ts
issueDate: String(ublAlanOku(inv.IssueDate) || '').slice(0, 10),
```
`ublAlanOku(inv.IssueDate)` gerçek SOAP yanıtında boş/yanlış path dönüyor olabilir — birkaç
gerçek `GetInboxInvoiceAsync` yanıtını (ham XML/JSON, log'a yazdırıp) inceleyip `IssueDate`
alanının yanıtta nerede olduğunu doğrulayın, gerekirse `ublAlanOku` çağrısını doğru path'e
düzeltin.

## Ayrıca isteniyor — tarihe göre sıralama/atlama

Sadece tarihi göstermek yetmez, Görkem'in asıl amacı belirli bir tarihe "direkt bakabilmek".
Ekleyin:
1. Liste **fatura tarihine göre azalan sırada** gösterilsin (şu an muhtemelen `createdAt`
   [bize ne zaman senkronize olduğu] sırasında — kullanıcı için anlamsız bir sıra).
2. Arama kutusunun yanına opsiyonel bir **"tarihe git" / sıralama yönü (En yeni / En eski)**
   kontrolü ekleyin ki kullanıcı istediği tarihe yakın kayıtlara hızlı gitsin.

## Test

NG için taze bir "Uyumsoft'tan Çek" çalıştırıp listede her satırda gerçek bir tarih
(`GG.AA.YYYY` gibi okunur formatta) göründüğünü, listenin tarihe göre sıralı olduğunu ekran
görüntüsüyle gösterin.

## Rapor formatı

Kök neden (eski ekran görüntüsü müymüş, yoksa gerçek parse bugı mıymış) + değişen dosya/satır +
tarihli, sıralı liste ekran görüntüsü.
