# ZAROSSI test artıklarının temizliği (eski lot, şablon-arşiv tutarsızlığı, döküntü test varyantları)

## Durum

`ZAROSSI_BARKOD_TEKRAR_HATASI_TESHIS_TALIMATI.md` teşhisi sırasında, önceki test scriptinin
(`test-arsivleme-delete-prefix.ts`, Test 5) canlı Odoo'da bıraktığı 3 kalıntı tespit edildi. Bu
üçü de Görkem'in gerçek ZAROSSI envanterini ÇALIŞTIRMIYOR — ama veri kalitesini bozuyor, kafa
karıştırıyor ve ileride başka bir hataya yol açabilir. Şimdi temizlensin.

## 1) Eski, hatalı (ham GS1 string) lot kayıtları

Her 4 ana ZAROSSI varyantında (id 5655, 5687, 5671, 5673) artık İKİ lot var:
- ESKİ (hatalı): ham GS1 string, `DELETE_` önekli (`lot #536, #539, #537, #538` — teşhis
  raporundaki eski lot id'leri, kesin id'leri tekrar `stock.lot` sorgusuyla teyit edin).
- YENİ (doğru): temiz lot adı, barkodun kendisi (`lot #551-554`).

**İstenen:** Her eski/hatalı lot için, ÖNCE `stock.quant`/`stock.move.line` üzerinden bu lot'a
BAĞLI hâlâ pozitif miktar/hareket olup olmadığını kontrol edin (aynı güvenlik deseni
`stock-lot.service.ts`'teki `rollbackCreatedLot()`'ta zaten var — AYNI mantığı kullanın). Bağlı
stok/hareket YOKSA eski lot kaydını `unlink` ile silin. VARSA silmeyin, raporda "bu eski lot hâlâ
stokla ilişkili, manuel incelenmeli" diye açıkça belirtin — kör bir silme yapmayın.

## 2) Şablon #1956 arşiv durumu — aktif varyantlarla tutarsız

ZAROSSI şablonu (#1956) `active=false` iken 4 ana varyantı (5655, 5687, 5671, 5673) `active=true`
ve gerçek stoklu. Bu tutarsız bir durum — Stok Yönetimi listesinde şablon muhtemelen hiç
görünmüyor ya da yanlış görünüyor.

**İstenen:** Şablonun GERÇEKTEN arşivde kalması gerekip gerekmediğini değerlendirin — 4 ana
varyantı aktif ve stoklu olduğuna göre, şablonun da `active=true` yapılması (normal
"arşivden çıkar" akışıyla, `topluUrunArsivle`/`Arşivden Çıkar` mantığını kullanarak, DELETE_
önek geri alma dahil) muhtemelen doğru olanı. Bunu yaparken şablonun DİĞER (döküntü test)
varyantlarının durumu bozulmasın — sadece şablonun kendi `active` alanını düzeltmeniz yeterli
olabilir, ya da mevcut arşivden-çıkarma API'sini şablon id'siyle çağırın.

## 3) Döküntü test varyantları (20+ adet, çoğu arşivde/barkodsuz)

Bu oturumdaki çeşitli test scriptleri (`test-envanter-kategori-belirsiz.ts`,
`test-arsivleme-delete-prefix.ts` vb.) şablon #1956 altında irili ufaklı test varyantları
oluşturmuş olabilir (id aralığı yaklaşık #5697-5738, teşhis raporunda listelenen). Bunların
ÇOĞU zaten kendi scriptleri tarafından temizlenmiş olmalı ama bazıları kalmış görünüyor.

**İstenen:** Şablon #1956 altındaki TÜM varyantları (`context: active_test:false` ile) listeleyip,
gerçek ZAROSSI varyantları (barkodu olan, 4 ana varyant + varsa gerçek yeni renk/ölçüleri) İLE test
döküntüsü (barkodsuz, isimsiz/anlamsız nitelik kombinasyonlu, stok/hareketi olmayan) varyantları
AYIRT edin. Test döküntüsü olanlar için (1. maddedeki AYNI güvenlik kontrolüyle — stok/hareket
yoksa) `product.product`/gerekirse `product.template.attribute.line` temizliği yapıp silin.
Gerçek ZAROSSI varyantlarına KESİNLİKLE dokunmayın.

## Test

1. Eski/hatalı lot kayıtlarının (stoksuz olanların) silindiğini, YENİ temiz lotların
   dokunulmadan kaldığını gösterin.
2. Şablon #1956'nın artık `active=true` olduğunu ve Stok Yönetimi'nde normal göründüğünü gösterin.
3. Döküntü test varyantlarının sayısının azaldığını, 4 gerçek ZAROSSI varyantının (barkod,
   stok, lot bilgisiyle) DEĞİŞMEDEN durduğunu gösterin.
4. Bu temizlik sonrası Stok Kontrol/Stok Yönetimi'nde ZAROSSI'nin tamamen doğru/temiz göründüğünü
   (renk dahil ürün adı, tek doğru lot, doğru stok) ekran görüntüsüyle doğrulayın.

## Rapor formatı

Silinen/düzeltilen kayıtların listesi (id'lerle) + test 1-4'ün sonucu + son ZAROSSI görünümünün
ekran görüntüsü.
