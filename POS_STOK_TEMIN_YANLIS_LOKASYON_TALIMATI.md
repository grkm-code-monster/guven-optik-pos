# POS "Stok & Temin" adımı — GVN2'de olmayan ürün "Bu mağazada mevcut" diyor

## Durum

Görkem GVN2 (NG) POS'unda "Yeni Satış" akışında "OSSE OPTİK ÇERÇEVE / OS13256 / C1 / 57" kalemi
için "5.5. Temin" adımında **"✅ Bu mağazada mevcut"** gördü. Ama Yönetim Paneli → Stok Yönetimi →
Stok Kontrol'de aynı ürünü ("osse" araması) kontrol ettiğinde: toplam stok **1 adet**, sadece
**GVN3'te**, GVN2 dahil diğer tüm şubelerde **0**.

## Not — istenen özellik zaten kodda var

`StokTeminStep.tsx`'te `BASKA_LOKASYON` durumu tam olarak istenen davranışı yapıyor: ürün başka
şube(ler)de varsa listele, kaynak şube seçtir, "Transfer Et" butonuyla `/admin/transfer-olustur`
çağırıp POS'tan doğrudan transfer talebi başlat. Kod değişikliği gerekmiyor — sorun bu ürünün
yanlışlıkla "MEVCUT" (BASKA_LOKASYON değil) olarak sınıflandırılması.

## İstenen — sadece teşhis

1. Bu spesifik sale item için frontend'in backend'e gönderdiği `productId`'yi (network log veya
   DB'deki `SaleItem.odooProductId`) bulun.
2. Aynı `productId` ile `GET /admin/stok-kontrol-urun?productId=<id>` çağrısını doğrudan yapıp
   dönen `lokasyonlar` dizisini raporlayın — GVN2 gerçekten `kullanilabilir > 0` mu dönüyor?
3. Eğer öyleyse: bu productId için Odoo'da `stock.quant` kayıtlarını (`location_id.usage=internal`)
   doğrudan sorgulayın — GVN2 lokasyonunda (id 59) bu ürün için gerçekten pozitif bir quant var mı,
   varsa nereden gelmiş (hatalı/eski bir test kaydı olabilir mi)?
4. Admin panelindeki Stok Kontrol ekranının "osse" aramasında gösterdiği ürün ile POS'taki bu sale
   item'ın `productId`'si **aynı Odoo `product.product` kaydı mı**? Farklıysa (örn. admin ekranı
   template/varyant toplamı gösteriyor, POS spesifik bir varyantı sorguluyor gibi bir tutarsızlık
   varsa) bunu netleştirin.
5. Kök nedeni (hatalı/eski quant kaydı mı, productId eşleşme sorunu mu, başka bir şey mi) bulup bana
   raporlayın — düzeltmeyi ne olduğuna göre birlikte kararlaştıralım, şimdilik kod değişikliği
   yapmayın.

## Rapor formatı

Adım 1-4'ün sonuçları + kök neden hipoteziniz. Kısa tutun, kod değişikliği önermeden önce bana
gösterin.
