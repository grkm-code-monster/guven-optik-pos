# Müşteriler sayfası — arama yapılmadan liste boş, Arşiv/Güncel sekmeleri isteniyor

## Durum

"Satışlar" → "Müşteriler" sayfası açıldığında ekran tamamen boş — hiçbir müşteri listelenmiyor,
sadece bir arama kutusu var. Görkem, mevcut (güncel) müşterilerin sayfa açılır açılmaz liste
halinde görünmesini, ayrıca **Arşiv (Siber ve eski Odoo)** ve **Güncel** olmak üzere iki sekme
olmasını istiyor.

## Kod tarafı — kök neden

`MusterilerPage.tsx` satır 29-33:

```ts
useEffect(() => {
  if (q.length < 3) { setMusteriler([]); return }   // ← 3 karakter yazılmadan liste hep boş
  const t = setTimeout(() => void ara(), 300)
  return () => clearTimeout(t)
}, [q])
```

Bu **kasıtlı bir arama-öncesi-boş davranışı**, bug değil — ama Görkem'in istediği "liste halinde
sıralanmalı" ihtiyacıyla çelişiyor. Ayrıca `Musteri` tipinde `legacyCustomerId` alanı ve seçili
müşteri detayında `LegacyArchiveHistorySection` bileşeni (satır 188-190) zaten var — yani "eski
sistem" verisiyle bağlantı kurma altyapısı kısmen mevcut. Backend'de de `legacy.service.ts`
(`backend/src/modules/customers/`) diye ayrı bir modül var — muhtemelen Siber/eski Odoo verisini
okuyan kısım burada, incelemeniz gerekiyor.

## İstenen

### 1) Varsayılan liste

1. Sayfa açıldığında (arama kutusu boşken) mevcut/güncel müşterilerin **sayfalanmış** bir listesini
   gösterin (örn. son eklenen/isim sırasına göre ilk 50) — tamamını tek seferde çekmeyin, "Daha
   Fazla Yükle" veya sayfalama ekleyin. Arama kutusuna yazınca mevcut filtreleme davranışı
   (3+ karakter) aynen kalabilir.
2. Backend `searchCustomers`/ilgili endpoint'in boş sorguyla da (sayfalı) tüm kayıtları
   döndürebildiğini kontrol edin, gerekirse `GET /customers?page=&limit=` gibi bir sayfalama
   parametresi ekleyin.

### 2) Arşiv / Güncel sekmeleri

1. Önce teşhis edin: `legacy.service.ts`'in gerçekte neyi temsil ettiğini (Siber verisi mi, eski
   Odoo müşteri kaydı mı, ikisi birden mi) ve bu veriye erişen mevcut bir endpoint olup olmadığını
   (`LegacyArchiveHistorySection`'ın çağırdığı API'yi bulun) raporlayın.
2. "Güncel" sekmesi: bu POS sisteminde (Postgres `Customer` tablosunda) kayıtlı, aktif müşteriler
   — yukarıdaki #1'deki liste.
3. "Arşiv" sekmesi: legacy/Siber/eski Odoo kaynaklı müşteri kayıtları — eğer bunlar için ayrı bir
   arama/listeleme endpoint'i yoksa, mevcut `legacy.service.ts`'i temel alarak bir tane ekleyin.
   Bu sekmede muhtemelen düzenleme değil, sadece görüntüleme/geçmiş inceleme mantıklı olur
   (mevcut `LegacyArchiveHistorySection` deseniyle tutarlı olun).
4. İki sekme arasında görsel olarak net bir ayrım olsun (örn. Arşiv kayıtlarında "salt okunur"
   ibaresi), kullanıcı yanlışlıkla arşiv kaydını POS güncel müşteri kaydıyla karıştırmasın.

## Test

Sayfa açılır açılmaz "Güncel" sekmesinde gerçek müşteri listesinin (arama yapılmadan) göründüğünü,
"Arşiv" sekmesine geçince eski/Siber kaynaklı kayıtların listelendiğini gösterin.

## Rapor formatı

Teşhis sonucu (`legacy.service.ts` neyi temsil ediyor) + değişen dosyalar + ekran görüntüsü (iki
sekme + varsayılan liste).
