# Güven Optik — Canlıya Geçiş Planı

## ÖN KOŞULLAR (Geçiş öncesi tamamlanmalı)

### Teknik
- [ ] Backend `npm run build` hatasız çalışıyor
- [ ] Tüm migration'lar uygulandı
- [ ] `.env.production` dolduruldu (tüm key'ler)
- [ ] PM2 + Nginx + SSL kurulu ve test edildi
- [ ] Backup script çalışıyor, ilk yedek alındı
- [ ] `/health` endpoint 200 dönüyor
- [ ] PDF dosyaları doğru oluşuyor
- [ ] Chatbot `ANTHROPIC_API_KEY` girildi, test edildi

### Uyumsoft
- [ ] ADESE VKN `.env`'e girildi
- [ ] POTENTIAL VKN `.env`'e girildi
- [ ] SendInvoice Uyumsoft destek hattından çözüldü
- [ ] Test fatura başarıyla gönderildi (en az 1 adet)

### Şube hazırlığı
- [ ] Tüm şubelerin Odoo Location ID girildi
- [ ] GVN6, GVN7, GVN8 PDKS konum ID girildi (Patron destek cevabı)
- [ ] UTS token'ları girildi (token olan şubeler)
- [ ] Şube VKN'leri doğrulandı

### Veri
- [ ] Odoo'da tüm ürünler aktif ve doğru
- [ ] Personel listesi güncel (Fatma Nazlı hariç 22 kişi)
- [ ] Personel şube atamaları doğru

---

## GEÇİŞ GÜNÜ PLANI

### Saat 20:00 — Hazırlık
```bash
# Son commit'i çek
git pull origin main

# Build al
cd backend && npm run build
cd packages/web && npm run build

# Migration kontrol
cd backend && npx prisma migrate status
```

### Saat 21:00 — Geçiş
```bash
# PM2 ile başlat
pm2 start ecosystem.config.js --env production
pm2 save

# Nginx reload
sudo nginx -t && sudo systemctl reload nginx

# Test
curl https://pos.guvenoptik.com/api/health
```

### Saat 21:30 — Doğrulama
- [ ] Admin ile giriş yapılıyor
- [ ] GVN1 kasiyeri ile giriş yapılıyor
- [ ] Satış açılıyor, ürün ekleniyor (ONAYLANMADAN çık)
- [ ] Stok görünüyor
- [ ] PDF test alınıyor
- [ ] Chatbot cevap veriyor
- [ ] UTS yönetimi ekranı açılıyor

### Geri Dönüş Planı
Sorun çıkarsa:
```bash
pm2 stop all
# Eski sürüme git
git checkout <önceki_commit>
npm run build
pm2 start ecosystem.config.js
```

---

## PERSONEL EĞİTİM PLANI

### Öncelik sırası
1. Kasiyerler (satış yapacaklar — 1 günde öğrenir)
2. Şube müdürleri (transfer + raporlar)
3. Muhasebe (e-fatura takibi)
4. IK (puantaj, personel)

### Eğitim içeriği (kasiyerler)
- Sisteme giriş
- Satış açma → ürün ekleme → ödeme → onay
- Satış listesi görme
- PDF fiş alma
- Chatbot kullanımı (sorular için)

### Eğitim içeriği (müdürler)
- Transfer oluşturma + onaylama
- Şube raporları + PDF
- Personel devam takibi
- UTS bildirim kontrolü

---

## AKŞAM TESTİ İÇİN KONTROL LİSTESİ

### Temel akışlar
- [ ] Giriş / Çıkış (farklı rollerle)
- [ ] Satış: aç → ürün ekle → ödeme → onayla → PDF al
- [ ] Transfer: oluştur → GVN2'den GVN1'e → kabul et
- [ ] UTS: bildirim kuyruğunu gör
- [ ] e-Fatura: durum listesini gör
- [ ] Chatbot: "Satış nasıl yapılır?" sor
- [ ] PDF: stok raporu indir
- [ ] Raporlar: tarih filtreli satış raporu

### Kritik kontrol noktaları
- [ ] Satış onaylayınca Odoo stoku düşüyor mu?
- [ ] e-Fatura kuyruğa giriyor mu?
- [ ] Transfer kabul edilince stok geçiyor mu?
- [ ] PDF imza alanları çıkıyor mu?

---

## AÇIK KALAN MADDELER (Canlıya geçiş sonrası)

- Uyumsoft SendInvoice — destek hattından format bekliyor
- GVN6/7/8 PDKS — Patron destek cevabı bekliyor
- Ingenico POS terminal entegrasyonu
- WhatsApp bildirim (wa.me ile manuel, API başvurusu sonra)
- ÖKC entegrasyonu (canlıda test edilecek)
