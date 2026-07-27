# UTS bildirimi "Seri/Lot eksik" hatası + React boş-anahtar uyarısı + iki 401

## Durum

Görkem, UTS Yönetimi ekranından GVN2 → ADESE'ye gerçek bir "Verme" bildirimi göndermeye çalıştı.
Tarayıcı konsolunda şunları gördü:

1. `POST /api/admin/uts/bildirim-gonder/:id` → **500** (backend `gondermeBildiriminiYap`'in
   hatayı yakalayıp döndürdüğü genel 500).
2. Bildirimin gerçek TİTCK yanıtı (uygulama içinde `hataDetay` olarak gösteriliyor):
   `400 VALIDATION_ERROR — "Seri/Sıra ya da Lot/Batch ya da numaralarından en az biri
   verilmelidir."` — yani gönderilen kalemde HEM `SNO` (seri) HEM `LNO` (lot) boş gitmiş.
3. Girdiği/okuttuğu ham barkod: `0108680273473668211010210112026-04-24101`
4. Tekrarlayan React uyarısı: *"Encountered two children with the same key \`\`"* (boş string
   anahtar, birden fazla kez).
5. İki adet **401** (`/api/bildirimler/sayac`, `/api/admin/fiyat-degisiklikleri/sayac`) —
   Görkem token'ların doğru olduğunu belirtti.

Görkem'in genel izlenimi: "bizim sanki UTS ile bir bağlantımız yokmuş gibi geliyor" — ama kod
okuduğumda entegrasyonun GERÇEK olduğunu doğruladım: `uts.service.ts`'teki
`gondermeBildiriminiYap()` doğrudan `utsuygulama.saglik.gov.tr` (ya da test ortamı) adresine POST
atıyor — placeholder/mock değil. Sorun bağlantı yokluğu değil, gönderilen VERİNİN eksik/hatalı
olması ve arayüzün bunu önceden yakalayıp uyarmaması.

## 1) ACİL — GS1 parse sonucunu GERÇEKTEN çalıştırıp doğrulayın (varsayım yapmayın)

`packages/web/src/utils/parseGs1DataMatrix.ts`'teki `parseGs1DataMatrix()` fonksiyonunu, Görkem'in
verdiği TAM string ile çalıştırın:

```ts
console.log(parseGs1DataMatrix('0108680273473668211010210112026-04-24101'))
```

Ben manuel olarak AI (Application Identifier) yapısını elle takip etmeye çalıştım ve
`serial`/`lot` alanlarının BEKLENMEDİK/anlamsız kısa değerler (`"10"`, `"210"` gibi) ürettiğini
gördüm — ama bu elle sayım hataya açık, KESİN DEĞİL. Gerçek kod çalıştırılıp NET sonuç görülmeli.
Muhtemel ihtimaller:
- Parser bu string için `null` dönüyor (GS1 olarak tanınmıyor) → `UtsYonetimiPage.tsx` satır
  440-459'daki fallback CSV-parse'a düşüyor → bu string'te `\t`, `,`, `;` ayracı OLMADIĞI için
  `parcalar = [tüm string]`, `seriNo`/`lotNo` İKİSİ DE boş kalıyor, `barkod` = tüm garip string
  oluyor. Bu senaryo, Görkem'in aldığı hatayla BİREBİR uyuşuyor.
- VEYA parser bir sonuç dönüyor ama `serial`/`lot` alanları YANLIŞ/anlamsız (benim elle
  bulduğum gibi) — bu durumda hata farklı bir yerden geliyor demektir, araştırmaya devam edin
  (örn. bu spesifik satır değil, aynı bildirimdeki BAŞKA bir kalem boş gitmiş olabilir).

Gerçek çalıştırma sonucuna göre kök nedeni KESİNLEŞTİRİP raporlayın.

## 2) `isGs1DataMatrix`/`parseGs1DataMatrix`'i bu formatı destekleyecek şekilde düzeltin (gerekirse)

Eğer bu, gerçek bir tarayıcının FNC1 karakterini emmediği/kaybettiği ya da farklı bir AI
sıralaması kullandığı meşru bir GS1 varyasyonuysa, parser'ı bunu doğru ayrıştıracak şekilde
güçlendirin (backend'teki `gs1-parser.util.ts`'in bugün bu oturumda zaten benzer bir sağlamlaştırma
geçirdiğini unutmayın — mümkünse aynı mantığı, iki parser arasında TUTARLI kalacak şekilde
paylaşın/senkronize edin, aksi hâlde envanter importu ile UTS bildirimi farklı davranışlar
sergilemeye devam eder).

## 3) KRİTİK — gönderim ÖNCESİ, gerçek devlet API'sine gitmeden validasyon ekleyin

Şu an hiçbir yerde "bu kalemde seri VE lot ikisi de boş, gönderemezsin" kontrolü yok — hata ancak
gerçek TİTCK sunucusuna istek gittikten SONRA, kafa karıştırıcı bir 500/400 olarak geri dönüyor.
Bunu düzeltin:

- `UtsYonetimiPage.tsx`'te `bildirimOlustur()` (satır ~468) çağrılmadan ÖNCE, her kalem için
  `seriNo` VE `lotNo` ikisi de boşsa kullanıcıya AÇIK bir uyarı gösterin: *"Şu kalemlerde ne Seri
  No ne de Lot No var, TİTCK bunu kabul etmez: [barkod listesi]"* — gönderimi engelleyin ya da en
  azından güçlü bir onay isteyin.
- Aynı kontrolü, transfer kaynaklı bildirimler için `transferKalemlerdenUtsKalemler()`
  (`uts.service.ts` satır ~286) içine de ekleyin — `result.push(...)` öncesi bu durumu tespit edip
  en azından `console.warn`/log ile işaretleyin, sessizce devlet API'sine göndermeyin.
- `barkodlariEkle()` (satır 434) içinde, GS1 parse başarısız olup CSV fallback'e düşen VE
  sonucunda seri/lot ikisi de boş kalan satırlarda, kullanıcıya satırın yanında görsel bir uyarı
  (kırmızı ikon/metin) gösterin — "ayrıştırılamadı, manuel girin" gibi.

## 4) React "boş anahtar" uyarısı — kesin bulundu, düzeltin

`UtsYonetimiPage.tsx` satır 1199-1203:
```ts
const islemKey = s.bid ?? `${s.uno}-${s.sno ?? s.lno ?? idx}`
```
`??` sadece `null`/`undefined` için fallback'e düşer — `s.bid` BOŞ STRING (`''`) ise (ki bekleyen/
gönderilememiş bildirimlerde muhtemelen böyle — henüz TİTCK'tan bir bildirim id'si alınmamış),
`??` bunu geçerli bir değer sayıp `''`'i kullanır, TÜM bu satırlar aynı boş anahtarı paylaşır.
Düzeltme:
```ts
const islemKey = (s.bid && s.bid.trim()) ? s.bid : `${s.uno}-${s.sno ?? s.lno ?? idx}`
```
Dosyada başka yerlerde de (`branch.id`, `f.id`, `p.id`, `lok.id` gibi) benzer `??`/opsiyonel alan
bazlı key kullanımı var — bunların da boş string döndürme ihtimali olup olmadığını hızlıca
kontrol edin, ama öncelik `s.bid` (kesin doğrulanan tek kaynak).

## 5) İki 401 — hızlı kontrol (düşük öncelik, bu oturumun UTS/stok değişiklikleriyle ilgisiz görünüyor)

`/api/bildirimler/sayac` ve `/api/admin/fiyat-degisiklikleri/sayac` ikisi de `if (!user) return
401` şeklinde çalışıyor — yani `req.user` o an dolu değildi (muhtemelen sayfa yüklenirken
token/refresh henüz tamamlanmadan bu sayaç istekleri atılmış olabilir, ya da token gerçekten o an
süresi dolmuş/geçersizdi). Görkem token'ların doğru olduğunu söylüyor — bu, bugünkü
`ek-yetki.ts` değişikliğiyle (Stok Kontrol için eklenen yetkilendirme) İLGİSİZ görünüyor (o sadece
`/stok-kontrol/*` alt yollarını etkiliyordu) ama YİNE DE emin olmak için: bu iki endpoint'in auth
middleware zincirinde bugünkü değişiklikten etkilenip etkilenmediğini bir kez kontrol edin. Değilse
muhtemelen geçici/tekrarlayan bir sorun değil, tek seferlik bir token-yenileme zamanlama sorunu —
derinlemesine araştırmaya gerek yok, sadece bugünkü değişikliklerle ilgisi olmadığını teyit edin.

## Test

1. Verilen ham GS1 string'i ile `parseGs1DataMatrix()`'in GERÇEK çıktısını gösterin.
2. Düzeltme sonrası aynı string'i UTS Yönetimi'nde okutup (ya da manuel girip) artık ya doğru
   seri/lot ile ayrıştığını YA DA gönderim öncesi net bir uyarı ile engellendiğini gösterin.
3. Bekleyen bildirimler listesinde artık React duplicate-key uyarısının çıkmadığını gösterin.
4. İki 401'in bugünkü kod değişiklikleriyle ilgisi olmadığını (ya da varsa, düzeltmeyi) raporlayın.

## Rapor formatı

`parseGs1DataMatrix` gerçek çıktısı + kök neden + yapılan düzeltmeler (dosya/satır) + test 1-4
sonucu.
