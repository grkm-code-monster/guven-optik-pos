# AKŞAM TEST PLANI — Güven Optik POS

Tarih: 18 Haziran 2026
Tahmini süre: 2-3 saat

---

## HAZIRLIK (15 dk)

```bash
# Backend çalışıyor mu?
curl http://localhost:3000/health

# Frontend çalışıyor mu?
# Browser: http://localhost:5173

# Odoo bağlantısı?
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/odoo/ping
```

---

## TEST 1 — GİRİŞ & YETKİLER (10 dk)

| Kullanıcı | Rol | Beklenti |
|-----------|-----|---------|
| Admin hesabı | ADMIN | Tüm menüler görünür |
| GVN1 kasiyeri | CASHIER | Sadece satış, stok görünür |
| GVN2 müdürü | BRANCH_MANAGER | Şube raporları + transfer |

Chatbot testi:
- Kasiyer ile: "Puantaj raporunu nasıl görürüm?" → "Yöneticinizle görüşün" demeli
- Admin ile: Aynı soru → tam cevap vermeli

---

## TEST 2 — SATIŞ AKIŞI (20 dk)

**Senaryo:** GVN1'den 2 adet çerçeve satışı

1. GVN1 kasiyeri ile giriş yap
2. Satış → Yeni Satış
3. Müşteri: "Test Müşteri" (bireysel, VKN boş)
4. Ürün ekle: herhangi çerçeve × 2
5. İskonto: %10
6. Ödeme: Nakit
7. Satışı Onayla

**Kontrol et:**
- [ ] Odoo'da stok düştü mü? (Odoo :8069 → Stok)
- [ ] e-Fatura kuyruğa girdi mi? → Raporlar → e-Fatura
- [ ] UTS bildirimi oluştu mu? → UTS Yönetimi → Kuyruk
- [ ] Satış PDF alınıyor mu?

---

## TEST 3 — TRANSFER AKIŞI (20 dk)

**Senaryo:** ANADEPO → GVN1 transfer

1. ANADEPO kullanıcısı ile giriş
2. Transfer → Yeni Transfer
3. Hedef: GVN1
4. Ürün: 5 adet cam
5. Transfer Oluştur

6. GVN1 kullanıcısına geç
7. Transfer → Gelen Transferler
8. Transferi bul → Kabul Et

**Kontrol et:**
- [ ] ANADEPO stoku düştü
- [ ] GVN1 stoku arttı
- [ ] İrsaliye PDF alınıyor
- [ ] UTS bildirimi oluştu

---

## TEST 4 — UTS YÖNETİMİ (10 dk)

1. UTS Yönetimi → Bildirim Kuyruğu
2. Bekleyen bildirimler var mı?
3. Şube token girilmişse → Toplu Gönder dene
4. UTS Dış Firma Rehberi → firmalar listeleniyor mu?

---

## TEST 5 — e-FATURA (10 dk)

1. Raporlar → e-Fatura
2. Az önce yapılan satışın faturası görünüyor mu?
3. Durum: BEKLIYOR veya GONDERILDI mi?
4. Hatalıysa → Yeniden Gönder

---

## TEST 6 — CHATBOT (10 dk)

Sağ altta "?" butonuna tıkla.

Sorular:
1. "Satış nasıl yapılır?" → adım adım anlat
2. "Transfer reddetmek istiyorum, ne yapmalıyım?"
3. "UTS token nereden alınır?"
4. Kasiyer rolüyle: "Tüm şubelerin stok raporunu görmek istiyorum" → kısıtlama mesajı

Kalan mesaj hakkı görünüyor mu?

---

## TEST 7 — PDF ÇIKTILARI (15 dk)

| Ekran | İşlem |
|-------|-------|
| Satış detay | Fiş PDF indir |
| Transfer detay | İrsaliye PDF indir |
| Stok ekranı | Stok raporu PDF |
| Raporlar | Satış listesi PDF |

PDF'lerde kontrol:
- [ ] Logo/firma adı görünüyor
- [ ] Tarih doğru
- [ ] Şube adı doğru
- [ ] Tablo verileri doğru
- [ ] İmza alanları var

---

## TEST 8 — RAPORLAR (10 dk)

1. Raporlar → Satış Raporu
2. Bugünün tarihini filtrele
3. Az önce yapılan satış görünüyor mu?
4. PDF indir → veriler doğru mu?

---

## TEST 9 — PDKS / PATRON PANELİ (5 dk)

1. Patron Paneli linkine tıkla (app.patronpdks.com)
2. Personeller listeli mi?
3. GVN1-5-9 için mekan ID var mı?

---

## SORUN ÇIKTIĞINDA

**Backend hatası:**
```bash
pm2 logs guven-backend --lines 50
# veya
cd backend && npm run dev  # geliştirme modunda
```

**Veritabanı sorunu:**
```bash
cd backend && npx prisma studio  # görsel inceleme
```

**Odoo bağlantısı:**
```bash
curl -X POST http://localhost:8069/web/session/authenticate \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"call","params":{"db":"odoo","login":"admin","password":"admin"}}'
```

---

## TEST SONUÇLARINI NOT ET

| Test | Sonuç | Notlar |
|------|-------|--------|
| Giriş/Yetki | | |
| Satış akışı | | |
| Transfer akışı | | |
| UTS | | |
| e-Fatura | | |
| Chatbot | | |
| PDF | | |
| Raporlar | | |
| PDKS | | |

Sorunları buraya yaz → yarın sabah çözeriz.
