# Depo Etiketi — 30×50mm yeniden tasarım (mevcut "depo-kutu" şablonunun yerine)

Görkem ile canlı bir tasarım oturumunda (interaktif widget üzerinden, elle konum/font/renk
ayarlanarak) üzerinde anlaşılan yeni depo etiketi tasarımı. Bu talimat, `etiket-tasarimci`
modülündeki mevcut **`depo-kutu`** şablonunu (şu an 100×75mm, Miktar/Lokasyon/Lot alanlı) BU YENİ
TASARIMLA TAMAMEN DEĞİŞTİRİYor — yeni bir şablon eklemiyoruz, `depo-kutu` id'sini koruyarak
içeriğini/boyutunu yeniden yazıyoruz.

## 1) Yeni boyut

- `etiketGenislik: 30` (mm), `etiketYukseklik: 50` (mm) — eskisi 100×75mm idi, artık çok daha küçük,
  ürün bazlı (kutu bazlı değil) bir etiket.
- `DOTS_PER_MM = 8` sabiti zaten `constants.ts`'te var → ZPL tarafında gerçek etiket 240×400 dot.
- Önizleme boyutu (`previewW`/`previewH`): diğer şablonlarda kullanılan ölçek oranı 3px/mm
  (`100mm → 300px` örneğin `gunes-aksesuar`/`optik-cerceve-uts`, `100×75mm → 300×225px` eski
  `depo-kutu`). AYNI ORANI koruyun: yeni `depo-kutu` için `previewW: 90, previewH: 150`.

## 2) Yeni alan sırası (yukarıdan aşağıya, sol kenar boşluğu `padX=10dot`, iki yarım sütun arası
`gap=8dot`, yarım sütun genişliği `halfWidth = (240 - 2*10 - 8) / 2 = 106dot`)

1. **Barkod (görsel, Code128)** — `x=10, y=8`, genişlik tam (`240-20=220dot`), yükseklik `90dot`.
   Mevcut `barcodeZpl(x,y,h,val)` helper'ı kullanılsın (`sablon-zpl.ts`'te zaten var). Değer =
   `data.barkod` (mevcut alan, fallback `icReferans`, `qrIcerik()` benzeri mantığı tekrar kullanın).
2. **Barkod Numarası (metin)** — `x=10, y=104`, font `13dot`, tam genişlik, monospace görünüm.
   Değer barkod görselindeki AYNI string (`data.barkod`) — sadece insan tarafından okunaklı metin
   olarak barkodun hemen altına yazılıyor, ayrı bir veri kaynağı YOK.
3. **Ürün Şablon Adı** — `x=10, y=130`, font `16dot`, kalın, renk `ayar.renkBaslik` (varsayılan
   `#111111`). Değer = mevcut `data.urunAdi`.
4. **Model / Renk / Ölçü (nitelik)** — SOL yarım sütun: `x=10, y=158`, font `11dot`, `fbWidth=106dot,
   maxLines=1`. Bu satır için Güneş/Aksesuar şablonunda zaten var olan `nitelikKisa()` fonksiyonunu
   (`sablon-zpl.ts` satır ~69) AYNEN tekrar kullanın — `MODEL: X / RENK: Y / ÖLÇÜ: Z` gibi ham
   nitelik string'ini `"X Y Z"` kısa forma çeviriyor. Kaynak veri: `renkVaryant`/`icReferans` (aynı
   şu an `gunes-aksesuar`'da kullanılan kaynak).
5. **Son Sayım Tarihi** — SAĞ yarım sütun, AYNI satırda (`y=158`): `x=124`, font `9dot`,
   `fbWidth=106dot, maxLines=1`, gri renk (`#999999`). **ÖNEMLİ — gerçek veri kaynağı henüz YOK**:
   sistemde "son sayım tarihi" diye ayrı bir alan/tarih takibi şu an hiçbir yerde tutulmuyor (ne
   Prisma'da ne Odoo'da) — bunu kontrol ettim, `stock-adjustment.service.ts`'teki "sayım" kelimesi
   sadece stok miktarı düzeltme işlemine verilen isim, ayrı bir "son sayım tarihi" kaydı değil.
   Görkem'in kendisi de bunun için ayrı bir "sayım ekranı" yapısının SONRA kurulacağını belirtti
   (bu talimatın kapsamı DIŞINDA, ayrı bir iş). Şimdilik bu alanda GEÇİCİ olarak mevcut
   `sonGuncelleme` (son fiyat/stok güncelleme tarihi, zaten `SablonVeri`/`EtiketUrunVeri`'de var)
   değerini gösterin — kod içinde bunun geçici bir yer tutucu olduğunu, gerçek "son sayım tarihi"
   alanı geldiğinde değiştirilmesi gerektiğini belirten bir yorum satırı ekleyin.
6. **Çerçeve Türü (sol kutu, BOŞ)** — `x=10, y=180`: önce küçük bir başlık metni (`Çerçeve Türü`,
   font `8dot`, gri `#666666`), hemen altında BOŞ (içi dolu OLMAYAN) bordürlü bir kutu:
   `x=10, y≈190, genişlik=106dot, yükseklik=34dot`. ZPL'de `^GB{w},{h},{kalınlık}^FS` (Graphic Box)
   komutuyla sadece çerçeve çizilsin, İÇİNE HİÇBİR VERİ/METİN YAZILMASIN.
7. **Materyal (sağ kutu, BOŞ)** — aynı mantık, SAĞ yarım sütun: başlık `x=124, y=180`, kutu
   `x=124, y≈190, genişlik=106dot, yükseklik=34dot`, yine TAMAMEN BOŞ.

   **Kritik nokta:** Çerçeve Türü ve Materyal kutuları KASITLI olarak boş bırakılıyor — Görkem
   bunları etiket basıldıktan sonra ELLE dolduracak (kalemle). Hiçbir `data.*` alanına
   bağlamayın, hiçbir varsayılan metin/placeholder yazmayın — sadece başlık + boş çerçeve.

## 3) Değişecek dosyalar

- `packages/web/src/components/etiket-tasarimci/sablon-registry.ts` — `depo-kutu` `SablonTanim`
  girdisini güncelleyin: `etiketGenislik/etiketYukseklik/previewW/previewH` (madde 1), ve
  `ozellestirmeAlanlari` listesini yeni alanlara göre güncelleyin (`gosterMiktar`/`gosterLokasyon`/
  `gosterLot` toggle'larını bu şablonun listesinden çıkarın — tip (`SablonAyar`) içinde kalabilirler,
  sorun değil, sadece bu şablonun özelleştirme panelinde artık anlamsızlar). Yeni toggle'lar
  ekleyin: `gosterBarkodNo`, `gosterNitelik`, `gosterSonSayim`, `gosterCerceveTuru`, `gosterMateryal`
  (hepsi varsayılan `true`, `sablon-types.ts`'teki `SablonAyar` tipine ve `VARSAYILAN_AYAR`'a da
  eklenmeli).
- `packages/web/src/components/etiket-tasarimci/sablon-previews.tsx` — `SablonDepoKutu`
  bileşenini SIFIRDAN, yukarıdaki 7 maddeye göre yeniden yazın (eski Miktar/Lokasyon/Lot/tam
  genişlik barkod render'ı tamamen kaldırılacak). `scaleDepo()` fonksiyonu hâlâ kullanılabilir ama
  taban boyut sabitleri (`DEPO_W`/`DEPO_H`, şu an `300`/`225`) yeni orana göre güncellenmeli
  (`90`/`150` önizleme, gerçek oran 30:50 mm).
- `packages/web/src/components/etiket-tasarimci/sablon-zpl.ts` — `zplDepoKutu()` fonksiyonunu
  SIFIRDAN yeniden yazın, yukarıdaki koordinatlarla. Boş çerçeve kutuları için yeni bir küçük
  helper ekleyin, örn. `boxZpl(x, y, w, h, thickness=1)` → `` `^FO${x},${y}^GB${w},${h},${thickness}^FS` ``
  (mevcut `textZpl`/`textFbZpl`/`barcodeZpl` helper'larının hemen yanına, aynı dosyada).
- `packages/web/src/components/etiket-tasarimci/sablon-types.ts` — `SablonAyar` tipine yeni
  toggle alanlarını ekleyin (yukarıda listelendi).

## 4) Test

1. Etiket Tasarımcı sayfasında `depo-kutu` şablonunu seçip önizlemenin yeni 30×50mm oranında,
   yukarıdaki 7 alanla (barkod, barkod no, ürün adı, nitelik+son sayım yan yana, iki boş kutu)
   göründüğünü ekran görüntüsüyle gösterin.
2. `uretSablonZpl('depo-kutu', ...)` çıktısının barkod + 4 metin satırı + 2 boş `^GB` kutusu
   içerdiğini, kutuların İÇİNDE hiçbir `^FD` (veri) olmadığını gösterin.
3. Gerçek bir ürünle (barkodu, model/renk/ölçü nitelikleri dolu) örnek ZPL üretip yazdırılabilir
   olduğunu (ya da en azından ZPL string'inin yapısal olarak doğru olduğunu) doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + önizleme ekran görüntüsü + üretilen örnek ZPL çıktısı.
