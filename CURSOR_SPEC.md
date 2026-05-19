# OPTİK MAĞAZA POS — CURSOR PROJE SPEC V2
> V1'in üzerine eklendi. Tüm yeni kararlar burada.
> Cursor bu dosyayı baştan sona okur. Kendi kararıyla hiçbir şey eklemez.

---

## MEVCUT DURUM (V1'de tamamlananlar)
- ✅ Klasör yapısı oluşturuldu
- ✅ Prisma schema yazıldı ve migrate edildi
- ✅ Auth modülü tamamlandı (login, PIN, JWT, kilit)
- ✅ Seed: admin kullanıcısı + PILOT01 şube
- ✅ Docker: PostgreSQL ayakta, port 5432
- ✅ Backend port 3000'de çalışıyor

## SIRADAKI ADIM
Shift modülü → Customer modülü → Product modülü → Sale modülü

---

## DEĞİŞEN / EKLENEN: VERİTABANI

### 1. Product tablosu — TAMAMEN YENİDEN YAZILDI

Eski `ProductCategory` enum'u yetersız. Yeni yapı:

```prisma
model Product {
  id            String          @id @default(uuid())
  barcode       String?         @unique
  name          String
  productType   ProductType     // READY veya PRESCRIBED
  category      ProductCategory // Ana kategori
  subCategory   String?         // Alt kategori (serbest metin)
  group         ProductGroup?   // Fiyat/rapor grubu
  price         Decimal         @db.Decimal(10,2)
  taxRate       Decimal         @db.Decimal(5,2) @default(20)
  brand         String?         // Marka
  model         String?         // Model
  isActive      Boolean         @default(true)
  odooId        String?
  saleItems     SaleItem[]
}

enum ProductType {
  READY       // Hazır ürün — reçete gerekmez
  PRESCRIBED  // Reçeteli ürün — reçete gerekir
}

enum ProductCategory {
  // HAZIR ÜRÜNLER
  SUNGLASSES_READY      // Hazır güneş gözlüğü
  OPTICAL_FRAME_READY   // Hazır optik çerçeve
  CONTACT_LENS_READY    // Hazır lens (renkli vs.)
  SOLUTION              // Solüsyon
  ACCESSORY             // Aksesuar

  // REÇETELİ ÜRÜNLER
  SUNGLASSES_RX         // Reçeteli güneş gözlüğü (çerçeve)
  OPTICAL_FRAME_RX      // Reçeteli optik çerçeve
  LENS_RX               // Reçeteli cam (optik)
  CONTACT_LENS_RX       // Reçeteli kontak lens
}

enum ProductGroup {
  // Güneş ve optik çerçeve için
  UPPER         // Üst grup
  UPPER_MID     // Orta üst grup
  MID           // Orta grup
  LOWER         // Alt grup

  // Cam için
  PROGRESSIVE_UPPER
  PROGRESSIVE_UPPER_MID
  PROGRESSIVE_MID
  PROGRESSIVE_LOWER
  OFFICE_LENS
  SPECIAL_LENS
  SINGLE_CUSTOM     // Kişiye özel tek odaklı
  SINGLE_NON_STOCK  // Stok dışı üretim
  SINGLE_STOCK      // Stok cam

  // Lens için
  CONTACT_SPH
  CONTACT_DAILY
  CONTACT_TORIC
  CONTACT_MULTIFOCAL
  CONTACT_COLORED_RX
}
```

### 2. SaleItem tablosu — GENİŞLETİLDİ

Her kalem artık bağımsız bir iş birimi. Reçete ve çerçeve bilgisi kaleme bağlı.

```prisma
model SaleItem {
  id              String       @id @default(uuid())
  saleId          String
  productId       String
  qty             Int          @default(1)
  unitPrice       Decimal      @db.Decimal(10,2)
  discount        Decimal      @db.Decimal(10,2) @default(0)
  taxAmount       Decimal      @db.Decimal(10,2)
  lineTotal       Decimal      @db.Decimal(10,2)

  // BAĞLANTI — bu kalem başka bir kaleme bağlı mı?
  // Örnek: cam kalemi → çerçeve kalemine bağlı
  linkedItemId    String?      // SaleItem.id
  linkType        LinkType?    // FRAME_LENS = çerçeve-cam bağlantısı

  // REÇETE — sadece reçeteli ürünlerde dolu
  prescription    Prescription?

  // ÇERÇEVE — sadece çerçeve kalemlerinde dolu
  frames          Frame[]

  // DURUM — her kalemin kendi durumu var
  status          ItemStatus   @default(PENDING)

  sale            Sale         @relation(fields: [saleId], references: [id])
  product         Product      @relation(fields: [productId], references: [id])
}

enum LinkType {
  FRAME_LENS        // Cam bu çerçeveye takılacak
  CUSTOMER_FRAME    // Müşterinin kendi çerçevesi (sipariş yok)
}

enum ItemStatus {
  PENDING     // Bekliyor
  ORDERED     // Siparişe verildi
  IN_LAB      // Laboratuvarda
  READY       // Hazır
  DELIVERED   // Teslim edildi
  VOID        // İptal
}
```

### 3. Prescription (Reçete) — YENİ MODEL

Cam reçetesi ve lens reçetesi ayrıdır.

```prisma
model Prescription {
  id            String           @id @default(uuid())
  saleItemId    String           @unique
  prescriptionType PrescriptionType

  // CAM REÇETESİ — Uzak / Yakın / Güneş / Bifokal
  // Sağ göz (R)
  r_pd          Decimal?         @db.Decimal(5,2)
  r_sph         Decimal?         @db.Decimal(5,2)
  r_cyl         Decimal?         @db.Decimal(5,2)
  r_aks         Int?
  r_add         Decimal?         @db.Decimal(5,2)

  // Sol göz (L)
  l_pd          Decimal?         @db.Decimal(5,2)
  l_sph         Decimal?         @db.Decimal(5,2)
  l_cyl         Decimal?         @db.Decimal(5,2)
  l_aks         Int?
  l_add         Decimal?         @db.Decimal(5,2)

  // Yakın (progressif/bifokal için — ADD'den hesaplanır ama kaydedilir)
  near_r_sph    Decimal?         @db.Decimal(5,2)
  near_l_sph    Decimal?         @db.Decimal(5,2)

  // LENS REÇETESİ — Cam reçetesinden FARKLI olabilir
  lens_r_sph    Decimal?         @db.Decimal(5,2)
  lens_r_cyl    Decimal?         @db.Decimal(5,2)
  lens_r_aks    Int?
  lens_r_bc     Decimal?         @db.Decimal(5,2)  // Base curve
  lens_r_dia    Decimal?         @db.Decimal(5,2)  // Diameter
  lens_r_add    Decimal?         @db.Decimal(5,2)
  lens_r_color  String?          // Renk (serbest metin)
  lens_r_brand  String?

  lens_l_sph    Decimal?         @db.Decimal(5,2)
  lens_l_cyl    Decimal?         @db.Decimal(5,2)
  lens_l_aks    Int?
  lens_l_bc     Decimal?         @db.Decimal(5,2)
  lens_l_dia    Decimal?         @db.Decimal(5,2)
  lens_l_add    Decimal?         @db.Decimal(5,2)
  lens_l_color  String?
  lens_l_brand  String?

  // Solüsyon
  solution      String?
  solutionQty   Int?

  // Kaynak
  prescriptionSource PrescriptionSource @default(MANUAL)
  doctorName    String?
  prescriptionDate DateTime?
  eReceteCode   String?

  saleItem      SaleItem         @relation(fields: [saleItemId], references: [id])
}

enum PrescriptionType {
  SINGLE        // Tek odak (uzak VEYA yakın)
  PROGRESSIVE   // Progressif (uzak + ADD → yakın otomatik)
  BIFOCAL       // Bifokal
  SUNGLASSES    // Güneş camı (reçeteli)
  CONTACT_LENS  // Kontak lens reçetesi
}

enum PrescriptionSource {
  MANUAL        // Elle girildi
  DOCTOR_RX     // Doktor reçetesi
  OLD_GLASSES   // Eski gözlükten ölçüldü
}
```

### 4. Frame (Çerçeve) — YENİ MODEL

Bir sale item'a birden fazla çerçeve eklenebilir.

```prisma
model Frame {
  id            String    @id @default(uuid())
  saleItemId    String
  sortOrder     Int       @default(1)  // Çerçeve 1, 2, 3...

  // Barkod / ürün kodu
  barcode       String?
  brand         String?
  model         String?

  // Ölçüler
  h             Decimal?  @db.Decimal(5,2)  // Yükseklik
  cap           Decimal?  @db.Decimal(5,2)  // Çap
  vertex        Decimal?  @db.Decimal(5,2)  // Verteks
  pantos        Decimal?  @db.Decimal(5,2)  // Pantos
  frameAngle    Decimal?  @db.Decimal(5,2)  // Çerçeve açısı

  saleItem      SaleItem  @relation(fields: [saleItemId], references: [id])
}
```

---

## DEĞİŞEN: SİPARİŞ AKIŞI (SCREEN 4)

### Yeni satış akışı — 5 adım

```
ADIM 1: MÜŞTERİ
  → Telefon/ad ile ara
  → Bulunamazsa hızlı oluştur

ADIM 2: SİPARİŞ KALEMLERİ  ← EN BÜYÜK DEĞİŞİKLİK
  → Kalem kalem ekleme
  → Her kalem bağımsız veya bağlantılı

ADIM 3: FİYATLANDIRMA
  → Her kalem ayrı fiyat + indirim
  → Toplam otomatik

ADIM 4: ÖDEME
  → Split payment (nakit + kart + havale)
  → Kart → banka + POS + taksit → komisyon otomatik

ADIM 5: DURUM & KAYDET
  → Her kalem için ayrı durum (teslim / lab / sipariş)
  → Teslim tarihi
  → Kaydet → DB + Odoo sync
```

---

## YENİ SCREEN: SİPARİŞ KALEMLERİ (ADIM 2)

```
Route: /sales/new → step: items

EKRAN YAPISI:
Sol taraf (geniş): Kalem listesi
Sağ taraf (dar):   Sipariş özeti + fiyat toplamı

─────────────────────────────────────────
[+ Kalem Ekle] butonu → modal açılır:

KALEM TİPİ SEÇ:
  🕶  Optik Çerçeve      (hazır veya reçeteli)
  ☀️  Güneş Gözlüğü     (hazır veya reçeteli)
  👁  Cam Siparişi       (her zaman reçeteli)
  🔍  Kontak Lens        (hazır veya reçeteli)
  ✨  Aksesuar / Diğer   (her zaman hazır)
  💧  Solüsyon           (her zaman hazır)

─────────────────────────────────────────

Seçime göre kalem formu açılır:

EĞER ÇERÇEVE seçildiyse:
  → Hazır mı / Reçeteli mi? (toggle)
  → Ürün ara (barkod veya metin)
  → Grup seç (üst/ortaüst/orta/alt)
  → Fiyat
  → Eğer reçeteli: \"Bu çerçeveye cam eklenecek mi?\" → EVET ise cam kalemi otomatik eklenir ve bağlanır

EĞER CAM seçildiyse:
  → Cam tipi: Tek Odak / Progressif / Bifokal / Ofis / Özel
  → Cam grubu (üst prog / orta prog / stok vb.)
  → Hangi çerçeveye? 
      - Siparişte çerçeve varsa → seç
      - \"Müşterinin kendi çerçevesi\" seçeneği
  → Reçete gir:
      PrescriptionType seç → ilgili alanlar açılır
      ADD girilirse Yakın SPH otomatik hesaplanır
  → Çerçeve ölçüleri (H, ÇAP, Verteks, Pantos, Açı)
      + Barkod / Marka / Model
      + birden fazla çerçeve eklenebilir (+ Çerçeve Ekle)

EĞER GÜNEŞ seçildiyse:
  → Hazır mı / Reçeteli mi?
  → Hazırsa: ürün ara, grup seç, fiyat
  → Reçeteli ise: cam tipi (düz / progressif güneş) + reçete + çerçeve ölçüleri

EĞER KONTAK LENS seçildiyse:
  → Hazır mı / Reçeteli mi?
  → Hazırsa: marka, model, renk, adet, fiyat
  → Reçeteli ise: lens reçetesi gir (cam reçetesinden BAĞIMSIZ)
      SPH, CYL, AKS, B.C., DIA, ADD (multifokal için), Renk, Marka
      R ve L ayrı ayrı

EĞER AKSESUAR / SOLÜSYON seçildiyse:
  → Ürün ara, adet, fiyat
  → Reçete yok

─────────────────────────────────────────

EKLENMİŞ KALEMLER LİSTESİ:

Her kalem bir kart olarak görünür:

┌─────────────────────────────────────────┐
│ [ikon] Optik Çerçeve — Ray-Ban RB3025  │
│        Grup: Üst | 4.500 ₺             │
│        🔗 Cam #2 bağlı                 │
│        [Düzenle] [Kaldır]              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [ikon] Progressif Cam — Üst Grup       │
│        🔗 Çerçeve #1'e takılacak       │
│        R: -2.00 / -1.00 / 10 / ADD:2  │
│        L: -2.00 / -1.00 / 10 / ADD:2  │
│        Yakın: R:0.00 L:0.00 (otomatik) │
│        4.800 ₺ [Düzenle] [Kaldır]     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [ikon] Kontak Lens — Renkli (Hazır)    │
│        Marka: Freshlook | Renk: Yeşil  │
│        2 kutu × 450 ₺ = 900 ₺          │
│        [Düzenle] [Kaldır]              │
└─────────────────────────────────────────┘
```

---

## ADD HESAPLAMA MOTORU (Frontend + Backend)

```typescript
// packages/shared/utils/prescription.utils.ts

export function calcNearSph(farSph: number, add: number): number {
  // Yakın SPH = Uzak SPH + ADD
  return Math.round((farSph + add) * 100) / 100;
}

export function calcNearFromPrescription(rx: {
  r_sph: number; r_add: number;
  l_sph: number; l_add: number;
}): { near_r_sph: number; near_l_sph: number } {
  return {
    near_r_sph: calcNearSph(rx.r_sph, rx.r_add),
    near_l_sph: calcNearSph(rx.l_sph, rx.l_add),
  };
}

// Backend'de de aynı fonksiyon çalışır — frontend hesabına güvenme
// POST /api/sales/items ile gelen reçetede ADD varsa
// backend near_r_sph ve near_l_sph değerlerini yeniden hesaplar ve kaydeder
```

---

## ÜRÜN YAPISI — KATEGORİ AĞACI

```
HAZIR ÜRÜNLER (ProductType.READY)
├── Güneş Gözlüğü (SUNGLASSES_READY)
│   ├── Üst Grup
│   ├── Orta Üst Grup
│   ├── Orta Grup
│   └── Alt Grup
├── Optik Çerçeve (OPTICAL_FRAME_READY)
│   ├── Üst Grup
│   ├── Orta Üst Grup
│   ├── Orta Grup
│   └── Alt Grup
├── Kontak Lens Hazır (CONTACT_LENS_READY)
│   └── Renkli Lensler
├── Solüsyon (SOLUTION)
└── Aksesuar (ACCESSORY)

REÇETELİ ÜRÜNLER (ProductType.PRESCRIBED)
├── Güneş Gözlüğü Çerçeve (SUNGLASSES_RX)
│   ├── Üst Grup
│   ├── Orta Üst Grup
│   ├── Orta Grup
│   └── Alt Grup
├── Optik Çerçeve (OPTICAL_FRAME_RX)
│   ├── Üst Grup
│   ├── Orta Üst Grup
│   ├── Orta Grup
│   └── Alt Grup
├── Cam (LENS_RX)
│   ├── Progressif
│   │   ├── Üst Progressif
│   │   ├── Orta Üst Progressif
│   │   ├── Orta Progressif
│   │   └── Alt Progressif
│   ├── Ofis Camları
│   ├── Özel Camlar
│   └── Tek Odaklı
│       ├── Kişiye Özel
│       ├── Stok Dışı Üretim
│       └── Stok Cam
└── Kontak Lens (CONTACT_LENS_RX)
    ├── SPH Lensler
    ├── Günlük Lensler
    ├── Toric Lensler
    └── Multifokal Lensler
```

---

## YENİ API ENDPOINT'LERİ

```
SALE ITEMS
POST   /api/sales/:id/items              → kalem ekle
PUT    /api/sales/:id/items/:itemId      → kalem güncelle
PATCH  /api/sales/:id/items/:itemId/status → kalem durumu güncelle
DELETE /api/sales/:id/items/:itemId      → kalem void (status=VOID)

PRESCRIPTIONS
POST   /api/sale-items/:id/prescription  → reçete ekle/güncelle
GET    /api/sale-items/:id/prescription  → reçete getir
POST   /api/prescriptions/calc-near      → ADD hesabı (near SPH)

FRAMES
POST   /api/sale-items/:id/frames        → çerçeve ekle
PUT    /api/sale-items/:id/frames/:fid   → çerçeve güncelle
DELETE /api/sale-items/:id/frames/:fid   → çerçeve sil

PRODUCTS (genişletildi)
GET    /api/products?type=READY&category=SUNGLASSES_READY
GET    /api/products?type=PRESCRIBED&category=LENS_RX&group=PROGRESSIVE_UPPER
GET    /api/products/by-barcode/:barcode
```

---

## DURUM MAKİNESİ — KALEM BAZLI (YENİ)

Her SaleItem kendi durumunu taşır. Sale durumu kalemlerden türetilir.

```
KALEM DURUMU:
PENDING → ORDERED → IN_LAB → READY → DELIVERED
                                    ↑
Her kalem ayrı laboratuvara gidebilir.
Teslim edilenler DELIVERED, bekleyenler IN_LAB kalır.

SATIŞ DURUMU (kalemlerden türetilir):
- Tüm kalemler DELIVERED → Sale: DELIVERED
- En az bir kalem IN_LAB veya ORDERED → Sale: IN_LAB
- Tüm kalemler PENDING → Sale: PAID
- Herhangi bir kalem VOID → sadece o kalem void, satış devam eder
- Satışın tamamı VOID → Sale: VOID (müdür yetkisi)
```

---

## MIGRATION NOTU

V1 schema'da `SaleItem` modeli basitti. Şimdi genişledi.
Yeni migration adımları:

```bash
# 1. schema.prisma'yı güncelle (yukarıdaki modeller)
# 2. Migration çalıştır
npx prisma migrate dev --name sale_items_v2

# 3. Seed'i güncelle — örnek ürün kategorileri ekle
```

---

## CURSOR'A TALİMAT — SIRADAKI ADIMLAR

```
Şu anda backend'de auth modülü tamamlandı.
Sırayla şunları yap:

ADIM 1: schema.prisma'yı güncelle
  - Product modelini V2'deki gibi yeniden yaz
  - SaleItem'a linkedItemId, linkType, status ekle
  - Prescription modelini ekle
  - Frame modelini ekle
  - Enum'ları ekle: ProductType, LinkType, ItemStatus,
    PrescriptionType, PrescriptionSource, ProductGroup
  - npx prisma migrate dev --name sale_items_v2

ADIM 2: Shift modülü
  - POST /api/shifts/open
      Kontrol: aynı şubede OPEN shift varsa HATA
      DB: shifts INSERT, status=OPEN
      JWT'ye shiftId ekle
  - POST /api/shifts/close
      Kontrol: STORE_MANAGER veya ADMIN yetkisi
      Alanlar: physicalCash, diffReason
      Hesapla: diff = physicalCash - expectedCash
      DB: shifts UPDATE, status=CLOSED, closedAt=now()
      Kural: CLOSED shift tekrar açılamaz
  - GET /api/shifts/current
      Şubenin aktif shift'ini döner

ADIM 3: Customer modülü
  - GET /api/customers?q=...
      q: telefon veya ad soyad (ILIKE her ikisi de)
      Min 3 karakter arama
  - POST /api/customers
      Zod: name (min 2), phone (unique), note?, reçete?
  - GET /api/customers/:id
      Müşteri + son 5 satışı

ADIM 4: Product modülü
  - GET /api/products
      Query: type?, category?, group?, q?, barcode?
  - GET /api/products/by-barcode/:barcode
  - GET /api/products/favorites
      Son 30 günde en çok satılan 20 ürün
  - Seed'e örnek ürünler ekle:
      Her kategori için en az 2-3 örnek

ADIM 5: Sale + SaleItem modülü
  - POST /api/sales → boş satış oluştur (DRAFT)
  - POST /api/sales/:id/items → kalem ekle
      Reçeteli ürünse prescription zorunlu değil ama uyarı ver
      ADD varsa near_sph backend'de hesapla ve kaydet
  - PUT /api/sales/:id/items/:itemId → kalem güncelle
  - POST /api/sales/:id/confirm → satışı onayla (DRAFT→PAID)
      Split payment toplamı = netTotal olmalı (validasyon)
  - POST /api/sales/:id/void → satışı iptal et
      Yetki: STORE_MANAGER veya ADMIN
      voidReason zorunlu

Bunların dışında hiçbir şey ekleme.
Her adımı bitirince dur ve bildir.
```

---

## KRİTİK İŞ KURALLARI (V2 EKLEMELERİ)

9. **Cam kalemi her zaman bir çerçeveye bağlı olmalı** — ya siparişte çerçeve var (linkedItemId), ya da \"müşterinin kendi çerçevesi\" (linkType=CUSTOMER_FRAME). İkisi de yoksa backend HATA döner.

10. **ADD değeri girilirse near_sph backend'de hesaplanır** — frontend hesabına güvenilmez, backend her zaman yeniden hesaplar: near_sph = far_sph + add.

11. **Lens reçetesi cam reçetesinden bağımsızdır** — aynı sale item'da ikisi ayrı alan grubunda tutulur.

12. **Çerçeve ölçüleri (Frame) her zaman kalemin bir parçasıdır** — ayrı bir ürün değil, SaleItem'a bağlı bir kayıttır.

13. **Kalem void edilince satış devam eder** — sadece o kalemin status'u VOID olur. Tüm satışı void etmek için müdür yetkisi gerekir.

---

*Bu dosya CURSOR_SPEC.md olarak proje köküne kaydedilmeli ve V1'in yerini almalıdır.*
