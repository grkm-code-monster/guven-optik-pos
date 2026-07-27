# OPA2026000289158 — ₺48.077,33 "fark" uyarısının kök nedeni (teşhis)

## Durum

Ürün Girişi 5. adımda (Onay) OPA2026000289158 için "⚠ Dikkat: ₺48.077,33 fark var." uyarısı
çıkıyor. Bizim `hesaplananToplam` (216 satır, iskonto dahil) ≈ ₺48.222,00 — bu değer Odoo'da
oluşan P00039 satın alma siparişinin toplamıyla (216 satır, her biri iskontolu Vergi hariç
tutar) tutarlı görünüyor. Yani kendi tarafımızdaki hesaplama ve Odoo'ya aktarım **doğru
çalışıyor** — bu artık ayrı bir teyitle doğrulandı (bkz. `TEDARIKCI_FATURA_ISKONTO_KAYBI_TALIMATI.md`,
farklı bir konu).

`fark = |faturaToplamKdvHaric − hesaplananToplam| = 48.077,33` olduğuna göre,
`faturaToplamKdvHaric` (Uyumsoft'tan gelen "gerçek" fatura toplamı) ya ≈145,33 ya da
≈96.299,33 olmalı. 145,33, 216 kalemlik bir fatura için anlamsız derecede küçük — bu yüzden
gerçek Uyumsoft toplamının muhtemelen **≈96.299,33 (bizim hesapladığımızın neredeyse tam iki
katı)** olduğunu düşünüyorum.

Buna karşın Odoo'da PO'da GERÇEKTEN 216 satırın hepsi var (ekranda "1-40/216" yazıyor) — yani
kendi tarafımızda görünürde bir satır eksikliği yok. Olası açıklamalar:

1. Uyumsoft'taki gerçek faturada aslında 216'dan **fazla** kalem var (örn. ~432), ama bizim
   satır parse/aktarma mantığımız bir yerde listeyi 216'da kesiyor — oysa `taxExclusiveAmount`
   alanı XML'in kendi toplam alanından (TÜM kalemler için) okunuyor. Yani satır sayısı ile
   toplam tutar birbirinden bağımsız okunuyor olabilir: biri kesilmiş, diğeri tam.
2. `taxExclusiveAmount` yanlış XML alanından okunuyor olabilir (örn. KDV dahil tutar, ya da
   farklı bir fatura/dönem toplamı yanlışlıkla eşleşmiş).

Bunları **varsayım olarak** sunuyorum, kesinleştirmeden düzeltmeyin — önce doğrulayın.

## İstenen — teşhis

1. OPA2026000289158'in ham Uyumsoft UBL XML'ini (`getInboxInvoice`/`parseInboxInvoiceDetail`
   çağrısının ham cevabı) çekin. İçindeki `InvoiceLine` elemanlarını **sayın** — gerçekten 216
   mı, yoksa daha fazla mı?
2. Ham XML'deki `LegalMonetaryTotal/TaxExclusiveAmount` değerini doğrudan okuyup raporlayın —
   bizim `faturaToplamKdvHaric` olarak state'e koyduğumuz değerle birebir aynı mı?
3. Eğer XML'de gerçekten 216'dan fazla `InvoiceLine` varsa, bizim satır okuma/parse/aktarma
   mantığımızda (`gelen-fatura.service.ts` veya ilgili parse fonksiyonu) bir kesme/limit noktası
   olup olmadığını bulun (örn. bir `.slice()`, sabit bir `pageSize`, ya da SOAP tarafında
   sayfalama).
4. Eğer XML'de de tam 216 satır varsa ve `TaxExclusiveAmount` gerçekten ≈96.299 ise, kök neden
   farklıdır — XML'in kendisinde bir tutarsızlık olabilir (örn. tedarikçinin kendi hatası). Bu
   durumda bunu açıkça raporlayın, "bizim tarafta bug var" diye zorlamayın.

## Rapor formatı

Ham XML'deki gerçek satır sayısı + `TaxExclusiveAmount` değeri + bizim parse ettiğimiz/
gösterdiğimiz değerle karşılaştırma tablosu.
