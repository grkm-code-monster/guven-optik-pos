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
- [ ] Satış akışında geri dön sorunu — adımlar arası geri gidince sistem bozuluyor, düzeltme/düzenleme yapılamıyor (kritik bug)
- [ ] Alım iade ekranı → Garanti & İade ekranı olarak yeniden tasarlanacak
- [ ] Patron Paneli grafikleri (Chart.js npm paketi — React'te script tag çalışmıyor)
- [ ] "Patron Görünümü · Yakında" etiketi kaldır, isim güncelle
- [ ] Debug console.log'ları temizle (saleMeasurements.ts, CustomerStep.tsx, ItemsStep.tsx)
- [ ] Karlılık analizi + drill-down kategori grafiği (tasarım hazır)
- [ ] Ürün maliyet girişi ekranı

### Fiyatlandırma adımı düzeltmeleri (kritik)
- [ ] Vakıf ödemesinde "Ekle" butonu yok — tutarı girip onaylamak için buton eklenmeli
- [ ] SGK'dan Vakıf'a geçince SGK checkbox'ı sıfırlanıyor — state korunmalı (display:none)
- [ ] SGK hesap tablosu aktif mi kontrol edilecek
- [ ] Kampanya listesi: yönetim panelinde tanımlanan kampanyalar burada seçilebilmeli
- [ ] Kasa indirimi: satışçı tutar girer → sistem yüzdeye çevirir → Odoo'ya satır iskontosu olarak dağıtır

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
