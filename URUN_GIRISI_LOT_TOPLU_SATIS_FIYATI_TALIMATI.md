# Ürün Girişi — Lot/Barkod adımında toplu satış fiyatı

## Durum

Görkem, "4. Lot/Barkod" adımında (216 kalem örneği) her satırın kendi "Satış Fiyatı ₺" alanı
olduğunu, aynı ürünün (BIOTRUE 100ML gibi) onlarca satırda tekrar ettiğini görüyor. Az önce
"Ürün Satırları" adımı için istediğimiz "aynı isimdeki satırlara tek tıkla eşleştirmeyi uygula"
özelliğini burada da istiyor — bir satıra satış fiyatı girilince, **aynı ürüne** ait diğer
satırlara da otomatik/tek tıkla uygulansın.

## Kaynak — mevcut kod

`DepoPage.tsx`:
- `satisFiyatiGuncelle(lotId, yeniFiyat)` (satır ~3054) — tek bir lot satırının `satisFiyati`
  ve `satisFiyatiDegisti: 'true'` alanlarını set ediyor, ayrıca `bizimUrunOdooId` varsa
  `/admin/satis-fiyati-guncelle` ile Odoo `product.template.list_price`'ı da güncelliyor.
- Satırlar `lokasyon` bazında gruplanıyor (`grup = lotlar.filter(l => l.lokasyon === lokasyon)`,
  satır ~4322) — **ürüne göre gruplama yok**, aynı ürün farklı satırlarda tekrar tekrar
  görünüyor (216 satır → belki 10-15 farklı ürün, her biri çok kez).
- Her satırda zaten hızlı çarpan butonları var (`×2 ×3 ×4 ×5`, satır ~4515-4527) — Alış
  fiyatının katları, tek satır için.

## İstenen

1. **Satır bazlı otomatik tamamlama:** `satisFiyatiGuncelle` çalıştığında (kullanıcı bir satıra
   elle fiyat girdiğinde veya ×2/×3/×4/×5 butonuna bastığında), aynı `bizimUrunOdooId` (yoksa
   `bizimUrunAdi` ile eşleştirin) değerine sahip, henüz fiyatı girilmemiş (`satisFiyatiDegisti
   !== 'true'`) diğer lot satırlarını bulun ve bir bildirim/buton gösterin: **"Aynı üründe N
   satır daha var — hepsine ₺X uygula"**. Tıklanınca hepsine aynı fiyatı (ve gerekiyorsa aynı
   Odoo `list_price` güncellemesini, tek seferde toplu) uygulasın.
2. **Genel "Fiyatları otomatik tamamla" butonu (az önceki ürün eşleştirme özelliğiyle aynı
   mantık):** Sayfanın üstünde bir buton — tıklanınca TÜM ürün gruplarını tarasın, her grupta
   fiyatı girilmiş en az bir satır varsa o fiyatı grubun geri kalan (fiyatsız) satırlarına
   uygulasın. Özet göstersin: "X ürün grubu, Y satır fiyatlandırıldı."
3. Odoo `list_price` güncellemesi (`/admin/satis-fiyati-guncelle`) her satır için tek tek
   çağrılmasın — aynı `bizimUrunOdooId` için zaten bir kere güncellendiyse tekrar aynı isteği
   atmayın (gereksiz N adet aynı API çağrısı olmasın, performans).

## Test

216 satırlık faturada, BIOTRUE 100ML'in ilk satırına ₺480 girip toplu tamamlama ile diğer tüm
BIOTRUE satırlarının da ₺480 olduğunu, farklı ürünlerin (varsa) etkilenmediğini gösterin.

## Rapor formatı

Değişen dosya/satırlar + öncesi/sonrası ekran görüntüsü.
