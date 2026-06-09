# Güven Optik POS — Devam Notu
Son güncelleme: 08.06.2026

## Son commitler
- 9ef7d6c — Patron Paneli: Rapor Dashboard + Şirket Dashboard
- 63fc8a8 — Reçete PDF'e yazılıyor
- 5b46c48 — Ölçümler adımı yeniden yapılandırıldı
- fa7208d — Ölçüm validasyonu, Cam tipi karttan kaldırıldı, PDF PD eklendi
- c160e09 — Ölçümler draft validasyon düzeltildi
- 0d6ac82 — Reçete ve çerçeve akışı

## Kural: Önce tasarım, sonra kod
Her yeni özellik için önce Claude'dan tasarım alınır, onaylanır, sonra kodlanır.

## Kısa vadeli
- [x] Satış akışında geri dön sorunu — TAMAMLANDI
- [ ] Alım iade ekranı → Garanti & İade ekranı olarak yeniden tasarlanacak
- [ ] Patron Paneli grafikleri (Chart.js npm paketi — React'te script tag çalışmıyor)
- [ ] "Patron Görünümü · Yakında" etiketi kaldır, isim güncelle
- [ ] Debug console.log'ları temizle (saleMeasurements.ts, CustomerStep.tsx, ItemsStep.tsx)
- [ ] Karlılık analizi + drill-down kategori grafiği (tasarım hazır)
- [ ] Ürün maliyet girişi ekranı

### Garanti & İade sistemi (kompleks)
**POS - Garanti kaydı açma:**
- Müşteri ara → satış seç → kalem seç → form
- Form alanları: kayıt türü, sorun açıklaması, lot/seri/barkod/iç referans (satıştan otomatik), satış temsilcisi + şube (satıştan otomatik)
- Firma bilgisi personele gösterilmez — depo/yönetim görür
- Otomatik garanti takip numarası oluşturulur (GTK-2026-XXXX)
- Tüm şubelerdeki tüm kullanıcılar açabilir

**Silsile takibi:**
- Ürün: Tedarikçi → NG (ana depo) → Şube → Müşteri
- Garanti: Müşteri → Şube → NG → Tedarikçi
- Her adımda fatura silsilesi takip edilmeli
- İade başlat → silsile otomatik hesaplanmalı

**Depo - Garanti işlem ekranı:**
- Garanti takip numarasıyla arama
- Sonuç girme: yeni ürün / parça / puan / garanti dışı
- İade faturası oluşturma (silsileye göre)
- Gelen ürün/parçayı müşteriyle ilişkilendirme

**Sonraya bırakıldı — tasarım onayı sonrası kodlanacak**

### Fiyatlandırma adımı düzeltmeleri (kritik)
- [x] Vakıf ödemesinde "Ekle" butonu — TAMAMLANDI
- [x] SGK state korunuyor — TAMAMLANDI
- [x] SGK hesap tablosu aktif — TAMAMLANDI
- [x] Kampanya listesi sadeleştirildi — TAMAMLANDI
- [x] Kasa indirimi satır iskontolarına dağıtım — TAMAMLANDI

## Orta vadeli
- [ ] SGK ekranı
- [ ] Ürün etiket tasarımları ve basımları
- [ ] Ürün kartlarına barkod/UTS/lot tanımlama akışı
- [ ] Doğum tarihi Odoo formunda görünmüyor (view inheritance sorunu)

## Büyük maddeler
- [ ] Ingenico Worldline POS entegrasyonu
- [ ] Uyumsoft entegrasyonu
- [ ] Finans yönetimi & muhasebe modülleri (gider girişi)
- [ ] Bilanço/KDV/komisyon → finans modülü tamamlanınca gerçek veriye bağlanacak

## Teknik notlar
- Backend: localhost:3000 (NestJS/Express, Prisma, PostgreSQL optikpos port 5432)
- Frontend: localhost:5173 (React/Vite)
- Odoo: localhost:8069 (Docker odoo-odoo-1, DB: guvenoptik, port 5433, admin/admin123)
- Patron Paneli: /admin/patron (ADMIN rolü gerekli)
- Chart.js npm paketi kurulu değil — grafikleri düzeltmek için: npm install chart.js react-chartjs-2
