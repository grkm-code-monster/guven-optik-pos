# Sistem Envanteri — Güven Optik POS

> **Oluşturulma:** 2026-07-09  
> **Kaynak:** Kod tabanı salt okunur taraması (`backend/src/modules/`, `packages/web/`, cron/sync dosyaları). Tahmin yok — yalnızca repoda gerçekten var olan yapılar.

---

## 1. MODÜLLER

Backend modülleri `backend/src/modules/` altında. Route mount noktaları `backend/src/app.ts`.

### admin (+ `stok-yonetimi.service.ts`)

- **Ne işe yarıyor:** Monolitik yönetim API'si — şube/kullanıcı/kampanya, Odoo stok & transfer, muhasebe/finans, IK/personel/PDKS, prim, özel sipariş (depo tarafı), stok yönetimi, UTS, şirket ayarları, personel belgeleri.
- **Ana endpoint'ler:** ~**100** route (`admin.controller.ts`). Gruplar:
  - **Genel / public:** personel belge formu & yükleme (2)
  - **Kampanya & görevli:** kampanya CRUD, şube kampanyaları, günlük görevli (8+)
  - **Banka & POS komisyon:** bankalar, POS cihazları, oranlar (5)
  - **Kullanıcı & sync:** users CRUD, Odoo user sync, sync log/retry/override (10)
  - **Şube:** branch list/CRUD, PDKS places, yedek sorumlu (6)
  - **Stok & depo:** `/stock`, lokasyon stok, lot ara, irsaliye, ürün girişi, transfer oluştur, stok kontrol, stok ürünleri/fiyat (15+)
  - **Ürün & cari:** urun-ara/olustur, cari, kategori, nitelik, tracking (10+)
  - **Muhasebe & finans:** dashboard, faturalar, cari, finansal varlık, ortaklar (12+)
  - **IK & PDKS:** personel CRUD, PDKS sync/import, POS/Odoo bağlama, belgeler (25+)
  - **Prim:** kurallar, hesaplama (2)
  - **Özel sipariş (admin):** listele, ekle, durum, stoka al, teslim (8)
  - **Stok yönetimi:** stok-kontrol, stok-urunleri, fiyat, lotlar, varyant-lot-bilgisi (6)
  - **UTS:** sube, dis-firma, kuyruk, bildirim oluştur/gönder (14)
  - **Şirket ayarları:** sirket-ayar GET/POST (2)
- **Frontend:** `TanimlamalarPage`, `DepoPage`, `StokYonetimiPage`, `IKPage`, `FinansPage`, `MuhasebePage`, `PatronPage` (kısmen), `UtsYonetimiPage`, `KampanyalarPage`, `UrunYapilandirmaPage`, `BelgeYuklePage`

### auth

- **Ne işe yarıyor:** PIN ile giriş, müdür PIN doğrulama, login sırasında PDKS devam kontrolü, PDKS'siz devam kaydı.
- **Endpoint'ler (4):** `POST /login`, `POST /verify-manager-pin`, `POST /logout`, `POST /pdks-continue`
- **Frontend:** `LoginPage`, `AdminLoginPage`, satış akışında müdür onayı

### bildirim

- **Ne işe yarıyor:** Uygulama içi bildirim kutusu (PostgreSQL `Bildirim` tablosu).
- **Endpoint'ler (4):** `GET /`, `GET /sayac`, `PATCH /:id/okundu`, `PATCH /okundu-tumu`
- **Frontend:** `DashboardPage` (bildirim zili), tüm admin/POS kullanıcıları

### cashMovements

- **Ne işe yarıyor:** Kasa hareketleri (nakit giriş/çıkış, avans, transfer).
- **Endpoint'ler (2):** `POST /` (oluştur), `GET /` (listele)
- **Frontend:** `DashboardPage` → Görevler / kasa hareketi modalı

### chatbot

- **Ne işe yarıyor:** Anthropic API ile POS yardım chatbot'u; sistem prompt'u iş akışlarını anlatır.
- **Endpoint'ler (2):** `GET /durum`, `POST /mesaj` (authenticate gerekli)
- **Frontend:** (chatbot UI varsa dashboard/settings — API `/api/chatbot`)

### customers

- **Ne işe yarıyor:** Müşteri CRUD, reçete, legacy Siber müşteri arama/promote, Odoo partner eşleme.
- **Endpoint'ler (10):** list, create, resolve-odoo, legacy-search/detail/promote, get/put, prescriptions CRUD
- **Frontend:** `NewSalePage`, `MusterilerPage`, `CustomerStep`

### efatura (+ gelen-fatura)

- **Ne işe yarıyor:** Uyumsoft e-Fatura gönderimi, satış onayında fatura kuyruğu, gelen e-fatura (Uyumsoft) listeleme/aktarım, UTS alma bildirimi oluşturma.
- **efatura.controller (6):** mukellef-sorgula, gonder, satis-onay, liste, kuyruk-isle
- **gelen-fatura.controller (6):** listele, cek, sutun-eslestirme, urun-girisine-aktar, onayla-aktarim, uts-alma
- **Frontend:** `MuhasebePage`, `DepoPage` (gelen fatura), satış onayı (arka plan)

### etiket

- **Ne işe yarıyor:** Etiket şablon CRUD (DB), ZPL üretimi.
- **Endpoint'ler (5):** sablonlar, sablon CRUD, zpl
- **Frontend:** `EtiketTasarimciPage`, `StokYonetimiPage`, `DepoPage`, transfer kabul etiket modalı

### expenses

- **Ne işe yarıyor:** Masraf kaydı — Odoo `hr.expense` entegrasyonu.
- **Endpoint'ler (4):** categories, employees, suppliers, POST masraf
- **Frontend:** `MasraflarPage`

### mail *(servis only, controller yok)*

- **Ne işe yarıyor:** Gmail SMTP ile rapor e-postası gönderimi (`nodemailer`).
- **Kullanan:** `report.cron.ts`, `report-template.service.ts`, `gunluk-not.service.ts`

### odoo

- **Ne işe yarıyor:** Odoo JSON-RPC `execute` sarmalayıcı; ürün/barkod arama, vergi listesi; satış onayı ve birçok modülün Odoo çağrı kaynağı.
- **Endpoint'ler (3):** products, products/barcode, taxes
- **Frontend:** Dolaylı — tüm Odoo bağımlı ekranlar

### odooConnector *(legacy/mock sync)*

- **Ne işe yarıyor:** `syncSale()` — **mock** Odoo senkronu (`MOCK-123`, `MOCK-SO-456`). `runSyncEngine` tarafından kullanılır.
- **Endpoint yok** — `utils/syncEngine.ts` üzerinden çağrılır.
- **Not:** Gerçek Odoo sync `sale.service.ts` → `confirmSale` içinde `odoo/odoo.service.execute` ile yapılır; iki paralel yol var.

### openaccount

- **Ne işe yarıyor:** Açık hesap bakiye listesi, müşteri detayı, ödeme kaydı + Odoo fatura/ödeme mutabakatı.
- **Endpoint'ler (3):** `GET /`, `GET /customer/:id`, `POST /payment`
- **Frontend:** `AcikHesapPage`, `DashboardPage` (vadesi geçen görevler)

### ozel-siparis

- **Ne işe yarıyor:** POS/şube özel sipariş takibi, karekod teslim alma, durum bildirimleri, müşteri teslim + wa.me link.
- **Endpoint'ler (5):** sube listesi, karekodlar GET/POST, loglar, musteri-teslim
- **Frontend:** `DepoPage` → Siparişler sekmesi, `TeslimatPage` (dolaylı)

### payments *(servis only)*

- **Ne işe yarıyor:** `commission.service.ts` — kart komisyon hesaplama.
- **Kullanan:** `sale.service.ts` (satış onayı)

### pdks

- **Ne işe yarıyor:** Patron PDKS API v4 — personel, girişler, konumlar, puantaj; login devam kontrolü.
- **Endpoint'ler (5):** personeller, girisler, konumlar, user girişler, puantaj
- **Frontend:** `IKPage`, `LoginPage` (PDKS uyarısı), `TanimlamalarPage` (mekan ID)

### products

- **Ne işe yarıyor:** POS ürün kataloğu (Prisma), barkod arama, favoriler.
- **Endpoint'ler (4):** list, favorites, by-barcode, create (ADMIN)
- **Frontend:** `NewSalePage` → ItemsStep

### reports (+ gunluk-not, report-engine, report-export, report-template)

- **Ne işe yarıyor:** Günlük/aylık satış raporları, patron özeti, rapor matrisi (whitelist SQL), şablon/zamanlama, e-posta export, günlük durum notu.
- **Endpoint'ler (~25):** query/export, templates, schedules, requests, daily/range/personel-aylik, patron/*, gunluk-not GET/PUT/gonder
- **Frontend:** `ReportsPage`, `RaporlarimPage`, `RaporMatrisPage`, `PatronPage`, `DashboardPage` (Günlük Kasa)

### sales

- **Ne işe yarıyor:** Satış yaşam döngüsü — oluştur, kalem, onay (Odoo + e-Fatura), void, teslimat listesi, fatura PDF.
- **Endpoint'ler (11):** CRUD items, confirm, void, delivery, list, detail, fatura-pdf
- **Frontend:** `NewSalePage`, `SaleDetailPage`, `SatislarPage`, `TeslimatPage`

### shifts

- **Ne işe yarıyor:** Vardiya aç/kapa, mevcut vardiya sorgusu.
- **Endpoint'ler (3):** open, close, current
- **Frontend:** `ShiftOpenPage`, `DashboardPage`

### transfer

- **Ne işe yarıyor:** Şubeler arası Odoo transfer — ürün ara (barkod/UTS/lot/ref/ad), oluştur, bekleyen/gönderilen, kabul (sayım), sorun bildir.
- **Endpoint'ler (7):** urun-ara, urun-ara-akilli, olustur, bekleyen, gonderilen, kabul, sorun, debug/lokasyonlar
- **Frontend:** `TransferlerPage`, `DepoPage` → Transferler sekmesi, `BekleyenTransferler`, `YeniTransfer`

### uyumsoft

- **Ne işe yarıyor:** Uyumsoft SOAP test/diagnostic endpoint'leri.
- **Endpoint'ler (5):** test, tarih, efatura-kullanici, alias, whoami
- **Frontend:** Geliştirici/diagnostic (doğrudan UI yok)

### warranty

- **Ne işe yarıyor:** Garanti/iade talepleri — durum makinesi, tedarikçi özeti, transfer, mesajlar.
- **Endpoint'ler (~10):** claims CRUD/status/approve/transfer/messages, stats
- **Frontend:** `GarantiPage`, `GarantiYonetimPage`

---

## 2. OTOMASYONLAR

### Zamanlanmış / arka plan işleri

| İş | Dosya | Sıklık | Tetiklenme | Ne yapar |
|----|-------|--------|------------|----------|
| **Sync Engine** | `utils/syncEngine.ts` + `server.ts` | **60 sn** (`setInterval`) | Sunucu başlangıcı | Son 24 saatte `syncStatus` = PENDING/ERROR olan max 5 satışı bulur; `odooConnector.syncSale()` çağırır (**mock sync** — gerçek Odoo değil). |
| **e-Fatura kuyruk** | `efatura.cron.ts` | **15 dk** | Sunucu başlangıcı | `processFaturaKuyruk()` — `FaturaKuyruk` BEKLIYOR kayıtlarını (max 10, deneme<5) Uyumsoft'a gönderir. |
| **Özel sipariş laboratuvar** | `ozel-siparis.cron.ts` | **5 dk** | Sunucu başlangıcı | `processLaboratuvarCron()` — `TESLIM_ALINDI` durumunda 15+ dk geçmiş siparişleri otomatik `LABORATUVARDA` yapar + bildirim. |
| **Rapor zamanlayıcı** | `report.cron.ts` | **Her dakika** (`node-cron * * * * *`) | Sunucu başlangıcı | Aktif `ReportSchedule` kayıtlarında saat eşleşmesi + GUNLUK/HAFTALIK/AYLIK kontrolü; rapor üretir, PDF/XLSX e-postalar. |

**Manuel tetiklenebilir otomasyonlar (cron dışı):**
- `POST /api/efatura/kuyruk-isle` — e-fatura kuyruğunu elle işler
- `POST /api/admin/sync-retry/:saleId` — syncStatus PENDING'e çeker
- `POST /api/admin/sync-override/:saleId` — syncStatus SYNCED işaretler (manuel override)

### Otomatik e-posta gönderimleri

| Kaynak | Alıcı | Ne zaman |
|--------|-------|----------|
| `report.cron.ts` | `ReportSchedule` → şablon erişimlerindeki user/role e-postaları | Zamanlanmış saat + sıklık |
| `report-template.service.ts` → `sendTemplateReportEmail` | Talep eden kullanıcının e-postası | Manuel "e-posta gönder" |
| `gunluk-not.service.ts` → `sendGunlukDurumNotuEmail` | Formda girilen alıcılar | Manuel "gönder" (PDF ek) |

**Gmail SMTP:** `GMAIL_USER` + `GMAIL_APP_PASSWORD` env; yoksa `{ success: false }`.

### Otomatik bildirimler (`createBildirim` / `createBildirimler`)

| Olay | Alıcı | Tip | Kaynak |
|------|-------|-----|--------|
| Özel sipariş durum değişimi | `findSiparisBildirimAlicilari()` — ilgili şube yöneticileri/depo | SIPARIS | `ozel-siparis.service.ts` |
| TESLIM_ALINDI → LABORATUVARDA (cron) | Aynı | SIPARIS | cron + service |
| Satış VOID + Odoo'da fatura var | ADMIN + ACCOUNTANT aktif kullanıcılar | GENEL | `sale.service.ts` → `voidSale` |
| Yeni rapor talebi | Tüm aktif ADMIN | GENEL | `report-template.service.ts` |

**Not:** UTS, transfer, e-fatura için chatbot prompt'unda "otomatik" yazsa da kodda transfer/UTS otomatik bildirim **yok** — UTS manuel kuyruk (`UtsYonetimiPage`).

### Otomatik Odoo senkronizasyonları

**Satış onayı (`confirmSale`):**
1. Odoo `res.partner` oluştur/güncelle
2. `sale.order` create + `action_confirm`
3. `stock.picking` validate (teslimat)
4. Fatura oluştur (`sale.advance.payment.inv` → `account.move` post)
5. Ödemeler → `account.payment` + mutabakat
6. PostgreSQL: `odooSaleOrderId`, `odooSynced`
7. Arka planda: `tetikleSatisEFatura(saleId)` (Uyumsoft kuyruk)

**Açık hesap ödeme (`openaccount.controller`):** Odoo fatura arama + payment + reconcile

**Transfer kabul:** `stock.move.line` quantity güncelle, picking validate, lot `x_uts_durumu: MAGAZADA`

**Özel sipariş müşteri teslim:** İlişkili `stock.picking` validate (opsiyonel)

**Gelen fatura → ürün girişi:** Odoo picking/stock hareketleri (`gelen-fatura.service`, `admin.controller` urun-giris)

**Sync Engine (ayrı yol):** Mock — gerçek Odoo sync değil; `syncStatus` alanını etkiler.

---

## 3. ENTEGRASYONLAR

| Sistem | Durum | İşlev | Tetikleme |
|--------|-------|-------|-----------|
| **Odoo** | **Aktif (kısmi)** | Stok, satış siparişi, fatura, ödeme, transfer, HR expense, ürün/partner CRUD | Satış onayı, transfer, depo işlemleri, masraf — çoğunlukla **otomatik**; admin ekranlarından **manuel** |
| **Uyumsoft** | **Aktif (kısmi)** | e-Fatura/e-Arşiv gönderimi, gelen fatura çekme, mükellef sorgulama | Satış onayı → kuyruk **otomatik**; cron 15dk; gelen fatura **manuel** çek/onayla |
| **UTS** | **Aktif (kısmi)** | Bildirim gönderme (6 tip alma/verme/…); token test (`firmaSorgula`) | **Manuel** — UTS Yönetimi kuyruğu; gelen faturadan alma bildirimi oluşturma **manuel** |
| **İYS** | **Pasif (sadece ayar)** | `SirketAyar` tablosunda iys_* anahtarları saklanır | **Manuel** UI (TanimlamalarPage modal); backend'de İYS API çağrısı **yok** |
| **Patron PDKS** | **Aktif (kısmi)** | Personel listesi, giriş/attendance, puantaj, login kontrolü | Login **otomatik** kontrol; IK'da sync **manuel** (`/admin/pdks-sync`); GVN6/7/8 için UI'da 403 notu |
| **Gmail/SMTP** | **Aktif (koşullu)** | Rapor ve günlük not e-postası | Zamanlanmış **otomatik** (report cron) veya **manuel** gönder |
| **WhatsApp** | **Pasif** | wa.me link üretimi (özel sipariş teslim, IK belge); API entegrasyonu yok | **Manuel** — kullanıcı linke tıklar |
| **Worldline** | **Pasif** | UI placeholder (TanimlamalarPage); DEVAM_NOTU'da "bekliyor" | Yok |

---

## 4. BİLİNEN EKSİKLER / YARIM KALAN İŞLER

### Kod / DEVAM_NOTU / oturum bulguları

| Konu | Durum |
|------|-------|
| **Sayım (Depo → Sayım sekmesi)** | UI var; `POST /admin/stock-adjustment` **backend'de yok**; `.catch(() => {})` ile sessiz hata; başarı mesajı yanıltıcı |
| **UTS Envanter sekmesi** | Yok; UTS'de envanter sorgulama endpoint'i kodda yok; `uretici/sorgula` canlıda 404 |
| **UTS test token'ları** | `NOT_A_VALID_TOKEN_ERROR` (test ortamı) |
| **Açık hesap kısmi ödeme eşleştirme (Not #16)** | DEVAM_NOTU: birden fazla satış + kısmi ödeme hangi satışa düşer — **netleştirilmedi** |
| **Onaylı satış düzeltme** | Resmi iade/credit note — VOID sonrası manuel Odoo/Uyumsoft süreci; otomasyon yok |
| **İYS API entegrasyonu** | Sadece ayar kaydı |
| **WhatsApp Business API** | wa.me link only |
| **Worldline POS** | Entegrasyon yok |
| **Alım & İade sekmesi (Depo)** | `/admin/depo-islem` — hata durumunda yine success gösterir |
| **Chatbot stok sayımı anlatımı** | Prompt'taki "Stok → Sayım → Yeni Sayım" akışı mevcut UI ile uyuşmuyor |
| **Sync Engine mock** | `odooConnector.syncSale` mock; gerçek sync `confirmSale` içinde — iki yol, `syncStatus` çoğu satışta PENDING kalabilir |
| **Günlük Kasa UI** | `cashOut` (CashMovement) kartta gösterilmiyor — sadece export/özet |
| **Ürün kartlarına barkod/UTS/lot tanımlama** | DEVAM_NOTU açık |
| **Açık hesap vade tarihi** | DEVAM_NOTU açık |
| **Legacy Siber** | Sayim, UtsAlmaBildirim vb. — migrate edilmedi |

### Prisma'da olmayan legacy tablolar (Siber SQL Server)

`Sayim`, `SayimDt`, `UtsAlmaBildirim`, `UtsStok` — `.tmp-siber-explore-output.txt` kayıtları; aktif uygulamaya bağlı değil.

---

## 5. GÜVENLİK KONTROLLERİ

### Whitelist tabanlı rapor sorgu motoru

**Dosya:** `reports/report-engine.service.ts`

- `DIMENSIONS` ve `MEASURES` sabit sözlükleri — kullanıcı girdisi yalnızca bu anahtarlarla eşleşir (`assertWhitelistKeys`)
- Max 3 boyut, max 5 ölçü
- SQL `Prisma.sql` tagged template ile parametreli; boyut/ölçü ifadeleri sabit sözlükten
- Filtreler: tarih, subeId — parametre olarak bağlanır
- Sadece `SaleStatus.PAID` satışlar

### VOID işleminde Odoo güvenlik kontrolü

**Dosya:** `sales/sale.service.ts` → `voidSale`

- Rol: STORE_MANAGER veya ADMIN
- Odoo `sale.order` okunur → `invoice_ids` var mı kontrol
- **Fatura yoksa:** `action_cancel` dener
- **Fatura varsa:** Odoo iptal **yapılmaz**; `odooCancelError` kaydedilir; ADMIN/ACCOUNTANT'a bildirim
- PostgreSQL: `odooCancelled`, `odooCancelError` alanları

### SQL injection korumaları

- Rapor motoru: whitelist + Prisma parameterized SQL
- Genel CRUD: Prisma ORM (parametreli)
- Ham SQL kullanımı rapor modülüyle sınırlı ve sabit fragment'ler

### Diğer güvenlik

- `helmet`, `cors`, JWT `authenticate`, `authorize(Role.*)` middleware
- Login brute-force: 5 dk kilit (`auth.service.ts`)
- PDKS API hatası login'i **bloklamaz** (`hasTodayAttendance` → `null` = devam)

### "Sessiz başarısız" riski taşıyan `.catch(() => {})` desenleri

*(`.tmp-*.mjs` test scriptleri hariç — yalnızca uygulama kodu)*

| Dosya | Bağlam | Risk |
|-------|--------|------|
| `DepoPage.tsx` (Sayım) | `stock-adjustment` POST | **Yüksek** — kayıt başarılı sanılır |
| `DepoPage.tsx` (Alım) | catch → success | **Yüksek** |
| `sale.service.ts` | Odoo fatura create, payment post, sync error update | **Orta** — Odoo kısmi sync |
| `admin.controller.ts` (UTS) | token test fail update | Düşük |
| `openaccount.controller.ts` | payment action_post | Orta |
| `odooConnector/odoo.service.ts` | sync error DB update | Düşük |
| `PricingStep.tsx` | kampanya log | Düşük |
| `ItemsStep.tsx`, `SaleDetailPage.tsx`, `AcikHesapPage.tsx` | yardımcı fetch | Düşük |
| `StokYonetimiPage.tsx`, `StokKontrolTab.tsx`, `UrunYapilandirmaPage.tsx` | kategori yükleme | Düşük |
| `GarantiYonetimPage.tsx` | yardımcı fetch | Düşük |

---

## Ek: Frontend sayfa haritası (özet)

| Route | Sayfa | Ana backend modülleri |
|-------|-------|----------------------|
| `/` | DashboardPage | reports, sales, cashMovements, bildirim, openaccount, warranty |
| `/sales/new` | NewSalePage | sales, customers, products |
| `/admin/depo` | DepoPage | admin, transfer, ozel-siparis, efatura/gelen |
| `/admin/uts` | UtsYonetimiPage | admin/uts |
| `/admin/stok-yonetimi` | StokYonetimiPage | admin/stok-yonetimi, etiket |
| `/admin/tanimlamalar` | TanimlamalarPage | admin (branch, sirket-ayar) |
| `/admin/rapor-matris` | RaporMatrisPage | reports |
| `/admin/patron` | PatronPage | reports/patron |
| `/transferler` | TransferlerPage | transfer |
| `/acik-hesap` | AcikHesapPage | openaccount |

---

*Bu belge kod tabanının anlık fotoğrafıdır; yeni modül/endpoint eklendiğinde güncellenmelidir.*
