# Transfer "Ürün Ekle" filtrelerine kamera ile barkod/karekod okuma

## Durum (GÜNCELLEME — canlı ekran görüntüsüyle teyit edildi)

"Transferler" → "Yeni Transfer" ekranında ürün arama için 5 filtre yöntemi var (Barkod, UTS kodu,
Lot/Seri, İç referans, Ürün adı). Görkem ekran görüntüsü üzerinde **Barkod, UTS kodu, Lot/Seri ve
İç referans** butonlarını daire içine alarak şunu belirtti: bu dördünde de elle yazmak zorunda
kalıyor, kamera ile karekod/barkod okutma seçeneği yok. ("Ürün adı" serbest metin olduğu için hariç
tutulabilir.) Bu, önceki taslaktaki "sadece Barkod/UTS/Lot-Seri" kapsamını **İç referans'ı da
içerecek şekilde genişletiyor** — depodaki ürün etiketlerinde iç referans da barkod/karekod olarak
basılı olabiliyor.

## Referans — aynı özellik başka bir ekranda zaten var ve çalışıyor

`packages/web/src/components/sale/ItemsStep.tsx`'te POS'un "Ürünler" adımında tam bu özellik
zaten mevcut:

- `kameraAcik` state (satır 278), `kameraAc()`/`kameraKapat()` fonksiyonları (satır 491-496).
- `navigator.mediaDevices.getUserMedia(...)` ile kamera akışı açılıyor (satır 370).
- Tarayıcı destekliyorsa native `BarcodeDetector` API kullanılıyor ("Chrome native", satır
  385-387), yoksa (muhtemelen) bir fallback kütüphane.
- 📷 / ✕ ikonlu bir toggle buton (satır 1242-1254) input'un yanına yerleştirilmiş.

## İstenen

1. `YeniTransfer.tsx`'teki `ARAMA_YONTEMLERI` filtre satırının yanına (şu an satır 20-26 ve 356-376
   civarı, "Barkod / UTS kodu / Lot-Seri / İç referans / Ürün adı" butonlarının render edildiği
   alan — arama input'u satır 378-384'te), `ItemsStep.tsx`'teki kamera bileşenini/mantığını **aynen
   taşıyarak veya ortak bir bileşene çıkararak** ekleyin.
2. Kamera **"Barkod", "UTS kodu", "Lot/Seri" ve "İç referans"** filtreleri seçiliyken görünsün ve
   aktif olsun — sadece "Ürün adı" serbest metin olduğu için kamera butonu o filtrede
   gizlensin/pasif olsun.
3. Okunan kod, o an aktif filtrenin arama input'una (`aramaMetni` state, satır 82) otomatik yazılıp
   mevcut 300ms debounce'lu arama `useEffect`'ini (satır 100-120) aynen tetiklesin — ayrı bir arama
   yolu açmayın.
4. Mümkünse iki ayrı kopya kod yerine ortak bir `BarkodKameraButonu` bileşeni çıkarıp hem
   `ItemsStep.tsx` hem `YeniTransfer.tsx`'in bunu kullanmasını tercih edin — ama bu refactor riskli
   görünüyorsa (POS akışını bozma riski varsa), önce sadece `YeniTransfer.tsx`'e kopyalayarak
   ekleyin, kod tekrarını sonraya bırakın.
5. Not: `YeniTransfer.tsx`'e yakın zamanda "Ürün adı" araması için bir lot seçim paneli eklendi
   (`urunSec()`, `lotSecimUrun`/`lotSecimListe` state'leri, satır 122-192). Kamera değişikliği bu
   akışa dokunmamalı — kamera sadece `aramaMetni`'ni dolduran bir girdi katmanı, arama/lot-seçim
   mantığının kendisi aynı kalmalı.

## Test

Kamerası olan bir cihazda (telefon/tablet) Transfer → Ürün Ekle ekranında sırasıyla Barkod, UTS
kodu, Lot/Seri ve İç referans filtrelerini seçip kamerayı açarak gerçek bir ürün etiketini/karekodunu
taratıp arama sonucunun geldiğini gösterin. "Ürün adı" filtresinde kamera butonunun görünmediğini de
gösterin.

## Rapor formatı

Değişen/eklenen dosyalar + kısa ekran görüntüsü veya GIF (kamera açma → tarama → sonuç), her dört
filtre yöntemi için ayrı ayrı.
