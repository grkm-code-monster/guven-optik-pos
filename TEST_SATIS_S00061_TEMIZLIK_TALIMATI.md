# Test satışı temizliği — S00061 / SFAT/2026/00043 (YAPRAK GEZER)

## Durum

Görkem onayladı: bu satış **test kaydı**, gerçek müşteri değil. Yanlış KDV (%0) ile oluşmuş,
tamamen temizlenmesi isteniyor — düzeltme değil, silme/iptal.

## Kapsam

**Postgres:**
- `Sale.id = c8517adb-2e6e-48d3-8eae-89c8cd1d656f` (ve bağlı `SaleItem`, `Payment`,
  `Prescription`/`Frame`, varsa `CustomerPrescription` kayıtları)
- `FaturaKuyruk` — bu `satisId`'ye ait, hâlâ eski (`kdvOrani: 0`) veriyle donmuş kayıt — **bu özellikle
  önemli, silinmezse Uyumsoft borcu ödendikten sonra cron bunu yanlış veriyle tekrar göndermeyi
  dener.**

**Odoo:**
- Sale Order **S00061** (Odoo #59)
- Invoice **SFAT/2026/00043** (Onaylanmış, kısmi ödenmiş — Nakit ₺25, Havale ₺10 kayıtlı)
- Delivery **WH/OUT/00049**

## İstenen

1. Önce Odoo tarafını temizleyin, doğru sırayla (ödeme kayıtlarının reconcile durumuna göre önce
   ödemeleri geri alın/iptal edin, sonra faturayı iptal edin — zaten "Onaylanmış" durumda direkt
   silinemeyebilir, Odoo'nun izin verdiği yöntemi kullanın: `action_cancel` veya credit note ile
   sıfırlama), sonra delivery'yi iptal edin, sonra SO'yu iptal edin.
2. Postgres'te `Sale` kaydını (bağlı tüm alt kayıtlarla) silin veya `VOID` durumuna alıp
   `eFaturaDurum`'u `IPTAL` yapın — hangisi daha temizse onu seçin, ama bu test kaydının bundan
   sonraki test akışlarında (raporlarda, stok sayımlarında) görünmemesini sağlayın.
3. `FaturaKuyruk`'taki bu satışa ait kaydı silin — bu adım kritik, atlamayın.
4. Bu satışla ilişkili stok hareketlerini (varsa gerçekten düşen bir stok) geri alıp almamanız
   gerektiğini kontrol edin — teslimat zaten `Mevcut Değil`/tamamlanmamış görünüyordu, muhtemelen
   gerçek bir stok düşümü olmamış, ama teyit edin.
5. Kısa bir plan yazıp (hangi sırayla, hangi Odoo aksiyonlarıyla) hemen uygulayabilirsiniz — test
   verisi olduğu için ayrıca onay beklemenize gerek yok, ama uyguladıktan sonra sonucu raporlayın.

## Rapor formatı

Hangi kayıtların silindiği/iptal edildiği (Postgres + Odoo), `FaturaKuyruk` kaydının gerçekten
kalkıp kalkmadığı, ve Odoo'da artık bu satışa ait hiçbir iz kalmadığının teyidi (ekran görüntüsü
gerekmez, kısa liste yeterli).
