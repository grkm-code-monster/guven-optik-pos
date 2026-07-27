# Transfer Motorlarının Birleştirilmesi — Cursor Uygulama Talimatı

Hazırlayan: Claude (Cowork) — 13.07.2026
Bu doküman bir **tasarım/talimat** dokümanıdır, kod içermez. Uygulama Cursor tarafından yapılacaktır.
Kural: her fazdan sonra çalışır durumda commit edilebilir olmalı, önceki davranışı kırmadan ilerlenmeli.

---

## 1. Amaç

Şu an ürünler hangi ekrandan transfer edilirse edilsin (POS "Şube Transferleri", Admin Depo "Lot Transfer",
Admin Depo "Şube Transferleri", Admin "Stok Kontrol", Garanti/İade, Özel Sipariş, Laboratuvar), aynı 4 aksiyonun
aynı kuralla tetiklenmesi gerekiyor:

1. Envanter kaydı (Odoo) — **her zaman**
2. e-Fatura (Uyumsoft) — **sadece şirket değişiyorsa**
3. e-İrsaliye (Uyumsoft) — **sadece şirket aynı, lokasyon farklıysa**
4. UTS bildirimi (TİTCK) — **sadece ürünün UTS bilgisi varsa**, ve aynı-şirket senaryosunda ayrıca **UTS kurum
   kodu farklıysa**

Şu an bu 4 aksiyon iki farklı motor arasında dağınık, tutarsız ve kısmen yanlış (bkz. Bölüm 3) durumda.

---

## 2. Onaylanmış iş kuralı (referans — değiştirilemez, sadece uygulanır)

**Şirket yapısı**
- NG: Ana Depo, GVN2, GVN10
- ADESE: GVN1, GVN3, GVN6, GVN7, GVN8, GVN9
- POTENTIAL: GVN5

**Senaryo 1 — Transfer şirket değiştiriyor** (örn. NG→ADESE)
- e-Fatura (Uyumsoft) → her zaman, maliyete %5 eklenerek. Uyumsoft `SendInvoice` cevabındaki
  `Value.attributes.Number` **resmi** fatura numarasıdır — bizim ürettiğimiz numara sadece
  `LocalDocumentId` referansıdır, resmi seri/sıra Uyumsoft tarafında tutulur.
- Envanter kaydı (Odoo) → her zaman
- UTS bildirimi → sadece kalemin (lot'un) UTS kodu (`x_uts_kodu`) doluysa

**Senaryo 2 — Transfer aynı şirket içinde, lokasyon değişiyor** (örn. GVN1→GVN3, ikisi de ADESE)
- e-İrsaliye (Uyumsoft) → her zaman
- Envanter kaydı (Odoo) → her zaman
- UTS bildirimi → sadece UTS kodu doluysa **VE** kaynak/hedef şubenin UTS kurum kodu (`UtsSube.kurumNo`) farklıysa

**UTS akışı (iki adımlı, zorunlu)**
- Gönderen taraf transferi **başlattığında** (stok çıkışını onayladığında) → **VERME** bildirimi
- Alıcı taraf transferi **kabul ettiğinde** → **ALMA** bildirimi
- Bu ayrım, transferin tek adımda değil iki adımda (gönder → kabul) yürütülmesini zorunlu kılıyor —
  bkz. Bölüm 5, Faz 3.

**Mimari karar (onaylandı)**
- Tek çekirdek transfer motoru; mevcut 4 giriş ekranı (POS Transferler, Admin Şube Transferleri, Lot
  Transfer, Stok Kontrol) UI olarak aynı kalır, hepsi aynı çekirdeğe bağlanır.
- POS "Şube Transferleri" ekranından da şirketler arası transfer başlatılabilir — ekran fark etmeksizin
  aynı kural uygulanır.

---

## 3. Mevcut durum — tespit edilen sorunlar (referans)

| # | Sorun | Kaynak |
|---|-------|--------|
| A | İki ayrı transfer motoru var: `transfer.service.ts` (Motor A — şirketler arasını **engelliyor**, iki adımlı: gönder+kabul) ve `admin/transfer-olustur.service.ts` + `sirketler-arasi-transfer.service.ts` (Motor B — şirketler arasını destekliyor, **tek adımda** hem çıkış hem giriş validate ediliyor, kabul aşaması yok) | Kod incelemesi |
| B | Motor A'nın `acceptTransfer()` fonksiyonu, şirket farkına bakmaksızın kabul anında **her zaman** `tetikleTransferEFatura()` çağırıyor — ve bu çağrı **placeholder veriyle** yapılıyor (`kalemler: [{urunAdi:'Transfer kalemi', miktar:1, birimFiyat:0}]`) — gerçek ürün/miktar/tutar bilgisi yok | `transfer.service.ts` içinde `acceptTransfer` |
| C | Motor A'nın kabul akışında Odoo lot'una `x_uts_durumu: 'MAGAZADA'` direkt yazılıyor — bu gerçek bir UTS API çağrısı değil, sadece iç etiket | `transfer.service.ts` içinde `acceptTransfer` |
| D | Motor B'nin cross-company yolunda (`sirketler-arasi-transfer.service.ts`) Odoo'da satış+alım faturası oluşuyor ama **Uyumsoft'a hiç gönderilmiyor** (`sendInvoice`/`eFaturaGonder` hiç çağrılmıyor) | `executeSirketlerArasiTransfer` |
| E | Motor B'de e-İrsaliye **sadece cross-company yolunda** deneniyor — iş kuralına göre bu tam tersi olmalı (e-İrsaliye same-company/farklı-lokasyon için) | `trySendEirsaliyeForTransfer` çağrı noktası |
| F | Motor B'nin same-company (aynı şirket, farklı lokasyon) yolunda (`admin/transfer-olustur.service.ts` içindeki `if (kaynakSirketId === hedefSirketId)` bloğu) **hiçbir** e-İrsaliye denemesi yok | `olusturTransfer` |
| G | UTS altyapısı (`UtsSube`, `UtsBildirim`, `UtsDisFirma`, `gondermeBildiriminiYap`) var ve gerçek TİTCK API'sine bağlı, ama hiçbir transfer akışı bunu otomatik çağırmıyor — sadece `/admin/uts` ekranından manuel tetikleniyor | `admin.controller.ts` |
| H | "Stok Kontrol" ekranı (`StokKontrolTab.tsx`) Motor B'yi çağırıyor ama lot/UTS seçimi UI'da yok — backend otomatik ilk uygun lotu seçiyor | `stok.api.ts::olusturTransferTalebi` → `transfer-olustur.service.ts` |
| I | Garanti/İade ve Özel Sipariş modülleri `executeSirketlerArasiTransfer()`'ı **doğrudan** çağırıyor, `olusturTransfer` sarmalayıcısını atlıyor — merkezi aksiyon servisi eklenirse bu çağrı noktalarının da güncellenmesi gerekiyor | `admin.controller.ts`, `ozel-siparis.service.ts` |

---

## 4. Hedef mimari

```
              ┌─────────────────────────────────────────────┐
              │   TEK ÇEKİRDEK: transfer-core.service.ts     │
              │   (yeni dosya, admin/transfer-olustur +      │
              │    sirketler-arasi-transfer birleşimi)       │
              │                                               │
              │  1) Envanter hareketi (Odoo picking)         │
              │  2) → transfer-post-actions.service.ts       │
              │     çağrısı (senaryo tespiti + 3 aksiyon)    │
              └─────────────────────────────────────────────┘
                     ▲        ▲        ▲        ▲
                     │        │        │        │
     POS Transferler │  Admin Şube    │  Lot    │  Stok
     (/transfer/     │  Transferleri  │ Transfer│ Kontrol
      olustur)       │  (aynı route)  │         │
                     │                │         │
              Garanti/İade ──────┘    Özel Sipariş ──┘   Laboratuvar
```

Yeni/değişecek dosyalar:

1. **`backend/src/modules/transfer/transfer-post-actions.service.ts`** (yeni) — merkezi 4-aksiyon fonksiyonu
2. **`backend/src/modules/admin/transfer-olustur.service.ts`** ve **`sirketler-arasi-transfer.service.ts`** —
   çekirdek olarak korunur, iki adımlı hale getirilir, merkezi aksiyon servisini çağırır
3. **`backend/src/modules/transfer/transfer.service.ts`** — `createTransfer`/`acceptTransfer` kaldırılır,
   yerine çekirdeği çağıran ince bir adaptör bırakılır (route uyumluluğu için)
4. **`backend/src/modules/efatura/uyumsoft-efatura.service.ts`** — `tetikleTransferEFatura` gerçek kalem
   verisiyle çalışacak şekilde düzeltilir
5. **`backend/src/modules/uyumsoft/uyumsoft.service.ts`, `efatura/uyumsoft-irsaliye.service.ts`** — değişmez,
   olduğu gibi kullanılır
6. Prisma şeması — küçük eklemeler (Bölüm 5, Faz 1)

---

## 5. Uygulama fazları

### FAZ 1 — Veri modeli hazırlığı
- `TransferOlusturKalem` / `SirketlerArasiKalem` tiplerine `utsKodu?: string` ve `utsFirmaKodu?: string` alanı eklenecek
  (transfer kalemleri hazırlanırken ilgili `stock.lot`'tan `x_uts_kodu` okunup dolduracak — Motor B zaten lot
  okuyor, sadece bu alanı taşımak yeterli).
- `Branch` ↔ `UtsSube` ilişkisinden kaynak/hedef şubenin `kurumNo` değerini okuyacak bir yardımcı fonksiyon:
  `getUtsKurumNo(subeKodu: string): Promise<string | null>`.
- Yeni Prisma alanı gerekmiyor — mevcut `UtsSube.kurumNo`, `stock.lot.x_uts_kodu` yeterli. Sadece bir
  `TransferAksiyonLog` tablosu eklenmesi önerilir (opsiyonel ama önerilir): transferRef, aksiyon tipi
  (EFATURA/EIRSALIYE/UTS_VERME/UTS_ALMA), durum, hata, zaman — mevcut `TransferAdimLog` yapısına benzer,
  DB'ye kalıcı yazılmıyor şu an, bu da denetim/log açısından zayıf nokta.

### FAZ 2 — Merkezi "transfer-post-actions" servisi
Yeni dosya: `backend/src/modules/transfer/transfer-post-actions.service.ts`

Fonksiyon imzası (davranış tanımı, kod değil):

```
runTransferPostActions({
  transferRef, event: 'BASLATILDI' | 'KABUL_EDILDI',
  kaynak: { subeKodu, sirketId, sirketKodu },
  hedef: { subeKodu, sirketId, sirketKodu },
  kalemler: [{ productId, resolvedProductId, urunAdi, miktar, maliyet, lotId, utsKodu, utsFirmaKodu }]
}): Promise<TransferAksiyonSonuc>
```

Davranış:
1. `senaryo = kaynak.sirketId !== hedef.sirketId ? 'SIRKET_DEGISIYOR' : (kaynak.subeKodu !== hedef.subeKodu ? 'FARKLI_LOKASYON' : 'AYNI_LOKASYON')`
2. `AYNI_LOKASYON` ise hiçbir şey yapma (aynı depo içi raf hareketi, transfer değil).
3. `event === 'BASLATILDI'`:
   - `SIRKET_DEGISIYOR` → e-Fatura gönder (Bölüm 5 Faz 5) + kalemler içinde `utsKodu` dolu olanlar için UTS **VERME**
   - `FARKLI_LOKASYON` → e-İrsaliye gönder (mevcut `trySendEirsaliyeForTransfer` mantığı buraya taşınır) +
     kalemler içinde `utsKodu` dolu VE `kaynakUtsKurumNo !== hedefUtsKurumNo` olanlar için UTS **VERME**
4. `event === 'KABUL_EDILDI'`:
   - Her iki senaryoda da (varsa) aynı UTS koşuluyla UTS **ALMA** bildirimi gönder
   - e-Fatura/e-İrsaliye kabul anında **tekrar** tetiklenmez (gönderim anında zaten yapıldı)
5. Her aksiyon adımı ayrı try/catch ile sarılır — biri başarısız olsa da diğerleri denenir, hepsi
   `TransferAksiyonSonuc.adimlar[]` içine loglanır (mevcut `TransferAdimLog` desenine benzer şekilde).
6. Başarısız UTS/e-İrsaliye/e-Fatura adımları admin/muhasebe rolüne bildirim olarak düşer (mevcut
   `notifyEirsaliyeFailure`/`notifyManualIntervention` deseni genişletilir).

### FAZ 3 — Çekirdeği iki adımlı hale getirme
Şu an Motor B (`executeSirketlerArasiTransfer`) tek çağrıda hem kaynak çıkışını hem hedef girişini
`button_validate` ile tamamlıyor — "kabul" aşaması yok. Ama UTS VERME/ALMA ayrımı iki ayrı ana ihtiyaç
duyuyor. Bu yüzden:

- Çekirdek iki fonksiyona bölünecek:
  - `baslatTransfer(...)` — kaynak çıkış picking'i oluşturur + validate eder + (cross-company ise) Odoo
    fatura(lar)ını oluşturup postlar + `runTransferPostActions({event:'BASLATILDI', ...})` çağırır.
    Hedef giriş picking'i **draft/assigned** durumunda bırakılır (henüz validate edilmez).
  - `kabulEtTransfer(transferRef veya pickingId, sayimlar)` — hedef giriş picking'ini gerçek sayılan
    miktarlarla validate eder + `runTransferPostActions({event:'KABUL_EDILDI', ...})` çağırır.
- Bu, Motor A'nın zaten sahip olduğu "gönder → bekleyen → kabul" iş akışını Motor B'ye de kazandırır —
  yani şirketler arası transferler de artık "yolda" durumunda bekleyecek, karşı taraf kabul edince tamamlanacak.
- **Not:** Bu, mevcut davranışı değiştiren en riskli adım. Cursor bu fazı ayrı bir PR/commit olarak yapmalı
  ve mevcut "Lot Transfer" akışının anlık tamamlanma alışkanlığına göre çalışan kullanıcı beklentisini
  (mağaza ekibi bilgilendirilmeli) göz önünde bulundurmalı.

### FAZ 4 — Tüm giriş noktalarını çekirdeğe bağlama
- `POST /transfer/olustur` (`transfer.controller.ts`) → artık `transfer.service.ts::createTransfer` yerine
  yeni çekirdeğin `baslatTransfer` fonksiyonunu çağırır. Cross-company kontrolü (`SIRKETLER_ARASI` hatası)
  **kaldırılır**.
- `POST /transfer/kabul` → çekirdeğin `kabulEtTransfer` fonksiyonunu çağırır.
- `POST /admin/transfer-olustur` (Lot Transfer, Stok Kontrol) → aynı `baslatTransfer`'a bağlanır (zaten
  admin.controller.ts üzerinden `olusturTransfer`'ı çağırıyordu, artık `olusturTransfer` içi bu çekirdeğe
  yönlenir).
- `admin.controller.ts` içindeki Garanti/İade akışı ve `ozel-siparis.service.ts` içindeki özel sipariş akışı
  — `executeSirketlerArasiTransfer` doğrudan çağrısı yerine `baslatTransfer` (+ gerekiyorsa hemen ardından
  `kabulEtTransfer`, çünkü bu akışlarda "bekleyen kabul" adımı iş süreci olarak anlamsız olabilir — Cursor bu
  iki modülün ekranlarını kontrol edip karar vermeli, gerekirse kullanıcıya sorulmalı).
- `lab-incident.service.ts` — `olusturTransfer` çağrısı olduğu gibi kalır, çekirdek değiştiği için otomatik
  düzelir.
- `transfer.service.ts` dosyası büyük ölçüde silinir; sadece `listBekleyen`, `listGonderilen`,
  `reportTransferIssue`, `searchUrun*` gibi çekirdek-dışı yardımcı fonksiyonlar kalır.

### FAZ 5 — e-Fatura transfer entegrasyonunu düzeltme
- `tetikleTransferEFatura(transferId, branchCode)` fonksiyonu **gerçek kalem verisiyle** çağrılacak şekilde
  imza değişecek: `tetikleTransferEFatura(transferRef, kaynakBranchCode, hedefPartnerVkn, hedefPartnerAdi, kalemler)`.
- `runTransferPostActions` içindeki `SIRKET_DEGISIYOR` + `BASLATILDI` dalı bu fonksiyonu gerçek ürün adı/miktar/
  maliyet×1.05 birim fiyatıyla çağırır.
- Dönen Uyumsoft resmi fatura numarası (`sonuc.faturaNo`) ve `uuid`, transferin Odoo `account.move` kaydına
  referans olarak (`Fatura.transferId` alanı zaten var) yazılır — Not #50 böylece kapanır.
- Başarısız olursa mevcut `kuyrugaAl`/`FaturaKuyruk` + `efatura.cron.ts` (15 dk) mekanizması aynen kullanılır
  (zaten satış tarafında çalışıyor, transfer için de aynı kuyruk kullanılacak).

### FAZ 6 — UTS otomatik VERME/ALMA
- `admin.controller.ts` içindeki `gondermeBildiriminiYap()` fonksiyonu (ve etrafındaki `UtsBildirim` oluşturma
  mantığı, satır ~6425 `router.post('/uts/bildirim-olustur', ...)`) bir servis fonksiyonuna çıkarılır
  (örn. `uts.service.ts::bildirimOlusturVeGonder(tip, branchId, kalemler, karsiTaraf)`), böylece hem manuel
  ekran hem de `transfer-post-actions.service.ts` aynı fonksiyonu çağırabilir.
- `runTransferPostActions` bu fonksiyonu `tip: 'VERME'` (başlatma) veya `tip: 'ALMA'` (kabul) ile çağırır.
- Karşı taraf bilgisi (`karsiKurumNo`/`karsiVkn`): hedef/kaynak şubenin `UtsSube.kurumNo`'su, yoksa
  `UtsDisFirma` kaydından çözülür (cross-company durumunda karşı şirket bir "dış firma" gibi ele alınabilir
  — bu noktada Cursor'un mevcut `UtsDisFirma` verisiyle NG/ADESE/POTENTIAL şirketlerinin birbirine göre nasıl
  temsil edildiğini kontrol etmesi gerekiyor; şu an DB'de bu üç şirket birbirine karşı taraf olarak tanımlı
  değilse önce bu kayıtlar oluşturulmalı).

### FAZ 7 — Test senaryoları / kabul kriterleri
Cursor'un implementasyon sonunda şu senaryoları elle (veya test scripti ile) doğrulaması gerekiyor:

1. **NG (GVN2) → ADESE (GVN1), UTS'li ürün:** transfer başlatılınca → Odoo picking (draft/assigned) + Odoo
   satış/alım faturası oluşur + Uyumsoft'a gerçek e-Fatura gider (resmi numara döner) + UTS VERME bildirimi
   gider. ADESE tarafı kabul edince → picking validate olur + UTS ALMA bildirimi gider. e-İrsaliye
   **gitmemeli**.
2. **NG (GVN2) → ADESE (GVN1), UTS'siz ürün:** aynısı ama UTS adımları hiç tetiklenmemeli (hata değil, sessizce atlanmalı).
3. **ADESE (GVN1) → ADESE (GVN3), UTS'li ve kurum no'ları farklı:** e-İrsaliye gider, e-Fatura gitmemeli,
   UTS VERME/ALMA gider.
4. **ADESE (GVN1) → ADESE (GVN3), UTS'li ama kurum no'ları aynı:** e-İrsaliye gider, UTS **hiç gitmemeli**.
5. **POS "Şube Transferleri" ekranından NG→ADESE:** senaryo 1 ile birebir aynı sonucu vermeli (ekran farkı
   davranışı değiştirmemeli).
6. **Stok Kontrol'den "Transfer Talebi Oluştur":** artık lot otomatik seçilse bile, seçilen lotun UTS kodu
   doğru okunup yukarıdaki kurallara tabi olmalı.
7. Her senaryoda `Fatura`/`FaturaKuyruk`/`UtsBildirim` tablolarında transferRef ile eşlenebilir kayıt oluşmalı
   (denetim izi).

---

## 6. Açık kararlar — çözüldü (13.07.2026)

**6.1 — Garanti/İade ve Özel Sipariş'te kabul adımı**
Karar: **Otomatik ardışık.** Bu iki akış teknik olarak yine `baslatTransfer` + `kabulEtTransfer`'i sırayla
çağırır (UTS VERME ve ALMA ikisi de gönderilir, denetim izi iki ayrı adım olarak kalır), ama kullanıcıya
ekstra bir "bekleyen kabul" ekranı çıkmaz — sistem `baslatTransfer` başarılı olur olmaz `kabulEtTransfer`'i
otomatik tetikler. Böylece hem UTS'nin VERME/ALMA ayrımı korunur hem de mevcut tek-tık kullanıcı deneyimi
bozulmaz. Bu davranış Lot Transfer / Şube Transferleri / Stok Kontrol'deki **gerçek** iki aşamalı (karşı
tarafın elle kabul ettiği) akıştan farklıdır — Cursor bu ayrımı net kodlamalı: Garanti/İade ve Özel
Sipariş'te `kabulEtTransfer` çağrısı insan müdahalesi beklemeden otomatik yapılır, diğer dört giriş
noktasında karşı taraf elle kabul eder.

**6.2 — Mağaza ekibine duyuru**
Karar: **Gerekmiyor.** Duyuru metni hazırlanmayacak — kullanıcı gerekirse ilgili kişilere kendisi anlatacak.

**6.3 — `UtsDisFirma` tablosunda NG/ADESE/POTENTIAL karşılıklı tanımlı mı?**
Kod tarafında kontrol edildi: `UtsDisFirma` tablosu için hiçbir seed/migration verisi yok
(`prisma/seed.ts` içinde `UtsDisFirma` hiç geçmiyor) — bu tablo tamamen `/admin/uts` ekranından elle
doldurulan bir tablo. Yani NG/ADESE/POTENTIAL'ın birbirine "dış firma" olarak tanımlı olup olmadığı canlı
veritabanı durumuna bağlı, koddan kesin cevap veremem (canlı Postgres'e buradan erişimim yok).
**Cursor'un Faz 6'ya başlamadan önce yapması gereken:** `SELECT * FROM "UtsDisFirma"` ile kontrol etsin;
NG/ADESE/POTENTIAL üçü birbirine karşı taraf olarak tanımlı değilse, Faz 6'nın bir parçası olarak bu 3
kaydı (her biri diğer ikisinin VKN'sini karşı taraf olarak görecek şekilde) otomatik migration/seed ile
oluştursun — kullanıcıdan elle 3 firma girmesini beklemeye gerek yok, VKN'ler zaten
`uyumsoft-efatura.service.ts` içindeki `NG_VKN`/`UYUMSOFT_ADESE_VKN`/`UYUMSOFT_POTENTIAL_VKN` ortam
değişkenlerinde ve `SirketAyar` tablosunda mevcut.

---

## 7. Cursor'a not

Bu dokümandaki fonksiyon isimleri ve dosya yolları **tasarım niyeti** ifade eder, birebir bu isimlerle
uygulamak zorunlu değildir — ama davranış kuralları (Bölüm 2 ve Bölüm 5) birebir uygulanmalıdır. Her faz
bittiğinde Bölüm 5 Faz 7'deki test senaryoları elle doğrulanmalı ve sonuç kullanıcıya raporlanmalıdır.
