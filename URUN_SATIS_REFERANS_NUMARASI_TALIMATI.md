# Ürün ve satış için iç referans numarası ekle (GVNU / GVNS)

## Amaç

Ürün kataloğu ve satışlara, Odoo'dan bağımsız, sadece bizim sistemimize ait okunabilir bir
referans/fiş numarası eklemek. Şu an ne `Product` ne `Sale` modelinde böyle bir alan var —
ekranlarda görünen "S00061" gibi numaralar Odoo'nun kendi `sale.order` sequence'i, bizim
değil. Bu numara Odoo'ya YAZILMAYACAK, sadece bizim veritabanımızda tutulup POS/admin
ekranlarında gösterilecek.

## Format (kesinleşti)

- **Ürün:** `GVNU-YYYYAAGG-sıra` — örn. `GVNU-20260716-00001`
  - Şubeden bağımsız, global günlük sıra.
  - Verilme anı: yeni bir katalog ürünü (`Product` tablosuna yeni satır) oluşturulduğunda —
    **placeholder ürün (`__ODOO_PLACEHOLDER__`) hariç**, ona numara verilmesin.
- **Satış:** `GVNS-YYYYAAGG-ŞUBEKODU-sıra` — örn. `GVNS-20260716-GVN2-00003`
  - Şubeye özel günlük sıra (her şube kendi 00001'inden başlar).
  - Verilme anı: satış **onaylandığında** (`confirmSale` — draft aşamasında değil, taslak
    satışlar iptal/terk edilebiliyor, numarayı sadece gerçekten tamamlanan satışlara verelim).
    Bu noktayı uygulamadan önce bana kısaca teyit edin, farklı bir yer daha mantıklı geliyorsa
    söyleyin.
- **Sıra mantığı:** her gün 00001'den başlar (günlük sıfırlanan). `YYYYAAGG` = yıl-ay-gün
  (örn. 16 Temmuz 2026 → `20260716`).

## Kapsam dışı (bilinçli karar)

- Odoo tarafına hiç yazılmayacak — sadece Postgres'te yeni bir alan, POS/admin ekranlarında
  gösterim.
- Geçmiş (zaten var olan) `Sale`/`Product` kayıtlarına geriye dönük numara **verilmeyecek** —
  yeni alan nullable olacak, eski kayıtlarda boş kalacak, migration'da doldurma yapmayın.

## Kritik teknik nokta — eşzamanlılık (race condition)

Birden fazla şube/kullanıcı aynı anda satış onaylayabiliyor (multi-branch POS). Sıra
numarasını "son numarayı oku + 1 ekle" şeklinde naif yaparsanız, eşzamanlı iki satış aynı
numarayı alabilir. Bunun için:

1. Yeni bir `SequenceCounter` tablosu ekleyin (Prisma):
   ```prisma
   model SequenceCounter {
     key       String   @id   // örn. "URUN-20260716" veya "SATIS-20260716-GVN2"
     deger     Int      @default(0)
     updatedAt DateTime @updatedAt
   }
   ```
2. Numara üretimini **atomik** yapın — Postgres'in `INSERT ... ON CONFLICT (key) DO UPDATE SET
   deger = "SequenceCounter".deger + 1 RETURNING deger` deseni (Prisma'da `$queryRaw` ile) veya
   eşdeğer bir atomik upsert kullanın. İki ayrı `findUnique` + `update` adımıyla yapmayın — bu
   yarış durumuna açık.
3. Bu fonksiyonu tek bir yardımcı dosyada (örn. `backend/src/modules/shared/referans-no.util.ts`)
   toplayın: `generateUrunReferansNo()` ve `generateSatisReferansNo(subeKodu: string)`.

## Şema değişikliği

- `Product` modeline: `referansNo String? @unique`
- `Sale` modeline: `referansNo String? @unique`
- Migration: sadece yeni sütun ekleyin (nullable), geçmiş veriye dokunmayın.

## Uygulama noktaları

1. Ürün oluşturma akışının backend'deki gerçek giriş noktasını bulun (muhtemelen admin panel
   "yeni ürün" endpoint'i) — placeholder ürün oluşturma yolunu (`getOdooPlaceholderProduct`)
   **atlayın**, ona numara verilmesin.
2. `sale.service.ts` → `confirmSale()` içinde, satış başarıyla onaylandıktan sonra
   `generateSatisReferansNo(subeKodu)` çağırıp `Sale.referansNo`'yu doldurun.
3. POS ekranlarında (satış detayı, fiş/makbuz varsa) ve admin panelde ilgili listelerde bu
   numarayı görünür yapın — nerelerde göstereceğinizi kısa bir liste olarak raporlayın, ben
   onaylarım.

## Test

- Aynı şubeden art arda 2-3 satış onaylayıp sıranın doğru ilerlediğini gösterin.
- Farklı şubelerden (örn. GVN2 ve GVN3) aynı gün içinde satış yapıp her şubenin kendi
  00001'inden başladığını gösterin.
- Mümkünse eşzamanlı (paralel) birkaç satış isteği gönderip numaraların çakışmadığını
  doğrulayın (basit bir script ile art arda hızlı çağrı yeterli, gerçek yük testi gerekmiyor).
- Yeni ürün oluşturup `GVNU-...` numarasının doğru üretildiğini, placeholder ürüne numara
  verilmediğini gösterin.

## Rapor formatı

Şema değişikliği + `SequenceCounter` yaklaşımının kısa açıklaması + test ekran görüntüleri/logları
+ satış numarasının hangi noktada üretildiğinin teyidi (draft mı, onay mı — yukarıda sorduğum
nokta).
