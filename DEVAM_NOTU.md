# Güven Optik POS — Devam Notu
Son güncelleme: 06.06.2026

## Son commitler (güncellendi)
- 06.06.2026 — Görevler sekmesi gerçek API'ye bağlandı: labBekleyen, teslimHazir, acikGaranti, vadesiGecenAcikHesap
- d174a8c — Garanti yönetim: şube adı, iade akışı, PDF formları
- c2c1404 — Garanti & İade sistemi: DB modeli, API, POS akışı, depo ekranı
- acea288 — Satış akışı: ödeme state korunuyor, durum ekranı
- eb12b1b — Satış akışı geri dön fix: müşteri korunuyor, VOID filtresi
- 91f65c4 — Fiyatlandırma: SGK state, Vakıf ekle, kampanya sadeleşti
- 68d0031 — Kasa indirimi satır dağıtımı
- 9ef7d6c — Patron Paneli: Rapor Dashboard + Şirket Dashboard
- 63fc8a8 — Reçete PDF'e yazılıyor
- 5b46c48 — Ölçümler adımı yeniden yapılandırıldı

## Kural: Önce tasarım, sonra kod
Her yeni özellik için önce Claude'dan tasarım alınır, onaylanır, sonra kodlanır.

## Kısa vadeli (güncellendi)
- [x] Satış akışında geri dön sorunu — TAMAMLANDI
- [x] Fiyatlandırma düzeltmeleri — TAMAMLANDI
- [x] Garanti & İade sistemi — TAMAMLANDI (temel)
- [x] Görevler sekmesi gerçek veriye bağlandı — TAMAMLANDI
- [ ] PersonelDashboard: laboratuvara gönderilmedi gerçek veri (warranty userId filtresi eklenince açılacak)
- [ ] Açık hesap vade tarihi (şu an remainingDebt > 0 = vadesi geçmiş sayılıyor)
- [ ] Patron Paneli grafikleri (Chart.js npm)
- [ ] Debug console.log temizle
- [ ] Karlılık analizi + drill-down
- [ ] "Patron Görünümü · Yakında" etiketi kaldır, isim güncelle
- [ ] Ürün maliyet girişi ekranı

## Garanti & İade — sonraki adımlar
- [ ] Şube adları satış sırasında branchId yerine name olarak kaydedilmeli
- [ ] Tedarikçi bilgisi lot/seri'den otomatik çekilmeli (Odoo entegrasyonu)
- [ ] Ürün girişi → garanti no otomatik not düşülmeli
- [ ] Odoo iade faturası otomasyonu (büyük iş)

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
