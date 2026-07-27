# Güneş Gözlüğü Etiketi — katlanır (paddle/kalem şekli) yeniden tasarım

Görkem ile canlı bir tasarım oturumunda (interaktif widget, elle konum/font/boyut ayarlanarak,
gerçek bir referans görsel — "DOĞRU ETİKET TASARIMI" infografiği — esas alınarak) üzerinde
anlaşılan yeni tasarım. Bu talimat, `etiket-tasarimci` modülündeki mevcut **`gunes-aksesuar`**
şablonunu (şu an düz dikdörtgen + gri kulakçık, 100×50mm) BU YENİ TASARIMLA DEĞİŞTİRİYOR.

## 0) ÖNEMLİ — şekil neden ZPL'de "çizilmiyor"

Etiketin paddle/kalem şekli (ince çubuk + yuvarlatılmış geniş baş) FİZİKSEL OLARAK ÖNCEDEN
KESİLMİŞ (die-cut) etiket kağıdından geliyor — bu şekli ZPL'nin çizmesine GEREK YOK. ZPL sadece
İÇERİĞİ (barkod, yazılar, karekod) doğru koordinatlara basar. Bu yüzden:

- `sablon-zpl.ts`'teki `zplGunesAksesuar()` sadece metin/barkod/karekod alanlarını basar, şekil
  çizmez (mevcut haliyle zaten böyle).
- `sablon-previews.tsx`'teki `SablonGunesGozlugu` (EKRANDA ÖNİZLEME için) ise şekli GÖRSEL OLARAK
  göstermeli — Görkem'in onayladığı widget'taki gibi tek parça, SVG `<path>` ile çizilen bir
  paddle şekli (ince çubuk ortadan geniş başa bitişik, başın sağ ucu yuvarlak). Bu SADECE önizleme
  amaçlı, ZPL çıktısını etkilemez.
- Ortadaki "KATLAMA YERİ (PERFORAJ)" çizgisi de muhtemelen etiket kağıdının kendisinde fiziksel
  perforasyon (Görkem'in tedarikçisinden) — ZPL'de bunu da çizmeye GEREK YOK. Emin değilseniz
  Görkem'e bir kez sorun: "fold çizgisini biz mi basıyoruz yoksa etiket kağıdında zaten var mı?"

## 1) Yeni fiziksel boyutlar

- Toplam uzunluk: **102mm** (çubuk 35mm + geniş baş 67mm)
- Çubuk (ince, çekme kısmı): **35mm** genişlik, yükseklik geniş başın ~%32'si kadar (yaklaşık
  6-7mm), dikey ortalanmış — beyaz, ayrı renk/dolgu YOK (eski tasarımdaki gri kulakçık kaldırıldı).
- Geniş baş (yazdırılabilir alan): **67mm × 20mm**, ortasında dikey katlama çizgisi (perforaj),
  iki eşit yarıya bölünmüş (**33.5mm + 33.5mm**).
- `DOTS_PER_MM = 8` → geniş baş toplam **536 dot** genişlik, **160 dot** yükseklik, çubuk **280
  dot**, katlama noktası çubuğun bitişinden **268 dot** sonra (yani etiketin SOL UCUNDAN
  **548 dot**).

## 2) Alan koordinatları (etiketin SOL UCU = x0, geniş başın ÜST kenarı = y0; birim: dot,
`textZpl(x,y,fontW,fontH,text)` / `barcodeZpl(x,y,h,val)` helper'ları `sablon-zpl.ts`'te zaten var)

Görkem'in widget üzerinde elle onayladığı NİHAİ konumlar (aşağıdaki `dx/dy` widget içi SVG
ayarlarından `dot = (svg_deger) × 1.6` formülüyle çevrildi, ölçek doğrulaması: `headX=280dot=
35mm×8`, `foldX=548dot=68.5mm×8`, `headRightX=816dot=102mm×8` — tümü tutarlı):

| Alan | x (dot) | y (dot) | font/boyut (dot) | Not |
|---|---|---|---|---|
| **Barkod (Code128, görsel)** | 334 | 16 | yükseklik≈27 | `barcodeZpl(334,16,27,val)`, ÜRÜN ADININ ÜSTÜNDE |
| Barkod numarası (metin) | 334 | 58 | 11 | barkod görselinin hemen altında, aynı değer |
| **Ürün Adı** | 290 | 74 | 14, kalın | |
| **Model** | 290 | 90 | 13 | |
| **Renk Kodu** | 341 | 90 | 13 | Model ile aynı satırda, sağında |
| **Fiyat** | 388 | 112 | 26, kalın | sağ yarıda |
| **Fiyat Değişim Tarihi** | 289 | 131 | 10 | "FİYAT DEĞİŞİM TARİHİ: {tarih}" |
| **KDV DAHİLDİR** | 289 | 144 | 10 | toggle'lı (`ayar.gosterKdv`, mevcut) |
| **Karekod (GS1 DataMatrix)** | 569 | 18 | 94×94 | mevcut `gs1Zpl()` helper'ı kullanılabilir, modül boyutu (`mod` param) buna göre ayarlanmalı |
| **Referans (GS1 AI satırları)** | 665 | 38 | 13, satır arası 16 | madde 3'e bakın — karekodun sağında/altında |

Not: Tablodaki x/y değerleri Görkem'in widget'ta elle ayarladığı NİHAİ (taban konum + kaydırma)
sonuçlardır — bunları AYNEN uygulayın, yeniden hesaplamaya/"daha mantıklı" bir yere taşımaya
ÇALIŞMAYIN. Etiket Tasarımcı'da canlı önizlemeyi Görkem'e gösterip TEYİT ALIN, birebir aynı
görünmeli.

## 3) Referans numarası — UTS öncelikli GS1 AI formatı (KRİTİK, yeni mantık)

Karekodun yanına yazılan "referans numarası" artık şu KURALA göre üretilmeli:

- **Ürünün UTS bilgisi (UTS kodu) doluysa** → ÖNCELİK UTS'DEDİR, 4 satır GS1 Application
  Identifier formatında gösterilir:
  ```
  (01) {GTIN/Barkod}
  (17) {Son Kullanma Tarihi, YYAAGG formatında}
  (10) {Lot/Parti No}
  (21) {Seri No}
  ```
- **UTS bilgisi YOKSA ama Lot/Seri bilgisi varsa** → sadece bu ikisi, AYNI AI-prefixli formatta
  (karekodun ALTINDA, mevcut olanlar):
  ```
  (10) {Lot No}     [Lot yoksa satır atlanır]
  (21) {Seri No}    [Seri yoksa satır atlanır]
  ```
- Hiçbiri yoksa hiçbir satır basılmaz (boş bırakılır, hata değil).

**Kod tekrarını önleyin:** `packages/web/src/components/etiket-tasarimci/sablon-previews.tsx`'teki
`SablonOptikCerceveUts` bileşeninde ZATEN (01)/(21)/(11)/(10) formatında bir GS1 kod satırı
gösterimi var (satır ~229-244), ve `sablon-zpl.ts`'teki `zplOptikCerceveUts()`'te de benzer bir
blok var (satır ~166-171). Bu YENİ "UTS öncelikli, yoksa lot/seri" mantığını AYRI bir yardımcı
fonksiyon olarak çıkarın (örn. `gs1ReferansSatirlari(veri): string[]` — hem `sablon-previews.tsx`
hem `sablon-zpl.ts` içinde kullanılabilecek şekilde, muhtemelen yeni bir `sablon-utils.ts` benzeri
paylaşılan dosyada) ve HEM `gunes-aksesuar` HEM `optik-cerceve-uts` şablonlarının bunu
kullanmasını sağlayın — iki şablon birbirinden bağımsız, tutarsız GS1 gösterim mantığına sahip
OLMASIN.

`SablonVeri` tipinde SKT (son kullanma tarihi) için ayrı bir alan yoksa (`sablon-types.ts`'e
bakın), ekleyin (`sktTarihi?: string`, YYAAGG formatında ham veya `Date` — hangisi mevcut veri
akışına daha uygunsa).

## 4) Değişecek dosyalar

- `packages/web/src/components/etiket-tasarimci/sablon-registry.ts` — `gunes-aksesuar`
  `SablonTanim` girdisinin `etiketGenislik`/`etiketYukseklik` ve `previewW`/`previewH` değerlerini
  yeni fiziksel boyuta göre güncelleyin (diğer şablonlardaki 3px/mm oranını koruyun — toplam
  uzunluk 102mm → previewW≈306px, yükseklik 20mm → previewH≈60px; şekil paddle olduğu için
  `Preview` bileşeni kendi SVG viewBox'ını kullanacak, bu sadece dış konteyner boyutu).
- `packages/web/src/components/etiket-tasarimci/sablon-previews.tsx` — `SablonGunesGozlugu`
  bileşenini SIFIRDAN, Görkem'in onayladığı widget'taki SVG `<path>` mantığıyla (ince çubuk +
  yuvarlatılmış geniş baş, tek parça outline) yeniden yazın. Eski `Kulakcik()` yardımcı bileşeni bu
  şablon için ARTIK KULLANILMAYACAK (sadece gri dikdörtgen kulakçık kullanan diğer şablonlarda
  kalabilir, ama `gunes-aksesuar` kendi SVG path'ini çizecek).
- `packages/web/src/components/etiket-tasarimci/sablon-zpl.ts` — `zplGunesAksesuar()`'ı madde
  2'deki tabloya göre yeniden yazın: barkod ÜRÜN ADININ ÜSTÜNE taşınacak, karekod eklenecek
  (şu an bu şablonda hiç karekod/GS1 yok — `gs1Zpl()` helper'ı zaten dosyada mevcut, `zplOptikCerceveUts`'te
  kullanılan haliyle buraya da ekleyin), referans satırları madde 3'teki paylaşılan fonksiyondan
  gelecek.
- `packages/web/src/components/etiket-tasarimci/sablon-types.ts` — gerekirse `sktTarihi` alanı
  (madde 3).

## 5) Test

1. Etiket Tasarımcı'da `gunes-aksesuar` şablonunu seçip önizlemenin Görkem'in widget'ta onayladığı
   görünümle (barkod üstte, ürün adı/model/renk altında, sağda fiyat bilgileri, karekod + GS1
   referans satırları) BİREBİR eşleştiğini ekran görüntüsüyle gösterin.
2. Bir ürünü hem UTS kodlu HEM UTS'siz (sadece lot/seri) senaryoda test edip referans satırlarının
   doğru moda göre (4 satır AI vs 2 satır AI) değiştiğini gösterin.
3. `uretSablonZpl('gunes-aksesuar', ...)` çıktısının barkod + karekod + tüm metin alanlarını madde
   2'deki koordinatlarla ürettiğini gösterin.
4. `optik-cerceve-uts` şablonunun da yeni paylaşılan `gs1ReferansSatirlari()` fonksiyonunu
   kullandığını ve eski davranışının BOZULMADIĞINI (regresyon yok) doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + önizleme ekran görüntüsü + iki senaryo (UTS'li/UTS'siz) örnek ZPL
çıktısı + `optik-cerceve-uts` regresyon kontrolü.
