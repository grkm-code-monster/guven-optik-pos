# Madde 7'nin devamı — DepoPage ve StokYonetimiPage'in DOĞRUDAN çağrıları

Bu, `ETIKET_MOTORU_BIRLESTIRME_VE_PILOT_TALIMATI.md`'nin Madde 7'sine ek/düzeltmedir. Madde 7
raporunda kendiniz doğru tespit ettiniz: `EtiketBasModal.tsx`'e eklenen pilot yönlendirmesi,
`DepoPage.tsx` ve `StokYonetimiPage.tsx`'in KENDİ `uretCokluEtiketZpl()` çağrılarını KAPSAMIYOR.
Bu iki sayfa `EtiketBasModal`'ı hiç kullanmadan (ya da bazı akışlarda paralel olarak) doğrudan ZPL
üretiyor. Depo Etiketi pilotu büyük ihtimalle GÜNLÜK OLARAK tam da `DepoPage`'ten basılıyor —
bunu kapsam dışı bırakırsak pilot gerçek kullanımda görünmez. Bugün bitirilecek.

## 1) Pilot yönlendirme mantığını TEK yere çıkarın (kod tekrarı olmasın)

Şu an `pilotSlugForSablon(sablonId, categAdi)` ve "önce pilotu dene, yoksa eski yola düş" mantığı
`EtiketBasModal.tsx` içinde gömülü. Bunu `packages/web/src/components/etiket/etiket-sablon-helpers.ts`
dosyasına TAŞIYIN (export edin), `EtiketBasModal.tsx` de dahil TÜM çağıranlar oradan import etsin.

Ayrıca aynı dosyaya, async bir üst-seviye yardımcı ekleyin (isim önerisi:
`uretEtiketZplTercihli`), imzası:

```ts
export async function uretEtiketZplTercihli(
  sablonId: SablonId,
  items: EtiketModalUrun[] | EtiketUrunVeri[],  // hangi tip kullanılıyorsa
  categAdi?: string,
): Promise<string>
```

Mantık: `pilotSlugForSablon(sablonId, categAdi)` bir slug döndürürse → `getEtiketSablonBySlug(slug)`
+ `generateZplFromSablon()` (Madde 7'de zaten kurulan pilot yolu) kullanın; `null` dönerse eski
`uretCokluEtiketZpl(sablonId, items)`'e düşün. `EtiketBasModal.tsx`'in `etiketBas()` fonksiyonunu da
bu YENİ ortak fonksiyonu çağıracak şekilde sadeleştirin (mantığı iki kere yazmayın).

## 2) `DepoPage.tsx` — `etiketZplUret()` (satır ~2788-2803)

Şu an SENKRON bir fonksiyon, doğrudan `uretCokluEtiketZpl(etiketSablonId, items)` çağırıyor. Bunu:

- ASENKRON yapın (`async function etiketZplUret()`), içeride `await uretEtiketZplTercihli(...)`
  çağırıp sonucu `setEtiketZpl(...)`'e yazın.
- Bu fonksiyonu çağıran buton/`onClick` yerini bulun (muhtemelen `onClick={etiketZplUret}` şeklinde)
  ve `onClick={() => void etiketZplUret()}` şeklinde güncelleyin (mevcut kod tabanındaki diğer async
  buton handler'larıyla AYNI desen — örn. `StokYonetimiPage.tsx`'teki ilgili buton nasıl yazılmışsa
  onu örnek alın).
- **Kategori sorunu:** `items` içindeki `veri` nesnesinde (satır 2791-2799) `categAdi`/`kategori`
  alanı YOK — ama pilot yönlendirmesi (`pilotSlugForSablon`) güneş gözlüğü şablonu için kategoriye
  bakıyor. `lot` nesnesinde (`lotlar` state'i, bu fonksiyonun kapsadığı scope) ürün kategorisi bilgisi
  var mı kontrol edin (muhtemelen `lot.kategori` ya da `lot.categAdi` gibi bir alan, ya da ürün
  bilgisinden gelen başka bir alan). Varsa `veri` nesnesine ekleyip
  `uretEtiketZplTercihli(etiketSablonId, items, kategoriDegeri)` şeklinde geçirin. YOKSA, raporda
  açıkça "DepoPage scope'unda kategori bilgisi bulunamadı, X/Y/Z alanlarına baktım, yok" diye
  belirtin — TAHMİN ETMEYİN, ben karar vereceğim (örn. depo etiketi için kategori şartı olmadan
  her zaman pilot'a yönlendirebiliriz, çünkü depo-kutu → depo-etiketi yönlendirmesi zaten kategoriye
  bakmıyor, sadece `sablonId==='depo-kutu'` yeterli — SADECE `gunes-aksesuar` seçilirse kategori
  gerekiyor, DepoPage'te muhtemelen bu seçilmiyordur ama emin olun).

## 3) `StokYonetimiPage.tsx` — ZPL üretme fonksiyonu (satır ~660-707 civarı, `items` oluşturup
`setEtiketZpl(uretCokluEtiketZpl(...))` çağıran fonksiyon)

Bu fonksiyon ZATEN async (`try/catch/finally` ile). `items` içinde `categAdi: etiketUrun.kategori`
ZATEN VAR (satır 700) — burada kategori sorunu YOK, sadece `uretCokluEtiketZpl(etiketSablonId, items)`
çağrısını `await uretEtiketZplTercihli(etiketSablonId, items, etiketUrun.kategori)` ile değiştirin.

Bu sayfada AYRICA `EtiketBasModal` da kullanılıyor (satır 1292) — o zaten Madde 7 ile pilot'a bağlı,
dokunmayın, sadece bu DOĞRUDAN çağrıyı düzeltin.

## 4) Başka doğrudan çağrı var mı — son bir tarama

`grep -rn "uretCokluEtiketZpl" packages/web/src` çalıştırıp madde 2-3'te ele alınanlar DIŞINDA
başka bir doğrudan çağrı noktası (örn. POS ekranı, `StokTeminStep.tsx`, `BekleyenTransferler.tsx`)
kalıp kalmadığını kontrol edin. Varsa raporda listeleyin — bugün hepsini değiştirmemiz
gerekmeyebilir (depo etiketi/güneş gözlüğü kategorisi geçmiyorsa öncelik düşük) ama GÖRMEZDEN
GELMEYİN, en azından raporda "şurada da var, dokunmadım çünkü X" deyin.

## Test

1. `DepoPage`'te depo etiketi basma akışını (gerçek bir ürün girişi senaryosunda) tetikleyip
   üretilen ZPL'in `depo-etiketi` pilot koordinatlarını (`^FO10,8`, `^GB106,34` vb.) içerdiğini
   gösterin.
2. `StokYonetimiPage`'te aynısını güneş gözlüğü kategorili bir ürünle test edip pilot
   koordinatlarını (`^FO334,16` vb.) gösterin.
3. `tsc --noEmit` temiz.

## Rapor formatı

Değişen dosyalar/satırlar + madde 2'deki kategori bulgusu (var/yok, hangi alan) + iki test sonucu +
madde 4'teki tarama sonucu.
