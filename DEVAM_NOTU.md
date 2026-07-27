# Güven Optik POS — Devam Notu
Son güncelleme: 13.07.2026

## Kural: Önce tasarım, sonra kod
Her yeni özellik için önce Claude'dan tasarım alınır, onaylanır, sonra kodlanır.

---

## Bu oturumda / son günlerde tamamlanan büyük işler (07–13.07.2026)

### Transfer & muhasebe güvenliği
- [x] **Şirketler arası transfer güvenliği** — `executeSirketlerArasiTransfer()`: satış/alım faturası, kaynak çıkış + hedef giriş picking, adım adım log, hata durumunda rollback
- [x] **e-İrsaliye Uyumsoft entegrasyonu** — `trySendEirsaliyeForTransfer()` + `sendDespatch()` teknik olarak hazır (`E_IRSALIYE_TRANSFER_ENABLED=true` ile); NG hesabında Uyumsoft yetkisi eksik → gönderim başarısız (destek: EFT-IST-SRVS12)
- [x] **ADESE/POTENTIAL kendi depo erişim hatası** — süregelen bug düzeltildi (şirket bazlı Odoo credential/context)
- [x] **Sayım ekranı gerçek Odoo yazımı** — `stock-adjustment` (`applyStockAdjustment`, inventory_mode) ile quant gerçekten yazılıyor
- [x] **Özel Sipariş şirketler arası düzeltmesi** — özel sipariş stok girişi `executeSirketlerArasiTransfer` kullanıyor
- [x] **Garanti/İade transferi** — gerçek Odoo `transfer-olustur` bağlantısı

### Satış & mali güvenlik
- [x] **confirmSale race koşulu koruması** — kritik mali güvenlik (çift onay / yarış durumu koruması)
- [x] **Taslak satış veri kaybı düzeltmesi** — `draftMeta` ile ödeme/adım state korunuyor
- [x] **Açık Hesap toplu ödeme + FIFO dağıtımı** — birden fazla satışa kısmi ödeme dağıtımı

### Fiyat & stok
- [x] **Fiyatı Değişen Ürünler** — 5 faz (bildirim, hatırlatma cron, etiket basımı, admin paneli, okundu/etiket takibi)

### Laboratuvar
- [x] **Laboratuvar İş Süreci sistemi** — 5 faz: rol/atama, atölye ekranı, kırılma bildirimi (`LabIncident`), rapor entegrasyonu, test scriptleri

### Ürün yapılandırma & varyant
- [x] **Not #29 — Kontrolsüz varyant patlaması** — yeni nitelikler `create_variant: dynamic`; FAZ 2: 1.383 gereksiz varyant silindi (MUSTANG 1350→3); FAZ 3: import sonrası otomatik temizlik (`varyant-import-temizlik.service.ts`)

### Excel Toplu Envanter (Not #42)
- [x] **FAZ A** — şablon indir + önizleme (`envanter-import.service.ts`, read-only Odoo)
- [x] **FAZ B** — gerçek yazma: şablon + varyant + lot + `stock-adjustment` (`envanter-import-uygula.service.ts`, satır bazlı rollback)
- [x] **FAZ C** — Depo → **📊 Excel Envanter** sekmesi (önizleme tablosu, lokasyon seçici, onay, sonuç raporu)
- [x] **Not #45–47** — Marka sütunu kaldırıldı; Barkod/UTS Metin formatı (`@`); aynı barkod + farklı UTS geçerli; lot adı UTS ile ayrıştırılıyor

### Lot Transfer teşhisi (13.07.2026 — salt okuma)
- Depo → Transferler → **Lot Transfer** → `POST /admin/transfer-olustur` → `olusturTransfer()`
- Farklı şirket (NG→ADESE): **`executeSirketlerArasiTransfer()` ÇAĞRILIYOR** — güvenli yol
- Gerçek transfer doğrulandı: `TRANSFER-1783969474452` → NG `INV/2026/00017` + ADESE `BILL/2026/07/0015` (Odoo posted), picking NG/OUT/00007 + ADESE/IN/00024

---

## KRİTİK — Bugün bulunan, henüz düzeltilmemiş sorunlar

### Not #48 — Stok Kontrol transferinde lot/UTS seçimi yok
Stok Kontrol'den transfer başlatılınca hangi UTS/lot'un gideceği sorulmuyor → Odoo *"Lot/Seri numarası sağlamanız gerekir"* hatası.
**Çözüm yönü:** Çalışan **Depo Yönetimi → Transferler → Lot Transfer** ekranındaki arama + lot seçim mekanizmasını referans al / Stok Kontrol'e bağla.

### Not #49 — Transfer akışında UTS bildirimi yok
Aynı şirket içi VE şirketler arası transferlerde TITCK UTS'ye alma/verme bildirimi **hiç gönderilmiyor**.
Lot Transfer → `transfer-olustur` → UTS API çağrısı yok. Şube transfer kabulünde yalnızca Odoo `x_uts_durumu: MAGAZADA` yazılıyor (harici UTS değil).
**Risk:** UTS'deki kayıtlı konum ≠ gerçek fiziksel konum.

### Not #50 — EN KRİTİK: Şirketler arası transfer e-Fatura Uyumsoft'a gitmiyor
`executeSirketlerArasiTransfer()` Odoo'da NG satış + ADESE alım faturası oluşturup `posted` yapıyor; ancak:
- `eFaturaGonder()` / `kuyrugaAl()` / `FaturaKuyruk` **hiç tetiklenmiyor**
- `Fatura` tablosunda `transferId` dolu kayıt: **0**
- `INV/2026/00017` için Uyumsoft/GİB karşılığı **yok** — yalnızca Odoo iç muhasebe kaydı

**Sonuç:** Resmi e-Fatura oluşmuyor; yasal/muhasebe açısından eksik belge riski.

### Açık soru (teyit edilmedi)
- **Aynı şirket içi transfer (NG→NG):** e-İrsaliye kesiliyor mu? **Kontrol edilmedi.**
- **Şirketler arası:** e-İrsaliye deneniyor (`trySendEirsaliyeForTransfer`) ama NG Uyumsoft yetkisi olmadığı için başarısız olabilir (önceki oturum bulgusu, hâlâ çözülmemiş olabilir).

---

## Sistemin genel prensibi — Transfer anında olması gereken 4 şey

Herhangi bir transfer (aynı şirket içi **veya** şirketler arası) olduğunda aşağıdakilerin **hepsi** tetiklenmeli. Şu an **hiçbiri merkezi bir yerden yönetilmiyor**; her biri ayrı köşede kurulmuş:

| # | Adım | Durum |
|---|------|--------|
| 1 | Lot/UTS/envanter kaydının taşınması (Odoo stok hareketi) | **ÇALIŞIYOR** |
| 2 | e-İrsaliye kesilmesi (Uyumsoft) | **KISMEN** — sadece şirketler arası yolda deneniyor; yetki/teyit eksik |
| 3 | e-Fatura kesilmesi (yalnızca şirketler arası, maliyet+%5) | Odoo'da **OLUŞUYOR**, Uyumsoft/GİB'e **GİTMİYOR** (Not #50) |
| 4 | UTS'ye bildirim (alma/verme) | **HİÇ YOK** (Not #49) |

**Öneri (sonraki oturum):** Bu 4 parçayı tek bir merkezi **"transfer sonrası aksiyonlar"** fonksiyonunda birleştir — POS transfer, Lot Transfer, şirketler arası yol ayrı ayrı çağırmak yerine tek ortak noktadan tetiklensin.

**→ Tasarım onaylandı:** `TRANSFER_BIRLESIK_MOTOR_TALIMATI.md` (13.07.2026, 7 faz). Uygulama devam ediyor.

### Transfer motor birleştirme — uygulama durumu

| Faz | Konu | Durum |
|-----|------|--------|
| 1 | Veri modeli: `utsKodu`/`utsFirmaKodu` kalemlerde, `getUtsKurumNo`, `TransferAksiyonLog` | **TAMAM** |
| 2 | `transfer-post-actions.service.ts` merkezi 4-aksiyon | **TAMAM** (henüz giriş noktalarına bağlanmadı) |
| 3 | İki adımlı çekirdek (baslat/kabul) | **TAMAM** |
| 4 | Garanti/İade + Özel Sipariş → `olusturTransfer({ hemenKabul: true })` | **TAMAM** |
| 5 | e-Fatura gerçek kalem + Uyumsoft (Not #50) | **TAMAM** |
| 6 | UTS otomatik VERME/ALMA (Not #49) + UtsDisFirma seed | **TAMAM** |
| 7 | Test senaryoları | Bekliyor |

**Faz 1 dosyalar:** `uts-kurum.service.ts`, `transfer-kalem.util.ts`, `transfer-aksiyon-log.service.ts`, Prisma `TransferAksiyonLog`.

**Faz 2 dosyalar:** `transfer-post-actions.service.ts`, `transfer-bildirim.util.ts`, test: `scripts/test-transfer-post-actions-faz2.ts`.

**Faz 3 dosyalar:** `transfer-core.service.ts` (`baslatTransfer` / `kabulEtTransfer`), `baslatSirketlerArasiTransfer` + `kabulSirketlerArasiTransfer`, `POST /admin/transfer-kabul`, POS `/transfer/olustur`+`/transfer/kabul` çekirdeğe bağlandı.

**Faz 4:** `warranty.service.ts` (`startClaimTransfer`) ve `ozel-siparis.service.ts` (`runOzelSiparisStokTransfer`) artık `olusturTransfer({ hemenKabul: true })` kullanıyor — `executeSirketlerArasiTransfer` doğrudan çağrılmıyor. `executeSirketlerArasiTransfer` yalnızca legacy wrapper olarak dosyada duruyor.

**Faz 5:** `tetikleTransferEFatura(transferRef, kaynakSube, hedefVkn, hedefAd, kalemler)` — gerçek ürün adı/miktar/maliyet×1.05; Uyumsoft resmi `faturaNo` + `Fatura.transferId=transferRef`; başarısızda `FaturaKuyruk`. `runEFatura` post-actions'a bağlandı. Test: `scripts/test-transfer-efatura-faz5.ts`.

**Faz 6:** `uts.service.ts` — `gondermeBildiriminiYap`, `bildirimOlusturVeGonder`, `transferUtsBildirimGonder`, `ensureUtsDisFirmaSirketlerSeed`. Admin UTS rotaları servise taşındı; `runUtsBildirimi` VERME (başlat) / ALMA (kabul) otomatik. DB'de 3 `UtsDisFirma` seed (NG/ADESE/POTENTIAL). Test: `scripts/test-transfer-uts-faz6.ts`.

### Bölüm 6 kararları (13.07.2026 — çözüldü)

- **Garanti/İade + Özel Sipariş:** `baslatTransfer` + `kabulEtTransfer` arka arkaya otomatik; kullanıcıya ekstra kabul ekranı yok; UTS VERME/ALMA iki ayrı adım olarak kalır.
- **Mağaza duyurusu:** Gerek yok.
- **UtsDisFirma:** Seed yok; Faz 6 öncesi DB sorgulanacak, boşsa NG/ADESE/POTENTIAL VKN'leriyle otomatik seed.

---

## Açık notlar (henüz düzeltilmedi)

| Not | Konu |
|-----|------|
| **#48** | Stok Kontrol transfer — lot/UTS seçimi |
| **#49** | Transfer UTS bildirimi |
| **#50** | Şirketler arası e-Fatura → Uyumsoft/FaturaKuyruk |
| **#44** | Eski Odoo'dan veri aktarımı (URL/kullanıcı bekleniyor) |

Not #28–47 arası büyük kısmı tamamlandı (varyant patlaması #29, Excel envanter #42/#45–47, sayım, özel sipariş, fiyat değişikliği, laboratuvar vb.). Yukarıdaki dört not **açık**.

---

## Dış bağımlılıklar (bizim elimizde değil, cevap bekleniyor)

- **PROMAX** etiket test basımı (mağazada)
- **POTENTIAL** Uyumsoft kimlik bilgisi (kullanıcıdan)
- **UTS Envanteri Excel'i** (kullanıcıdan)
- **e-İrsaliye Uyumsoft yetkisi** — NG hesabı (destek: EFT-IST-SRVS12)
- **Patron PDKS 403** — GVN6/7/8 (destek: EFT-IST-SRVS12, ayrı konu)
- **Not #44** — Eski Odoo veri aktarımı (URL/kullanıcı adı bekleniyor)
- **ADESE Uyumsoft** credential (admin panelinden girilecek — altyapı hazır)

---

## Kısa vadeli — açık (önceki + güncel)

- [x] **Not #50** — `runTransferPostActions` → `tetikleTransferEFatura` gerçek kalem + `Fatura.transferId`
- [x] **Not #49** — Transfer UTS VERME/ALMA otomasyonu (`uts.service.ts`)
- [ ] **Not #48** — Stok Kontrol → lot seçimli transfer (Lot Transfer referans)
- [ ] Merkezi "transfer sonrası aksiyonlar" birleştirme (4'lü paket)
- [ ] Uyumsoft e-arşiv gönderme
- [ ] Her şube için Odoo lokasyon ID / PDKS place ID (Tanımlamalar)
- [ ] GVN6, GVN7, GVN8, GVN10 PDKS konum
- [ ] Bölge müdürü kasa tablosu (placeholder)
- [ ] Mevcut personelleri Odoo ile eşleştir
- [ ] Personel kaydı → WhatsApp belge talep akışı
- [ ] Ürün yapılandırma — Barkod yazdırma
- [ ] Açık hesap vade tarihi
- [ ] Karlılık analizi + drill-down
- [ ] Ürün maliyet girişi ekranı

---

## Teknik notlar

- Backend: localhost:3000 (Express, Prisma, PostgreSQL optikpos port 5432)
- Frontend: localhost:5173 (React/Vite)
- Odoo: localhost:8069 (Docker, DB: guvenoptik)
- Patron Paneli: /admin/patron (ADMIN rolü)
- **Excel Envanter:** `/admin/depo` → 📊 Excel Envanter; API: `/api/admin/envanter-import/*`
- **Lot Transfer:** `POST /admin/transfer-olustur` → `transfer-olustur.service.ts`
- **Şirketler arası:** `sirketler-arasi-transfer.service.ts` (fatura+picking; e-Fatura eksik)
- **e-Fatura kuyruk:** `efatura.cron.ts` (15 dk) — yalnızca `FaturaKuyruk` BEKLIYOR kayıtları; POS satış + şube transfer kabul tetikler

---

## Önceki oturum özeti (07.07.2026 — korundu)

- SGK/Vakıf gerçek Payment + Odoo journal
- Odoo fatura arama hatası (confirmSale + açık hesap) düzeltildi
- e-Fatura kuyruk → Sale senkron hatası düzeltildi
- Resmi Fatura PDF Uyumsoft'tan canlı
- Lens ölçüm kalıcı (`lensOrderMeasurement`, `pairedItemId`)
- Stok Kontrol sekmesi, Bakım kategorisi, VOID Odoo güvenliği
- Güvenlik: hardcoded şifreler temizlendi

## Kritik Notlar — DB / PDKS (03–07.2026 — korundu)

- PDKS mekan ID: GVN1=5732, GVN2=5727, GVN3=5733, GVN5=5735, GVN6=5781, GVN7=5779, GVN8=8026, GVN9=5734, ANADEPO=8027, GVN10=eksik
- PatronPage → adminApi (login fix)
- Ürün araması tüm şirketlerde (NG/ADESE/POTENTIAL)
- DRAFT devam: `/sales/new?saleId=...`
