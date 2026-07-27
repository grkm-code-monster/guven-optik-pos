# Odoo muhasebe kayıtları — vergi eksikliği + FATURASIZ girişte cari önerisi

## 1) POS satışlarında Odoo'ya vergi (KDV) hiç gitmiyor — ÖNCELİKLİ

### Teşhis (kod üzerinden doğrulandı)

`backend/src/modules/sales/sale.service.ts`, `confirmSale()` içinde Odoo `sale.order` satırı
oluşturulurken (satır ~858-860):

```ts
...(typeof (item as any).odooTaxId === 'number' && (item as any).odooTaxId > 0
  ? { tax_id: [[6, 0, [(item as any).odooTaxId]]] }
  : {}),
```

`item.odooTaxId` alanı ne `SaleItem` Prisma modelinde ne backend input tipinde ne de frontend'de
(POS ekranlarında) hiçbir yerde dolduruluyor — kod tabanında bu satırın dışında hiç geçmiyor. Yani
bu koşul **her zaman** `false` ve `tax_id` **hiçbir POS satışında** Odoo satırına yazılmıyor.

Sonuç: müşteriden KDV dahil fiyat tahsil ediliyor, dışarıya giden gerçek e-Fatura'da (bizim kendi
`buildUBLXML` kodumuzla) KDV doğru hesaplanıp gönderiliyor — o taraf sorunsuz. Ama **Odoo'nun kendi
`sale.order`/fatura kayıtlarında bu satışların üzerinde hiç KDV görünmüyor.** Odoo'dan çekilecek
vergi raporu/KDV beyanname taslağı gerçek rakamları yansıtmıyor; Odoo defterleri ile gerçekte kesilen
resmi faturalar arasında sürekli bir tutarsızlık oluşuyor.

İskonto (discount) tarafı doğru çalışıyor, dokunmayın.

Not: Şirketler arası transfer faturalarında (`sirketler-arasi-transfer.service.ts`) vergi atanıyor
ama şirketin bulduğu ilk aktif satış vergisini kullanıyor (`account.tax` search limit:1) — ürünün
gerçek KDV oranıyla (%1/%10/%20) eşleşmeyebilir. Bunu da madde 2'de düzeltin.

### İstenen düzeltme

1. `Product` modelinde zaten `taxRate` alanı var (`e-Fatura` kodu da bunu kullanıyor —
   `uyumsoft-efatura.service.ts` `satistenFaturaData()`). POS satış satırı Odoo'ya giderken bu
   `taxRate`'e karşılık gelen Odoo `account.tax` kaydını bulup `tax_id` olarak satıra ekleyin
   (KDV oranına göre — %20, %10, %1 gibi ayrı vergi kayıtları olabilir, şirket bazında
   `account.tax` search'ünü `amount = taxRate` ile filtreleyin, sadece `type_tax_use='sale'` ve
   `company_id` şartıyla).
2. `price_unit` KDV dahil gönderildiği için Odoo'da vergi hesaplama şeklinin ("Tax Included" /
   fiyata dahil) doğru ayarlandığından emin olun — aksi halde vergi hem fiyata dahil hem üstüne
   eklenmiş gibi çift sayılabilir. Mevcut `account.tax` kayıtlarının `price_include` alanını
   kontrol edin.
3. Şirketler arası transfer faturasındaki vergi seçimini de (madde "Not"taki) aynı mantıkla ürün
   `taxRate`'ine göre düzeltin, ilk bulunanı almayın.
4. Geçmiş satışları düzeltmeyin (geriye dönük Odoo kaydı değiştirmek riskli) — sadece bundan sonraki
   satışlar için düzeltin.

Bu, para/muhasebe kayıtlarına dokunan bir değişiklik — kodu yazdıktan sonra en az bir test satışıyla
Odoo'da gerçekten `tax_id`'nin dolu geldiğini ve toplam tutarın değişmediğini (KDV dahil fiyat aynı
kalmalı, sadece kırılım görünür olmalı) doğrulayıp bana ekran görüntüsüyle rapor edin. Onaysız canlıya
almayın.

## 2) FATURASIZ ürün girişinde tedarikçi/cari izlenebilirliği

### Mevcut durum

FATURASIZ girişte (`createFaturasizIncomingPicking`, `admin.controller.ts` ~satır 2656) tedarikçi
zorunlu değil ve `stock.picking`'e `partner_id` hiç yazılmıyor — API seviyesinde hata vermiyor
(bu oturumda test edildi, çalışıyor), ama Odoo'nun kendi arayüzünde bu hareketlerin kimden geldiği
belirsiz kalıyor, izlenebilirlik zayıf.

### İstenen düzeltme

1. Her şirket için (NG/ADESE/POTENTIAL) Odoo'da genel amaçlı, gerçek bir tedarikçi olmayan **"Stok
   Sayım / Faturasız Giriş"** adında bir `res.partner` (is_company=true, supplier_rank=1) oluşturun
   — yoksa `getOrCreate` mantığıyla otomatik oluşturulsun.
2. `createFaturasizIncomingPicking`'de `stock.picking` create çağrısına `partner_id: <bu cari>`
   ekleyin (fiziki tedarikçi adı biliniyorsa `note` alanına yazılabilir, ama Odoo cari alanı hep bu
   sabit "Stok Sayım" carisi olsun — karışıklık olmasın, gerçek tedarikçi carisi kullanılmasın).
3. Bu değişiklik küçük ve düşük riskli — onaysız uygulayabilirsiniz, ama uyguladıktan sonra bir test
   FATURASIZ girişiyle Odoo'da picking'in gerçekten bu cariyle göründüğünü teyit edip rapor edin.

## Rapor formatı

Madde 1 için: değişen kod + bir test satışının Odoo ekran görüntüsü (tax_id dolu, toplam tutar
değişmemiş). Madde 2 için: oluşturulan cari + bir test FATURASIZ girişinin Odoo picking ekran
görüntüsü. Madde 1 onay bekliyor, madde 2'yi hemen yapabilirsiniz.
