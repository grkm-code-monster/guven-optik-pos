# Etiket Motoru — PPLA Üretici Ekleme Talimatı

## 0) Neden bu talimat / kritik bulgu

Bugün fiziksel Argox yazıcı (**Argox OS-214plus**, 203dpi) macOS'e kuruldu ve test edildi.
Yazıcının resmi kullanım kılavuzunu (argox.com, `OS-seies-User-Manual_EN_V1.0-11-12-2017.pdf`)
inceledim ve şunu doğruladım:

> **OS-214plus SADECE PPLA ve PPLB dillerini destekliyor. PPLZ (Argox'un ZPL-uyumlu
> emülasyonu) SADECE OS-2140Z / OS-2140DZ modellerinde var — düz OS-214plus'ta YOK.**

Mac'e sürücü "ARGOX OS-214 plus PPLA 203dpi" olarak kuruldu (Yazıcılar ve Tarayıcılar'da
görünen ad budur — yani printer şu an **PPLA modunda**).

Bu bizim için kritik bir mimari sorun: bugüne kadar (`ETIKET_MOTORU_BIRLESTIRME_VE_PILOT_TALIMATI.md`
ve önceki talimatlarla) kurduğumuz TÜM etiket motoru **ZPL (Zebra Programming Language)**
üretiyor (`^FO`, `^A0N`, `^BC`, `^BQ`, `^GB`, `^XA/^XZ` komutları — `backend/src/modules/etiket/etiket-zpl.ts`
ve eski `packages/web/src/components/etiket-tasarimci/sablon-zpl.ts`). Bu fiziksel yazıcı
ZPL komutlarını ANLAMAZ. Şu anki haliyle bu motorun ürettiği metni yazıcıya göndersek
muhtemelen boş çıktı / anlamsız karakterler / hata alırız.

**Bu talimatın amacı**: mevcut ZPL üreticisinin YANINA, aynı şablon veri modelinden
**PPLA komutları üreten paralel bir üretici** eklemek. ZPL üreticisi SİLİNMEYECEK/BOZULMAYACAK
(ileride ZPL destekleyen bir yazıcı alınabilir, ya da farklı mağazalarda farklı yazıcı olabilir) —
sadece yanına PPLA seçeneği eklenecek.

## 1) ÖNCE: Doğru PPLA komut söz dizimini bulun — TAHMİN ETMEYİN

PPLA'nın tam komut referansı (Argox'un resmi "PPLA & PPLB Programmer's Manual"ı) şu
kaynaklarda mevcut, indirip **Section A** (About PPLA, sayfa 1-101 civarı) kısmını okuyun:

- http://indir.bilkur.com/argox/ArgoxPPLA.pdf
- https://pdfcoffee.com/pplaamppplb-pdf-free.html (indirme linki sayfada mevcut)
- Argox resmi site: https://www.argox.com/download/drivers/ üzerinden OS-214plus için
  "Programmer's Manual" / "Programming Manual" arayın (marka genelde ürün sayfasında ayrıca
  barındırır: https://www.argox.com/products-detail/os-214plus/ )

Ben bu dokümanı web-fetch ile taradım ama çıktı bozuk/karışık geldi (PDF-to-text sırasında
sayfalar birbirine karışmış), bu yüzden TAM VE DOĞRU komut söz dizimini ben veremiyorum.
Gördüğüm parçalardan EMİN olduğum genel yapı şu (bunları iskelet olarak kullanın ama
KESİN sözdizimini/parametre sırasını manuel'den doğrulayın):

- Koordinat sistemi: orijin (0,0) sol-alt köşe, X sağa Y yukarı artar (ZPL'in aksine —
  ZPL'de orijin sol-üst köşedir, Y aşağı artar. **Bu fark kritik**, dönüştürme yaparken
  Y eksenini çevirmeniz gerekebilir).
- Komutlar 5 kategoriye ayrılıyor: interaction / system setting / system level /
  **label formatting** (bizim asıl ilgilendiğimiz) / font downloading.
- Label formatting komutları `L` ile başlayıp `E` ile bitiyor (etiket bloğu `L ... E`
  şeklinde gruplanıyor — ZPL'deki `^XA ... ^XZ` karşılığı).
- Metin alanları muhtemelen `A` komutuyla, barkod alanları `B` komutuyla başlıyor
  (tam parametre sırasını — x,y,rotasyon,font,h-çarpanı,v-çarpanı,ters-mi,veri —
  manuelden doğrulayın, gördüğüm örnek parçalar PPLB'ye aitti, PPLA için farklı olabilir).
- Kopya sayısı `Qxxxx` komutuyla (4 haneli).
- 2D barkod (QR/Data Matrix) desteği PPLA'da VAR (aşağıya bakın), ama tam komut
  formatını manuelden çıkarın.

**Section A6 (Label Formatting Commands, sf. 32-48), A9 (Programming Examples for Texts,
sf. 63-68), A10 (Programming Examples for Bar Codes, sf. 69-85)** bölümlerini özellikle
okuyun — oradaki ÇALIŞAN örnekleri birebir referans alın.

## 2) Yazıcının gerçek kapasitesi (argox.com resmi kullanım kılavuzundan doğrulandı)

OS-214plus + PPLA emülasyonunda desteklenenler (bunu ben resmi PDF'ten doğru okudum,
güvenilir):

- **1D barkod**: Code 39, Code 93, Code 128 (subset A/B/C), Codabar, Interleaved 2 of 5
  (+checksum varyantları), UPC-A/E (+2/5 add-on), EAN-13/8, UCC/EAN-128, Postnet, Plessey,
  UCC/EAN Code128 Random Weight, HBIC, Telepen, FIM
- **2D barkod**: PDF-417, MaxiCode, **Data Matrix (sadece ECC200)**, **QR Code**,
  Composite codes
- **Grafik formatları**: PCX, BMP, IMG, HEX, GDI
- **Font**: 9 dahili font (farklı punto), 6 ASD smooth font, Courier (farklı symbol set),
  indirilebilir soft font, 1x1 ile 24x24 arası ölçekleme, 0/90/180/270 derece rotasyon

Bizim mevcut şablonlarımızın (`depo-etiketi`, `gunes-gozlugu-katlanir`) ihtiyaç duyduğu
her şey (metin, barkod - Code128 muhtemelen, Data Matrix / QR karekod, boş kutu/çizgi)
**PPLA'da karşılığı var**. Kutu/çizgi (ZPL'deki `^GB`) için PPLA'da muhtemelen ayrı bir
"line/box drawing" komutu var (manuelde arayın, section A6 içinde olmalı) — bulamazsanız
raporda açıkça "kutu çizme komutu bulunamadı" deyin, tahmin etmeyin.

## 3) Mimari — ne ekleyeceksiniz

**Değişmeyecekler (dokunmayın):**
- `CanvasElement` / `ElementType` şeması (`backend/src/modules/etiket/etiket-zpl.ts`)
- `EtiketVeri` tipi
- `elementToZpl()`, `generateZplFromSablon()`, `generateZplBatchFromSablon()` — aynen kalsın
- `EtiketSablonu` DB modeli, seed edilmiş `depo-etiketi` / `gunes-gozlugu-katlanir` kayıtları

**Ekleyecekleriniz** (hepsi `backend/src/modules/etiket/etiket-zpl.ts` dosyasına, ya da
isterseniz yeni bir `etiket-ppla.ts` dosyasına — mevcut dosya deseniyle tutarlı olsun,
karar sizin, raporda hangisini seçtiğinizi belirtin):

1. `elementToPpla(el: CanvasElement, veri: EtiketVeri, dotsPerMm: number): string`
   — `elementToZpl`'in PPLA karşılığı. AYNI `CanvasElement` tiplerini (`text`, `barkod`,
   `barkodMetin`, `karekod`, `kutu`, `model`, `renkKodu`, `nitelik`, `fiyatDegisimTarihi`,
   `gs1Referans` vb. — TÜM mevcut tipleri) desteklemeli. `resolveElementText()` fonksiyonu
   dil-bağımsız olduğu için AYNEN kullanılabilir (metin çözümleme ZPL/PPLA'dan bağımsız).
2. `generatePplaFromSablon(elemanlar: CanvasElement[], genislikMm: number, yukseklikMm: number, veri: EtiketVeri): string`
   — `generateZplFromSablon`'un PPLA karşılığı, `L ... E` bloğu üretsin.
3. `generatePplaBatchFromSablon(...)` — çoklu etiket için, `generateZplBatchFromSablon` ile
   aynı imza deseninde.
4. **Y ekseni dönüşümüne dikkat**: ZPL'de Y=0 üstte, aşağı doğru artar. PPLA'da Y=0 altta,
   yukarı doğru artar (manuelden doğrulayın). Koordinat çevirisini doğru yapın — yanlış
   yaparsanız etiketler baş aşağı ya da yanlış konumda çıkar.
5. **Nokta/mm çevrimi**: ZPL tarafında `DOTS_PER_MM = 8` sabiti var (203dpi = 8 dot/mm).
   PPLA "resolution-independent" olduğu için birim inch/mm de olabilir — manuelden hangi
   birimde çalıştığını (dot mu, 0.01 inch mi, mm mi) doğrulayıp doğru sabiti kullanın.

## 4) API katmanı

`backend/src/modules/etiket/etiket-sablon.controller.ts` (ya da ZPL endpoint'inin olduğu
controller) içindeki mevcut ZPL üretim endpoint'ine paralel, dil seçilebilen bir yapı ekleyin.
Öneri: mevcut endpoint'e `dil?: 'zpl' | 'ppla'` (default `'ppla'` — çünkü GERÇEK yazıcımız bu)
body/query parametresi ekleyin, dile göre `generateZplFromSablon` ya da `generatePplaFromSablon`
çağırsın. Response şeklini bozmayın (`{ zpl: string }` şeklinde kalabilir, alan adını
değiştirmeyin ki frontend'i kırmayalım — istersen `{ kod: string, dil: string }` gibi daha
genel bir isme geçebilirsiniz ama o zaman TÜM çağıran yerleri (`generateZplFromSablon` API
client fonksiyonu, `etiket-sablon-helpers.ts`) güncellemeniz gerekir; hangisini seçtiğinizi
raporda açıkça belirtin).

## 5) Frontend

`packages/web/src/components/etiket/EtiketBasModal.tsx` içinde şu an sadece ZPL üretiliyor
ve "Kopyala" / "Yazdır" butonları var. Buraya bir dil seçici EKLEMEYİN şimdilik (kapsamı
büyütmeyelim) — bunun yerine `uretEtiketZplTercihli()` fonksiyonunun (ve API client'ın)
varsayılan dilini `ppla` yapın, çünkü şu an elimizdeki TEK gerçek yazıcı PPLA konuşuyor.
ZPL üretim yolu KOD OLARAK kalsın (silmeyin), sadece varsayılan olarak çağrılmasın.

`etiket-sablon-helpers.ts`'teki `uretEtiketZplTercihli()` imzasına bir `dil: 'zpl'|'ppla' = 'ppla'`
parametresi ekleyin, API çağrısına geçirin.

## 6) Ham (raw) yazdırma konusu — ŞİMDİLİK KAPSAM DIŞI, ama belirtin

Mevcut "Yazdır" butonu (`yazdir()` fonksiyonu, `EtiketBasModal.tsx` satır ~108-115) ZPL/PPLA
metnini bir tarayıcı penceresine YAZI olarak basıyor ve `window.print()` çağırıyor — bu,
komutları YORUMLAMADAN düz metin olarak bastırır, EKRAN ÇIKTISI DEĞİL GERÇEK ETİKET ÜRETMEZ.
Üretilen PPLA metnini yazıcıya HAM (raw) байт olarak göndermek (komutların yazıcı tarafından
yorumlanması için) ayrı bir entegrasyon gerektirir — bu talimatın kapsamı DIŞINDA, dokunmayın.
Raporda "raw gönderim entegre edilmedi, ayrı iş" diye NET belirtin. Ben bunu bugün macOS'ta
CUPS'un raw kuyruk özelliğiyle (`lp -o raw` / `lpr -o raw`) elle test edeceğim.

## 7) Test ve rapor

1. `depo-etiketi` ve `gunes-gozlugu-katlanir` şablonları için, `test-pilot-etiket-zpl.ts`
   dosyasındaki AYNI örnek verilerle (UTS'li ve UTS'siz senaryo), PPLA çıktısı üretin.
   Yeni bir `backend/scripts/test-pilot-etiket-ppla.ts` dosyası oluşturup konsola yazdırın.
2. Raporda ÜRETİLEN TAM PPLA METNİNİ (her iki şablon için) birebir paylaşın — ben görüp
   manuel referans alacağım/karşılaştıracağım.
3. Hangi ElementType için PPLA karşılığı BULAMADIĞINIZI ya da EMİN OLMADIĞINIZI (özellikle
   `kutu` çizim komutu ve `gs1Referans` çok satırlı blok) raporda AÇIKÇA listeleyin —
   varsayım yapıp "muhtemelen böyledir" diye geçmeyin.
4. Manuel'den hangi komutu hangi sayfa/bölümden aldığınızı (örn. "A6, sf. 35, `A` komutu")
   raporda referans gösterin — bu benim doğrulamamı hızlandıracak.
5. `tsc --noEmit` temiz olsun.

## 8) Rapor formatı

- Kullandığınız kaynak (hangi PDF/manuel, hangi bölüm/sayfa referanslarıyla)
- Eklenen/değiştirilen dosyalar ve fonksiyonlar
- Her `ElementType` için PPLA komut eşlemesi (tablo halinde: tip → PPLA komutu → örnek)
- Bulunamayan/emin olunmayan noktalar (varsa)
- İki şablon için üretilen TAM PPLA çıktısı (test script çıktısı)
- Y ekseni dönüşümünü nasıl ele aldığınız
- `tsc --noEmit` sonucu
