# E-ticaret sitesi için harici stok/lokasyon API'si — sıfırdan kurulum

## Durum

Görkem, yaptıracağı e-ticaret sitesinin geliştiricilerine ürün stok bilgisini ve bu stokun hangi
şube/lokasyonda olduğunu API üzerinden vermek istiyor. Şu an sistemde buna uygun, dışarıya açık bir
API yok.

## Mevcut durum (araştırıldı — kodda doğrulandı)

- Stok verisi Postgres'te değil, canlı olarak Odoo'dan okunuyor (`stock.quant`, XML-RPC).
  `Product` modelinde (`schema.prisma`, satır ~201) hiç stok/miktar alanı yok, sadece `odooId` ile
  Odoo ürününe bağlanıyor.
- Şube bazlı stok döndüren iki iç endpoint zaten var (`backend/src/modules/admin/admin.controller.ts`):
  - `GET /api/admin/stok-kontrol-urun?productId=` → `stok-yonetimi.service.ts`,
    `getUrunStokTumSubeler(productId)`, dönen şekil: `{ productId, urunAdi, lokasyonlar: [{ kod,
    miktar, reserved, kullanilabilir }], toplamStok }`.
  - `GET /api/admin/lokasyon-stok?lokasyonId=&q=` — lokasyon bazlı ürün listesi.
  Bunlar JWT ile login olmuş admin kullanıcısı varsayıyor, dışarıya güvenli şekilde açılamaz.
- **Hiçbir API-key/machine-to-machine kimlik doğrulama mekanizması yok.** Mevcut tek auth
  (`backend/src/middleware/authenticate.ts`) JWT + interaktif kullanıcı varsayıyor.
- CORS şu an tamamen açık (`app.use(cors())`, kısıtlama yok) — dışarıya açılacak bu API'nin
  kimlik doğrulaması buna bağlı kalmamalı, API anahtarı asıl koruma olmalı.
- Rate limiting, API dokümantasyonu (Swagger/OpenAPI) hiç yok — bu yeni API için sıfırdan
  kurulacak.

## Görkem'in kararları

- Kapsam: **tüm şubelerin stok bilgisi** dönsün (sadece toplam değil, şube bazlı kırılım da olsun).
- Kimlik doğrulama: **sabit API anahtarı** (X-Api-Key header) yeterli, OAuth/token yenileme gibi
  karmaşık bir sisteme gerek yok.

## İstenen

### 1. Yeni, izole bir "harici API" katmanı kurun

1. Yeni bir router: `backend/src/modules/ecommerce-api/` (veya benzer isim) altında
   `ecommerce-api.controller.ts`, `app.ts`'e `/api/external` prefix'iyle mount edin. Mevcut
   `/api/admin` gibi iç router'lardan tamamen ayrı tutun, aynı dosyaya karıştırmayın.
2. Yeni bir middleware: `backend/src/middleware/apiKeyAuth.ts` — `X-Api-Key` header'ını okuyup
   `.env`'deki `ECOMMERCE_API_KEY` ile karşılaştırsın, uyuşmazsa `401`. Bu middleware'i sadece bu
   yeni router'a uygulayın, mevcut JWT `authenticate` ile karıştırmayın.
3. `.env`'e `ECOMMERCE_API_KEY=` için güçlü, rastgele bir değer üretip ekleyin (ör. 32+ karakter
   rastgele string) — Görkem'e bu anahtarı ayrıca, raporun dışında güvenli şekilde iletin (ör.
   "değeri .env dosyasında, ayrıca burada da yazıyorum: ..." gibi rapor içinde açık yazabilirsiniz,
   üretim ortamına taşınırken değiştirilmesi gerektiğini not edin).

### 2. Uç noktalar

1. `GET /api/external/products` — aktif ürünlerin listesi: `{ barkod, ad, kategori, fiyat }` gibi
   SADECE dışarıya verilmesi güvenli alanlar (maliyet fiyatı, iç referans gibi hassas alanları
   KESİNLİKLE dahil etmeyin). Sayfalama ekleyin (`?page=&pageSize=`), tüm katalog tek seferde
   dönmesin.
2. `GET /api/external/stock` — TÜM ürünlerin TÜM şubelerdeki stok kırılımı, toplu/sayfalanmış:
   ```json
   {
     "data": [
       {
         "barkod": "...",
         "urunAdi": "...",
         "toplamStok": 12,
         "subeler": [
           { "subeKodu": "GVN1", "subeAdi": "Güven Optik 1959 1", "miktar": 3 },
           { "subeKodu": "ANADEPO", "subeAdi": "Ana Depo", "miktar": 9 }
         ]
       }
     ],
     "page": 1, "pageSize": 100, "totalCount": 543
   }
   ```
   Mevcut `getUrunStokTumSubeler()` mantığını yeniden kullanın/genelleştirin (tek ürün yerine toplu
   çalışacak şekilde) — Odoo'ya N+1 çağrı yapmaktan kaçının, Uyumsoft'ta çözdüğümüz performans
   dersini burada da uygulayın (toplu `stock.quant` sorgusu + `mapWithConcurrency` gerekiyorsa).
3. `GET /api/external/stock?barkod=...` — tek ürün sorgusu (opsiyonel filtre).

### 3. Güvenlik ve dayanıklılık

1. `express-rate-limit` ekleyin (yeni bağımlılık), bu router'a makul bir sınır koyun (ör. dakikada
   60 istek/API anahtarı) — kütüphane projede hiç yok, ilk kez kuruluyor.
2. Bu router için CORS'u genel `cors()`'tan ayrı, daha dar tutmayı değerlendirin (opsiyonel, API
   anahtarı zaten server-to-server çağrıları koruyor, browser'dan çağrılmayacaksa CORS kritik değil
   — ama zararı yok).
3. Her isteği kısaca loglayın (endpoint, zaman, sonuç kodu) — ilk entegrasyon döneminde hata
   ayıklamak için işe yarar, aşırıya kaçmayın.
4. Hata mesajlarında iç sistem detaylarını (Odoo hata mesajları, stack trace) dışarıya sızdırmayın
   — genel bir "stok bilgisi alınamadı" mesajı yeterli, detay sadece backend logunda kalsın.

### 4. Teslim edilecek dokümantasyon

Rapor içinde, e-ticaret geliştiricilerine doğrudan iletilebilecek kısa bir entegrasyon notu
hazırlayın: base URL, `X-Api-Key` header nasıl gönderilir, her uç noktanın tam örnek
request/response'u. Bu, Görkem'in geliştiricilere kopyala-yapıştır verebileceği bir metin olsun.

## Test

1. API anahtarı olmadan/yanlış anahtarla istek → 401.
2. Doğru anahtarla `GET /api/external/products` ve `GET /api/external/stock` → gerçek veri dönsün,
   birkaç örnek ürünle şube kırılımının doğru olduğunu (admin paneldeki stok ekranıyla
   karşılaştırarak) doğrulayın.
3. Rate limit'i aşan bir istek dizisiyle 429 alındığını gösterin.
4. Performans: tüm katalog için `stock` uç noktasının makul sürede (birkaç saniye, N+1 olmadan)
   döndüğünü ölçüp raporlayın.

## Rapor formatı

Değişen/eklenen dosyalar + API anahtarı (nereye eklendiği) + üç uç noktanın örnek
request/response'u + e-ticaret geliştiricilerine iletilecek hazır entegrasyon metni + performans
ölçümü.
