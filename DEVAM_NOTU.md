# Güven Optik POS — Devam Notu
Son güncelleme: 06.06.2026

## Son commitler (güncellendi)
- [bugün] — Prim hesaplama Odoo→Prisma geçişi, Branch eşleştirme düzeltildi
- [bugün] — Bölge müdürü ekranı: 6 sekme, patron API REGIONAL_MANAGER yetkisi, subeBreakdown UUID düzeltmesi
- e4c8ac0 — Patron Paneli grafikleri react-chartjs-2 ile düzeltildi
- 4df65b7 — Dashboard refactor: rol bazlı ekranlar, salesDetail, deliveryDate migration, kasa yetkilendirme
- d0464a8 — SaleItem.deliveryDate: PATCH status endpoint'ine persist eklendi
- aa351bd — Görevler sekmesi gerçek API: delivery, warranty, open-account
- d174a8c — Garanti yönetim: şube adı, iade akışı, PDF formları
- c2c1404 — Garanti & İade sistemi: DB modeli, API, POS akışı, depo ekranı
- acea288 — Satış akışı: ödeme state korunuyor, durum ekranı
- eb12b1b — Satış akışı geri dön fix: müşteri korunuyor, VOID filtresi
- 91f65c4 — Fiyatlandırma: SGK state, Vakıf ekle, kampanya sadeleşti
- 68d0031 — Kasa indirimi satır dağıtımı
- 9ef7d6c — Patron Paneli: Rapor Dashboard + Şirket Dashboard

## Kural: Önce tasarım, sonra kod
Her yeni özellik için önce Claude'dan tasarım alınır, onaylanır, sonra kodlanır.

## Kısa vadeli — tamamlananlar
- [x] Satış akışında geri dön sorunu — TAMAMLANDI
- [x] Fiyatlandırma düzeltmeleri — TAMAMLANDI
- [x] Garanti & İade sistemi — TAMAMLANDI (temel)
- [x] Görevler sekmesi gerçek veriye bağlandı — TAMAMLANDI
- [x] Teslim tarihi şemaya eklendi ve akışa bağlandı (deliveryDate)
- [x] Dashboard rol bazlı tamamlandı (SALES_STAFF / STORE_MANAGER)
- [x] GET /reports/personal endpoint eklendi
- [x] CashMovement POST yetkisi düzeltildi
- [x] Günlük kasa tablosu tüm kolonlarla çalışıyor
- [x] Patron Paneli grafikleri (Chart.js npm kuruldu, 4 grafik çalışıyor)
- [x] Bölge müdürü ekranı (REGIONAL_MANAGER — placeholder'dan çıktı)
- [x] subeBreakdown UUID bug düzeltildi
- [x] Excel dışa aktar REGIONAL_MANAGER yetkisi
- [x] Prim hesaplama Prisma'ya geçirildi (Odoo bağımlılığı kaldırıldı)
- [x] Branch kod↔UUID eşleştirme düzeltildi

## Kısa vadeli — açık
- [ ] Bölge müdürü kasa tablosu (şu an placeholder)
- [ ] Personel aylık hedef (Personel tablosundan)
- [ ] Personel↔User eşleştirmesi (bireysel prim için — sonraki sprint)
- [ ] Personel.subeId → Branch.code standartlaştırma
- [ ] SGK belgeleri upload (IK modülü)
- [ ] Görevli/vekalet atama (yönetim paneli)
- [ ] PDF çıktısı jsPDF ile
- [ ] Açık hesap vade tarihi
- [ ] Debug console.log temizliği
- [ ] PersonelDashboard: laboratuvara gönderilmedi gerçek veri (warranty userId filtresi eklenince)
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
- Chart.js: chart.js + react-chartjs-2 kurulu (PatronPage.tsx)
