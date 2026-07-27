# Satınalma Siparişinden Fatura Oluşturunca İskonto Kayboluyor — BILL/2026/07/0004

## Durum

P00039 (OPA2026000289158) satın alma siparişinde her satır **Birim Fiyat 235,00 / İnd.% 5,00 /
Vergi hariç 223,25 ₺** olarak doğru görünüyor. Bu PO'dan "Fatura Oluştur" ile üretilen
BILL/2026/07/0004'te aynı satırlar **Fiyat 235,00 / İnd.% 0,00 / Vergi hariç 235,00 ₺** olarak
görünüyor — **iskonto faturaya hiç taşınmamış**. 216 satırın tamamında bu fark varsa muhasebe
tarafında gerçek maliyetten daha yüksek bir tutar kayıtlara geçiyor demektir (satır başına
~11,75 ₺ fazla × 216 ≈ 2.538 ₺, ama gerçek etkiyi doğrulamak gerekiyor — tüm satırlar aynı
iskontoda olmayabilir).

## İstenen — önce teşhis

1. BILL/2026/07/0004'ün nasıl oluşturulduğunu bulun: Görkem Odoo arayüzünde elle "Fatura
   Oluştur" butonuna mı bastı, yoksa bizim backend'imiz (`admin.controller.ts` veya başka bir
   modül) XML-RPC ile `action_create_invoice` ya da doğrudan `account.move`/`account.move.line`
   create çağrısı mı yapıyor? Kod tabanında bu çağrıları arayın.
2. Eğer bizim backend'imiz oluşturuyorsa: gönderilen `account.move.line` payload'ında `discount`
   alanı var mı, PO satırındaki `discount` değeriyle eşleşiyor mu kontrol edin.
3. Eğer bu Odoo'nun kendi standart "Fatura Oluştur" butonuysa (bizim kodumuz karışmıyorsa):
   Odoo çekirdeği normalde PO satırındaki `discount`'u faturaya kopyalar. Bu davranmıyorsa, bu
   kurulumda `account.move.line.discount` alanının override edilip edilmediğini veya farklı bir
   modülün (örn. Türkiye e-fatura entegrasyon modülü) satırları kendi mantığıyla yeniden
   oluşturup oluşturmadığını kontrol edin.

## Eğer kaynak bizim kodumuzsa — düzeltme

`discount` alanını PO satırından fatura satırına doğru taşıyın; 216 satırlık örnekte PO ile
Bill'in her satırdaki Vergi hariç tutarlarının birebir eşleştiğini gösterin.

## Eğer kaynak Odoo'nun kendi standart akışıysa

Bunu bize açıkça raporlayın — bizim kod tarafında düzeltilecek bir şey olmayabilir, Odoo
konfigürasyonu tarafında bakılması gerekebilir.

## Test

OPA2026000289158 (veya benzer iskontolu, çok satırlı) bir faturada PO satırı ile oluşan Bill
satırının İnd.% ve Vergi hariç değerlerinin birebir eşleştiğini gösterin.

## Rapor formatı

Kod konumu (nerede/kim faturayı oluşturuyor) + varsa düzeltme diff'i + öncesi/sonrası PO-Bill
karşılaştırma ekran görüntüsü.
