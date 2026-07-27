# Etiket Yazdırma — Ham PPLA'dan Görsel Bazlı Standart Yazdırmaya Geçiş

## Kritik bulgu (fiziksel test edildi, doğrulandı)

Argox OS-214plus + PPLA fiziksel testlerinde şu kesin olarak kanıtlandı:

**Ham byte yazdırma (`lp -o raw` ile PPLA komut metnini doğrudan yazıcıya göndermek)
etiket boşluğunu (gap) güvenilir şekilde bulamıyor.** Doğru PPLA komutları (STX/CR,
DataMatrix vs. hepsi manuel ile bire bir doğrulandı) göndersek de, yazıcı hangi
`<STX>M`/`<STX>c` değerini denersek deneyelim içeriği 2-6 fiziksel etikete yayıyordu.

**Çalışan yöntem şu oldu:** Etiketi bir GÖRSEL (PNG/PDF) olarak render edip, macOS'un
STANDART yazdırma diyaloğu üzerinden (Argox'un resmi sürücüsü + PPD'si üzerinden),
şu ayarlarla gönderdiğimizde etiket doğru şekilde tek fiziksel etikete bastı:

- Kağıt Boyutu: özel boyut, tam olarak etiketin gerçek mm ölçüsü (örn. 102x20mm),
  marjlar 0mm.
- Yazıcı Özellikleri (PPD, Argox sürücüsünün kendi ayar paneli):
  - `Label Sensor: Label with Gap` (bizim medyada siyah işaret yok, sadece fiziksel
    kesim boşluğu var — `Label with Mark`/varsayılan yanlış sonuç veriyordu)
  - `Print Method: Thermal Transfer` (ribbon takılı modelde bu, `Direct Thermal` değil)
  - `Calibrate Media Before Printing: Enable`
  - İnce ayar offsetleri (`Horizontal Offset`, `Vertical Offset`, `Label Top`) — cihaza
    özel, birkaç deneme ile bulunuyor.

Ayrıca fiziksel bir sensör konumu sorunu da vardı (2 kolonlu etikette sensör tam
ortadaydı, boşluğu tutarsız buluyordu) — kullanıcı sensörü elle kaydırarak bunu kısmen
düzeltti. Yani hem doğru yazılım ayarları HEM doğru donanım konumu gerekiyor; bu
talimat sadece yazılım tarafını kapsıyor.

## Şu anki kod neden çalışmıyor

`EtiketBasModal.tsx` şu an:
1. `uretEtiketZplTercihli()` ile ZPL/PPLA metnini üretiyor
2. Bunu bir `<textarea>`'da gösteriyor
3. "Yazdır" butonunda yeni bir pencere açıp ZPL/PPLA metnini `<pre>` içine yazıp
   `window.print()` çağırıyor

Bu, ham komut metnini düz bir metin belgesi gibi yazdırıyor — bizim en başta denediğim
ve başarısız olan TextEdit yöntemiyle aynı şey. Doğru kağıt boyutu/sürücü ayarları
devrede olmadığı için bu yöntem güvenilir çalışmayacak.

## Yapılması gereken

### 1) Etiketi görsel (image) olarak render eden yeni bir fonksiyon yazın

`etiket-zpl.ts` içindeki element listesini (`CanvasElement[]`, x/y/width/height/fontSize
hepsi zaten "dots" cinsinden, `DOTS_PER_MM = 8`) kullanarak, HER etiketi bir
`<canvas>` üzerine (veya sunucu tarafında `node-canvas`/`sharp` ile) çizen bir
fonksiyon yazın:

- Canvas boyutu: `genislikMm * 8` x `yukseklikMm * 8` piksel (1 dot = 1 piksel, 1:1).
- Text elemanları: `ctx.fillText` ile aynı x/y/fontSize koordinatlarında (ZPL'deki gibi
  Y aşağı, sol-üst köken — PPLA'daki gibi ters çevirmeye GEREK YOK, çünkü artık PPLA
  komutu üretmiyoruz, doğrudan görsel çiziyoruz).
- `barcode128` elemanları: gerçek bir Code128 barkod kütüphanesi ile (öneri: `jsbarcode`,
  zaten npm'de var, React'te kolayca kullanılıyor) — placeholder/sahte çizgi ÇİZMEYİN,
  gerçek taranabilir barkod olmalı.
- `gs1datamatrix` elemanları: gerçek GS1 uyumlu Data Matrix (FNC1/GS ayraçlı) üreten bir
  kütüphane ile (öneri: `bwip-js` — GS1 Data Matrix'i ve embedded FNC1'i destekliyor).
  `buildGs1Data()` fonksiyonu zaten doğru GS1 string'ini üretiyor, onu bu kütüphaneye
  verin.
- `kutu` (box) elemanları: `ctx.strokeRect`.
- `gs1Referans` (çok satırlı metin): `gs1ReferansSatirlari()` çıktısını satır satır
  `fillText` ile, `lineGap` kadar aralıkla.
- `kulakcik` tipi elemanlar: hâlâ atlanacak (fiziksel kesim şekli, çizilmeyecek).

### 2) Yazdırma akışını değiştirin

Yeni pencere açıp `<pre>` yerine, her etiket için bir `<img>` (canvas'tan
`toDataURL()`/`toBlob()` ile üretilmiş) koyun. Yazdırma CSS'inde:

```css
@page { size: <genislikMm>mm <yukseklikMm>mm; margin: 0; }
img { width: <genislikMm>mm; height: <yukseklikMm>mm; display: block; }
```

Sonra `window.print()` çağırın. Bu, tarayıcının STANDART yazdırma diyaloğunu açacak —
kullanıcı burada Argox'un özel kağıt boyutunu (macOS'ta önceden tanımlanmış olmalı,
bkz. Operasyonel not) ve sürücü ayarlarını seçebilecek/otomatik gelecek.

### 3) Çoklu etiket (batch) durumu

`generatePplaBatchFromSablon` gibi, birden fazla ürün seçilince her biri için bir
`<img>` üretip ayrı ayrı sayfalar (`page-break-after: always` CSS'i ile) halinde aynı
yazdırma penceresine koyun — tek `window.print()` çağrısı hepsini bir işte gönderir.

### 4) Eski ZPL/PPLA kod yolunu SİLMEYİN

`etiket-zpl.ts` ve `etiket-ppla.ts` başka senaryolar (farklı yazıcı, ham dosya
indirme, ileride ZPL destekli gerçek bir yazıcı) için hâlâ faydalı — sadece
`EtiketBasModal.tsx`'teki "Yazdır" butonunun varsayılan davranışını görsel tabanlı
yönteme çevirin. İsterseniz bir toggle/ayar ekleyip iki yöntemi de destekleyin, ama
varsayılan bu yazıcı için görsel yöntem olmalı.

## Operasyonel not (kod dışı, ama önemli — kullanıcıya hatırlatın)

Yukarıdaki "Kağıt Boyutu" özel boyutu ve sürücü ayarları (Label Sensor, Print Method,
offsetler) bu MAC'in CUPS/yazıcı sürücüsü ayarlarında saklı — kod tarafından kontrol
edilmiyor, macOS'un kendi ayarları. Bu POS başka bir bilgisayara/yazıcıya kurulursa
bu kalibrasyon adımları (özel kağıt boyutu ekleme, Label Sensor: Gap, Print Method:
Thermal Transfer, offset ince ayarları, gerekirse sensör fiziksel konumu) o makinede
de TEKRAR yapılmalı. Bunu bir kurulum runbook'una (README/kurulum talimatı) yazmanızı
öneririm ki ileride unutulmasın.

## Test

1. `tsc --noEmit` temiz olsun.
2. Yeni render fonksiyonunu `depo-etiketi` ve `gunes-gozlugu-katlanir` şablonlarıyla
   test edin, üretilen görselin element pozisyonlarının canvas editördeki (
   `EtiketSablonDuzenleyici`) görünümle birebir eşleştiğini gözle doğrulayın.
3. Barkod ve DataMatrix'in gerçekten taranabilir olduğunu (telefon kamerası/barkod
   okuyucu ile) doğrulayın — sahte/placeholder değil.
4. Raporda: hangi kütüphaneleri kullandığınızı, üretilen örnek görseli (base64 veya
   dosya olarak), ve `tsc` sonucunu paylaşın.
