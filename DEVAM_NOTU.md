# Güven Optik POS — Devam Notu
Son güncelleme: 14.08.2026

## Kural: Önce tasarım, sonra kod
Her yeni özellik için önce Claude'dan tasarım alınır, onaylanır, sonra kodlanır.

---

## 14.08.2026 (devam 2) — Üçüncü tur: #72-74, #77, #78 düzeltildi (liste tamamlandı)

### Satış PDF ödeme detayı eksik/yanlış (#72)
StatusStep.tsx'te PDF'in "Ödenen"/"Kalan" hesabı sadece CASH/CARD/OPEN_ACCOUNT ödeme
tiplerini topluyordu; TRANSFER/SGK/VAKIF/ETICARET ödemeleri hiç sayılmıyordu, bu yüzden
"Kalan" rakamı yanlış çıkıyordu (aslında ödenmiş olan tutar borç gibi görünüyordu). Tüm
7 ödeme tipi artık toplanıyor ve dökümde ayrı satır olarak listeleniyor (Nakit, Kredi Kartı,
Havale, Açık Hesap, SGK Hakkı, Vakıf Ödemesi, Kurum Ödemesi). types.ts'teki Payment.paymentType
union'ı ve SaleDetailPage.tsx'in ekran etiket haritası da aynı eksik tiplerle güncellendi.

### Ölçümler ekranında "Daimi Gözlük 1" etiketi (#73)
saleMeasurements.ts'teki buildInitialMeasurementDrafts, grup etiketini frame bilgisinden
bağımsız üretiyordu ("Daimi Gözlük 1" gibi sabit + sayaç). Artık bağlı çerçeve varsa etiketin
sonuna çerçeve adını ekliyor ("Daimi Gözlük 1 (RAY-BAN RB2140...)"), kendi çerçevesi ise
"Kendi Çerçevesi" ekliyor.

### Kredi kartı ödemesinde banka/POS ekleme çalışmıyordu (#74)
Kök neden: PaymentStep.tsx (satış ekranındaki ödeme adımı) banka/POS listesini
`GET /admin/banks`'tan çekiyordu, ama bu route ek-yetki.ts'te "Tanımlamalar" grubuna
(sadece Role.ADMIN + TANIMLAMALAR yetkisi) gated'lı — satış personeli/kasiyer/mağaza müdürü
gibi satışı işleyen roller 403 alıyor, banka listesi boş kalıyor, kart ödemesi
bankId/posDeviceId zorunlu olduğu için eklenemiyordu. Çözüm: satış akışı için ayrı,
authenticate-only bir endpoint eklendi (`GET /sales/payment-banks`, sale.controller.ts),
PaymentStep.tsx bu endpoint'i kullanıyor. Tanımlamalar'daki CRUD route'ları (`/admin/banks`
POST/PUT) admin-only olarak kalmaya devam ediyor.
Not: Odoo tarafında her ödeme tipi için sabit journal_id kullanılıyor (JOURNAL_MAP,
sale.service.ts ~1089) — hangi banka/POS seçildiği Odoo muhasebe kaydına şu an yansımıyor.
Banka bazlı Odoo journal eşlemesi için Bank modeline bir alan eklenmesi gerekiyor; bu daha
büyük bir şema değişikliği olduğu için bu turda yapılmadı, ileride ele alınmalı.

### Bekleyen Transferler'de ürün hem gidende hem gelende görünüyordu (#77)
transfer.service.ts'teki listBekleyen/listGonderilen domain filtreleri location_id/
location_dest_id'den sadece birini kontrol ediyordu; teorik olarak location_id==location_dest_id
olan (öz-referanslı) bir picking iki listede birden eşleşebiliyordu. Her iki sorguya karşı
lokasyonun dışlanması eklendi. Ayrıca BekleyenTransferler.tsx'e frontend güvenlik ağı eklendi:
aynı transferId hem gelen hem giden listesinde geldiyse, "Gelen" (aksiyon gerektiren) öncelikli
tutulup "Giden"den çıkarılıyor — kök neden ne olursa olsun görsel çakışma artık oluşamaz.

### Teslimat durumu Depo Yönetimi sipariş ekranıyla senkron değildi (#78)
İki bağımsız durum alanı var: SaleItem.status (Satış Teslimat ekranı) ve OzelSiparis.durum
(Depo Yönetimi > Siparişler / Özel Sipariş Teslim). Aralarında senkron yoktu:
- Satış Teslimat'tan bir kalem DELIVERED yapıldığında, bağlı özel sipariş varsa
  (OzelSiparis.saleItemId) durumu TESLIM_EDILDI'ye hiç geçmiyordu.
- Depo Yönetimi'nden "Özel Sipariş Teslim" (musteri-teslim) yapıldığında, bağlı
  SaleItem.status hiç DELIVERED'a çekilmiyordu.
Her iki yön de eklendi: sale.service.ts'teki updateSaleItemStatus, DELIVERED durumunda bağlı
OzelSiparis'i TESLIM_EDILDI yapıyor (best-effort, hata sale kaydını engellemiyor);
ozel-siparis.controller.ts'teki /musteri-teslim, bağlı SaleItem.status'u DELIVERED yapıyor.

---

## 14.08.2026 (devam) — İkinci tur: #60-71 düzeltildi

### Garanti & İade kategori filtresi çift görünüyordu (#60)
KATEGORI_LABEL'de birden fazla kod aynı etikete eşleniyordu (OPTICAL_FRAME_READY/RX ikisi de
"Optik Çerçeve"), dropdown kod bazlı listelendiği için etiket 2 kez görünüyordu. GarantiPage.tsx
artık benzersiz etiket listesi gösteriyor, filtre etiket bazlı çalışıyor.

### Günlük Kasa Raporu "Reçete Bed." kolonu (#61)
Kolon her zaman SGK tutarını gösteriyordu ama başlık yanlıştı. PDF + ekran tablosu "SGK Bed."
olarak düzeltildi (gunlukKasaPdf.ts, DashboardPage.tsx).

### Sidebar kullanıcı kartı — şube kodu yoktu (#62)
Sidebar.tsx: rol satırına şube kodu eklendi ("ROL · ŞUBE_KODU").

### Kontrol Paneli Personel sekmesi (#63)
Kod incelendi — STORE_MANAGER zaten ADMIN ile AYNI MudurDashboard'u kullanıyor, sekme zaten
ortak. Kod tarafında fark bulunamadı; canlıda tekrar doğrulanmalı.

### Profilim ekranı + yüklenmemiş evraklar (#64, #65)
Profilim sekmesi sadece SALES_STAFF'ta vardı. Ortak `ProfilimTab` bileşeni çıkarıldı, hem
MudurDashboard (STORE_MANAGER/ADMIN/WAREHOUSE_MANAGER/WORKSHOP_STAFF/ACCOUNTANT) hem
BolgeMudurDashboard'a (REGIONAL_MANAGER) eklendi. Ayrıca belge listesi artık BELGE_TIP_LABELS'teki
TÜM türleri gösteriyor — hiç yüklenmemiş bir evrak da "Yüklenmedi" rozetiyle ve Yükle butonuyla
çıkıyor (önceden sadece zaten yüklenmiş belgeler listeleniyordu).

### Mağaza Özeti'nde SGK ödemesi gelmiyordu (#66)
SGK/Vakıf toplamları shift.id'ye (o an açık vardiya) bağlıydı — aynı gün içinde vardiya
kapanıp yeni vardiya açılırsa önceki vardiyadaki SGK'lı satışlar toplamdan düşüyordu. Ayrıca
"Vakıf Ödemesi" hiç gerçek veriden hesaplanmıyordu (sale.prescriptionAmount hiç okunmuyordu,
hep 0 görünüyordu). report.service.ts: SGK/Vakıf artık GÜNÜN TAMAMI (tüm vardiyalar) üzerinden
hesaplanıyor; kasa mutabakatı alanları (openCash/expectedCash) kasıtlı olarak vardiya bazlı kaldı.

### Reçete geçmişinde sadece Daimi görünüyor + yeni reçete kaydetmiyor (#67, #68)
Kök neden: "Hızlı Müşteri Oluştur" formundan girilen reçete SADECE Customer satırının kendi
far_*/near_*/lens_* kolonlarına yazılıyordu — CustomerPrescription tablosuna (Reçete Geçmişi'nin
gerçek kaynağı) hiç satır eklenmiyordu. customer.service.ts: createCustomer() artık
addPrescription ile aynı şekilde CustomerPrescription satırı da oluşturuyor (gözlük ve lens verisi
ayrı kart olarak, source: MANUAL/LENS).

### "Kabul bekliyor" transferde satış personeli devam edemiyordu (#70)
"Onaya Devam" butonu tüm kalemlerin stokDurum === 'MEVCUT' (fiziksel burada) olmasını
şart koşuyordu — TRANSFER_YOLDA (transfer zaten başlatılmış/taahhüt edilmiş, hedef şube
kabulünü bekliyor) da bloklayıcıydı. StokTeminStep.tsx: TRANSFER_YOLDA artık "devam
edilebilir" sayılıyor.

### Transfer lot seçimi adet kadar seçtirmiyordu + UTS gösterilmiyordu (#71)
İki kök neden: (1) transferApiCagir'da miktar her zaman hardcoded 1'di — satışın gerçek adedi
hiç kullanılmıyordu; (2) lot/seri picker'ı tek tıkla tek lot seçip kapanıyordu, adet>1 için
ikinci lotu seçme imkanı yoktu. StokTeminStep.tsx: gerekliAdet artık satış kaleminin qty'sinden
hesaplanıyor, picker checkbox ile çoklu lot seçimine izin veriyor (tam gerekliAdet kadar
seçilene kadar onay pasif), her lot ayrı kalem (miktar:1) olarak gönderiliyor, UTS kodu
lot kartlarında gösteriliyor.

### Henüz düzeltilmedi (sıradaki oturum)
- #72 Satış PDF çıktısında ödeme detayı eksik/yanlış
- #73 Ölçümler ekranında "Daimi Gözlük 1" etiketi yanlış
- #74 Kredi kartı ödemesinde banka/POS ekleme çalışmıyor
- #77 Bekleyen Transferler'de ürünler hem gidende hem gelende görünüyor
- #78 Teslimat durumu Depo Yönetimi sipariş ekranıyla senkron değil

---

## 14.08.2026 — Canlı test turu: 27 ekran görüntüsü bulgu, düzeltmeler

Görkem canlı sistemi test edip 27 ekran görüntüsüyle bulgu bildirdi (görev listesine #60–#82
olarak eklendi). Bu oturumda kod seviyesinde düzeltilenler:

### Uyumsoft transfer faturası — tutar hesabı + satıcı kodu (#76, #82)
- **Kök neden:** `buildUBLXML()` transfer birim fiyatını (maliyet×1.05, KDV HARİÇ) KDV DAHİL
  sanıp içinden KDV ayrıştırıyordu (787,50 TL → yanlışlıkla 715,91 TL mal/hizmet + 71,59 TL KDV).
  Doğrusu: KDV net tutarın üzerine eklenmeli (787,50 TL net + %10 KDV = 866,25 TL toplam).
- `FaturaKalem`'e `kdvHaric?: boolean` eklendi; `transferdenFaturaData` bunu `true` set ediyor,
  `buildUBLXML` bu durumda KDV'yi üstüne ekliyor. POS satış faturası yolu (`satistenFaturaData`)
  dokunulmadı, hâlâ KDV DAHİL mantıkla çalışıyor (doğru).
- **Satıcı Kodu** artık ürünün Odoo ID'si değil, önce UTS kodu, yoksa lot/seri adı yazılıyor
  (`transfer-maliyet.util.ts` → `resolveSaticiKodu`).
- **Ayrı bulunan gizli bug:** `enrichKalemlerWithUtsFromLot()` yeni bir dizi döndürüyordu ama
  çağıran yer (`transfer-core.service.ts` `baslatTransfer`) dönen değeri hiç atamıyordu — UTS
  kodu transfer kalemlerine hiçbir zaman yazılmıyordu (ne faturada ne UTS VERME bildiriminde).
  Düzeltildi: `input.kalemler = await enrichKalemlerWithUtsFromLot(...)`.

### Transfer sonrası eksik fatura (#69) — kod hatası değil, veri/UX
- `tetikleTransferEFatura`, kalemlerden herhangi birinin maliyeti (Odoo `standard_price`) 0/boş
  ise faturayı reddediyor ve `notifyTransferAksiyonFailure` ile ilgili rollere bildirim
  gönderiyor — **sessiz bir hata değil, kasıtlı güvenlik kontrolü**. OTTO OPTİK ÇERÇEVE'nin
  faturası muhtemelen bu yüzden kesilmedi (bkz. #49 — kategori/veri eksikliği). Kod değişikliği
  yapılmadı; ürünün maliyet bilgisinin Odoo'da girili olduğundan emin olun.

### Teslimat ekranı şube filtresi çalışmıyordu (#79)
- İki kök neden birlikte: (1) `/admin/branches` (Odoo lokasyon, numerik id) yanlış veri
  kaynağıydı — doğrusu `/admin/branch-list` (Prisma Branch, UUID id, `sales/delivery`
  endpoint'inin beklediği tip). (2) Dropdown seçenekleri kopyala-yapıştır hatasıyla hepsi
  `value=""` ile render ediliyordu — hangi şube seçilirse seçilsin "Tüm şubeler"e dönüyordu.

### Satışlar ekranı müşteri adıyla arama sonuç getirmiyordu (#80)
- Arama tamamen client-side'dı; backend zaten kullanıcının KENDİ ŞUBESİNE ait en fazla 100
  kayıtla sınırlıydı. Başka şubede yapılan satış listeye hiç girmiyordu. Backend'e `q` parametresi
  eklendi (`sale.service.ts`/`getSales`) — arama terimi verildiğinde şube kısıtlaması kalkıyor,
  müşteri adı/telefon/referans no/ID tüm şubelerde aranıyor.

### Stok Yönetimi filtresi anlık çalışıp sıfırlanıyordu (#81)
- Klasik race condition: her tuş vuruşunda ayrı istek atılıyordu, geç dönen eski bir yanıt
  (ör. "U" için) yeni yazılan "ULTRA" sonucunun üzerine yazabiliyordu. `yukleReqRef` sıra
  numarasıyla yalnızca en son isteğin sonucu state'e yazılıyor artık.

### Kalan yeni bulgular (#60–68, #70–74, #77–78) — henüz kod düzeltmesi yapılmadı
Garanti&İade kategori filtresi, Kasa Raporu "Reçete Bed." kolonu, personel/şube ismi, Kontrol
Paneli Personel sekmesi rol kısıtı, Profilim ekranı rol kısıtı, SGK ödeme gösterimi, reçete
geçmişi/kaydetme, Kabul bekliyor transfer blokajı, lot/UTS seçim ekranı, satış PDF ödeme detayı,
Ölçümler "Daimi Gözlük 1" etiketi, kredi kartı POS ekleme, Bekleyen Transferler'de aynı ürünün
hem gidende hem gelende görünmesi, Teslimat↔Depo Yönetimi senkronu — sıradaki oturumda devam.

---

## 13.08.2026 — Bu oturumda tamamlanan işler

### Kalem Ekle arama hatası (ACİL, düzeltildi)
- **OTTO OPTİK ÇERÇEVE aramada hiç çıkmıyordu** (stoklarda vardı) — kök neden: Odoo domain'inde
  `display_name` (stored olmayan/computed alan) `categ_id` filtresiyle birlikte OR'landığında
  Odoo bu koşulu doğru uygulamıyordu; `OTTO` araması ilgisiz sonuçlar (ZAROSSI/MUSTANG vb.)
  döndürüyordu. `display_name` yerine stored `default_code` alanına geçildi
  (`transfer.service.ts`, `searchUrunByNameCatalog`).
- `SIRKET_SEARCH_IDS` `[2,3,4]` → `[1,2,3,4]` genişletildi — kendi şirketimizdeki (Güven Optik)
  ürünler arama yolunda hiç taranmıyordu.
- **Kalıcı not:** OTTO OPTİK ÇERÇEVE Odoo'da hiçbir standart kategoriye (Çerçeve/Güneş/Aksesuar/
  Bakım) atanmamış — veri sorunu, henüz düzeltilmedi (kategori ataması onay bekliyor).

### Personel Fiyatı ekranı düzeltmeleri
- "Personel Fiyatı Uygula" checkbox'ı ekranda 2 kere görünüyordu — tekrar eden blok kaldırıldı
  (`ItemsStep.tsx`).
- Maliyet + KDV + "%20 kârla hesaplandı" bilgi metni personel fiyatı checkbox'ının altında
  müdürlere görünüyordu — kaldırıldı.

### Stok Sorgula yeniden tasarımı
- Sonuçlar artık **ürün bazında gruplanıyor** (500 kayıt sınırı 3000'e çıkarıldı); her kart
  tıklanınca **lokasyon + UTS/Lot-Seri kırılımını** açıyor (Depo Yönetimi ekranındaki gibi).
- Arama artık **nitelik (varyant değeri) ve model/referans koduna göre de eşleşiyor** —
  `product.template.attribute.value` üzerinden iki adımlı arama (`transfer.service.ts`'teki
  `searchVariantsByPtav` deseni). "C1" yazınca C1M/C15M/C14M vb. niteliğe sahip tüm çerçeve/
  güneş gözlüğü varyantları geliyor; "2140" yazınca RAYBAN yazmadan model koduyla eşleşiyor.
  Ayrı bir Model/Ürün/Renk filtre ayrımına gerek kalmadı — tek arama kutusu üçünü birlikte tarıyor.
- Backend: `admin.controller.ts` `/admin/stock` endpoint'i tamamen yeniden yazıldı.
- Frontend: `StokSorgulaPage.tsx` — yeni `StockGroupRow`/`StockLocationRow` tipleri, expand/
  collapse UI, `truncated` uyarısı.
- Canlıda doğrulandı: "2140" → 1 ürün, 16 lokasyon kaydı; "C1" → 19 ürün (OTTO ÇERÇEVE varyantları).

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

## Not #48/#49/#50 — DÜZELTİLDİ (13.08.2026 itibarıyla kod doğrulandı)

Aşağıdaki üç madde bu dosyanın önceki sürümünde "KRİTİK — henüz düzeltilmemiş" olarak
işaretliydi. Kod taramasında üçünün de "Transfer motor birleştirme" tablosundaki Faz 4–6 ile
birlikte tamamlanmış olduğu doğrulandı (dosyalar mevcut, `TAMAM` işaretli):

### Not #48 — Stok Kontrol transferinde lot/UTS seçimi ✅
`StokKontrolTab.tsx` artık `searchTransferProductLots` ile lot/UTS listesini çekiyor, lot bazlı
transfer modalı (`lotTransferModalAc`, `lotTransferGonder`) mevcut — Lot Transfer ekranındaki
mekanizma Stok Kontrol'e bağlanmış.

### Not #49 — Transfer UTS bildirimi ✅
`uts.service.ts` — `gondermeBildiriminiYap`, `transferUtsBildirimGonder`, `runUtsBildirimi`
VERME (başlat) / ALMA (kabul) otomatik tetikleniyor (Faz 6).

### Not #50 — Şirketler arası e-Fatura → Uyumsoft ✅
`transfer-post-actions.service.ts` içindeki `tetikleTransferEFatura` gerçek kalemlerle
Uyumsoft'a fatura kesiyor, `Fatura.transferId` doluyor, başarısızda `FaturaKuyruk`'a düşüyor (Faz 5).

**Not:** Faz 7 (test senaryoları) durumu doğrulanmadı — bir sonraki oturumda uçtan uca test
önerilir (özellikle NG→ADESE transferinde gerçek Uyumsoft faturası + UTS bildirimi birlikte).

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
| **#44** | Eski Odoo'dan veri aktarımı (URL/kullanıcı bekleniyor) |
| **OTTO OPTİK ÇERÇEVE** | Odoo'da hiçbir standart kategoriye atanmamış (veri düzeltmesi bekliyor) |

Not #28–50 arası tamamlandı (varyant patlaması #29, Excel envanter #42/#45–47, sayım, özel
sipariş, fiyat değişikliği, laboratuvar, transfer motor birleştirme #48–50 vb.). Sadece Not #44
ve OTTO OPTİK kategori ataması **açık**.

---

## Görev listesinden açık kalanlar (13.08.2026 itibarıyla)

- Reçeteye uygun stok cam önerisi kayboldu
- Patron Görünümü: Şirket Karlılık Raporu (4 oran, şirket bazlı + tarih aralığı)
- Açık Hesap: 30 gün sonra otomatik WhatsApp ödeme hatırlatma mesajı
- Finans: "Mahsuptaki Ödemeler" takip alanı (SGK/Vakıf tahsilat süreci)
- Müşteriler > Satışları Gör: Satışlar ekranına geçince arama sonuç getirmiyor
- Garanti & İade: onaylı satış "Tamamlanmış satış bulunamadı" diyor
- Uyumsoft'a fatura düşmüyor + admin kullanıcının şube ataması belirsiz (devam ediyor)
- Satış onaylanınca e-fatura otomatik tetikle
- Etiket Bas: adet (quantity) PDF çıktısında yansımıyor
- OTTO OPTİK ÇERÇEVE Odoo'da kategori ataması bekliyor (yukarıda da var)

---

## Dış bağımlılıklar — 13.08.2026 durumu (Görkem ile teyit edildi)

| Konu | Durum |
|------|-------|
| **NG e-İrsaliye Uyumsoft yetkisi** (destek: EFT-IST-SRVS12) | ✅ **Sonuçlandı** — yetki geldi, yapıldı |
| **Patron PDKS 403** — GVN6/7/8 (aynı destek talebi) | ✅ **Sonuçlandı** |
| **GVN10 PDKS mekan (place) ID** | ✅ **Çözüldü** (Görkem'in hatırladığı kadarıyla — `Branch.pdksPlaceId` alanı artık Tanımlamalar'dan DB'de tutuluyor, hardcoded değil; şüphe olursa Tanımlamalar → Şubeler'den tek tek kontrol edilebilir) |
| **Uyumsoft e-arşiv gönderme** | ✅ **Sorun yok, çözüldü** |
| **ADESE Uyumsoft credential** | ✅ **Girildi** — admin panelinden bir kez daha kontrol edilecek |
| **POTENTIAL Uyumsoft credential** | ⏸️ **Bilinçli beklemede** — POTENTIAL şirketi ayrılıyor/devrediliyor, bu yüzden bekleniyor. Devir netleşmeden credential girilmeyecek. |
| **PROMAX etiket test basımı** (mağazada) | ❌ **Henüz denenmedi** — sıradaki adım, mağazada fiziksel test yapılacak |
| **UTS Envanteri Excel'i** | 📦 **Geldi**, ama ne yapılacağı netleşmedi (aşağıya bakın) |
| **Not #44 — Eski Odoo veri aktarımı** | ❌ **Henüz yapılmadı** — URL/kullanıcı adı hâlâ bekleniyor |

### UTS Envanteri Excel'i — plan hatırlatması
Görkem "geldi ama ne yapacaktık hatırlamıyorum" dedi. Kod taramasında bulduğum ipucu
(`SISTEM_ENVANTERI.md`): TITCK UTS'nin kendi envanter sorgulama API'si (`uretici/sorgula`)
canlıda **404** veriyor — yani UTS'nin bizdeki kayıtlarını doğrudan API'den çekemiyoruz. Muhtemel
plan: UTS'nin bize elle verdiği bu Excel'i, bizim Odoo/POS stok kayıtlarımızla **karşılaştırıp
(mutabakat)** UTS'de kayıtlı konum ile gerçek fiziksel konum arasında fark olan ürünleri
bulmaktı (Not #49'daki risk: "UTS'deki kayıtlı konum ≠ gerçek fiziksel konum"). Bu sadece kod
izinden çıkardığım bir tahmin — kesin planı hatırlarsanız ya da Excel'in içeriğini
paylaşırsanız somut bir karşılaştırma/mutabakat ekranı tasarlayabilirim.

---

## Kısa vadeli — açık (önceki + güncel)

- [x] **Not #50** — `runTransferPostActions` → `tetikleTransferEFatura` gerçek kalem + `Fatura.transferId`
- [x] **Not #49** — Transfer UTS VERME/ALMA otomasyonu (`uts.service.ts`)
- [x] **Not #48** — Stok Kontrol → lot seçimli transfer (`StokKontrolTab.tsx`)
- [x] Merkezi "transfer sonrası aksiyonlar" birleştirme — Faz 3-6 çekirdeğe bağlandı (Faz 7 test senaryoları hariç)
- [x] Ürün yapılandırma — Barkod/Etiket yazdırma (`EtiketBasModal.tsx`, adet girişi dahil)
- [x] Mevcut personelleri Odoo ile eşleştir — İK personel bağlantı paneli (PDKS/Odoo/POS üçlü, şube ataması) yapıldı
- [ ] Uyumsoft e-arşiv gönderme — kodda ayrı bir akış bulunamadı, durumu teyit edilmeli
- [ ] Her şube için Odoo lokasyon ID / PDKS place ID (Tanımlamalar) — çoğu şube dolu, **GVN10 hâlâ eksik**
- [ ] Bölge müdürü kasa tablosu (placeholder)
- [ ] Personel kaydı → WhatsApp belge talep akışı
- [ ] Açık hesap vade tarihi — `admin.controller.ts`'te `vadeTarihi` alanı var, ekranda tam akış teyit edilmedi
- [ ] Karlılık analizi + drill-down — Patron Görünümü Şirket Karlılık Raporu olarak görev listesinde açık
- [ ] Ürün maliyet girişi ekranı — maliyetin Odoo'ya düşmesi doğrulandı, ayrı giriş ekranı teyit edilmedi

---

## Teknik notlar

- Backend: localhost:3000 (Express, Prisma, PostgreSQL optikpos port 5432)
- Frontend: localhost:5173 (React/Vite)
- Odoo: localhost:8069 (Docker, DB: guvenoptik)
- Patron Paneli: /admin/patron (ADMIN rolü)
- **Excel Envanter:** `/admin/depo` → 📊 Excel Envanter; API: `/api/admin/envanter-import/*`
- **Lot Transfer:** `POST /admin/transfer-olustur` → `transfer-olustur.service.ts`
- **Şirketler arası:** `sirketler-arasi-transfer.service.ts` (fatura+picking); e-Fatura artık `transfer-post-actions.service.ts` üzerinden gidiyor (Not #50 çözüldü)
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
