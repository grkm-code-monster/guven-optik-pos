# Etiket Motoru Birleştirme + 2 Pilot Şablon — BUGÜN BİTİRİLECEK

Bu, önceki mimari tartışmasının doğrudan devamı ve UYGULAMA talimatıdır. Görkem'in kararı: bugün
bitecek, hiçbir adım Cursor'ın kendi takdirine bırakılmayacak, her aşama sonunda RAPOR VERİLECEK
ve bir sonraki aşamaya geçmeden önce onay beklenecek. Bu talimatta yazmayan hiçbir şey
eklenmeyecek, yazan hiçbir şey atlanmayacak. Emin olunmayan bir nokta varsa TAHMİN ETMEYİN,
raporda açıkça "bu net değil, şu iki seçenekten hangisi?" diye sorun.

## 0) Kapsam — bugün SADECE bunlar yapılacak

**Yapılacak:**
1. Backend'de zaten var olan ama hiç kullanılmayan genel motoru (`EtiketSablonu` Prisma modeli,
   `backend/src/modules/etiket/etiket-zpl.ts`, `/etiket/sablon*` endpoint'leri) TAMAMLAYIP ilk
   gerçek kullanıcısına kavuşturmak.
2. Bugün Görkem ile tasarlanan 2 pilot şablonu (**Depo Etiketi 30×50mm**, **Güneş Gözlüğü Katlanır
   102×20mm**) bu genel motora JSON `elemanlar` kaydı olarak eklemek (madde 4-5'te TAM JSON
   verilmiştir, AYNEN kullanılacak).
3. Bu 2 şablonun elemanlarını (metin/font/x/y) düzenleyebilecek MİNİMAL bir "Şablon Düzenleyici"
   arayüzü kurmak (madde 6 — sürükle-bırak DEĞİL, tek satırlık alan listesi, bugünkü widget
   oturumlarındaki desenin aynısı).
4. SADECE bu 2 şablonun gerçek "Etiket Bas" akışını yeni motora bağlamak (madde 7).

**Yapılmayacak (kapsam dışı, bugün DOKUNULMAYACAK):**
- PPLB, TSPL, PDF, PNG çıktı üreticileri — SADECE ZPL.
- `optik-cerceve-uts`, `kampanya-yuzde`, `kampanya-fiyat`, `kampanya-ikinci`, eski `depo-kutu`
  şablonlarının yeni sisteme taşınması — bunlar ESKİ sistemde (`sablon-registry.ts`/`sablon-zpl.ts`)
  ÇALIŞMAYA DEVAM EDECEK, dokunulmayacak.
- Gerçek sürükle-bırak/canvas tasarım editörü.
- `FiyatBildirimPanel.tsx`, `FiyatDegisenUrunlerTab.tsx`, `BildirimPanel.tsx`'in kullandığı eski
  `EtiketItem`/`generateZpl()` (sistem #3) yolunun değiştirilmesi.
- Yazıcıya doğrudan (soket/driver) bağlanma — bugün de ZPL metni üretilip Görkem'in Argox
  yazılımına yapıştırılmaya devam edilecek, bu akışı değiştirmiyoruz.

## 1) Şema değişiklikleri

### 1.1 `EtiketSablonu` modeline `slug` alanı ekleyin

`backend/prisma/schema.prisma`'daki `EtiketSablonu` modeline:
```prisma
slug String? @unique
```
ekleyin, yeni bir migration oluşturun (`npx prisma migrate dev` DEĞİL — bu oturumda daha önce
konuşulduğu gibi migration'lar dikkatli, elle, yedek alınarak uygulanıyor; sadece migration
DOSYASINI oluşturun, Görkem kendisi çalıştıracak). `slug`, kodun hangi DB kaydının "gunes-aksesuar
yerine geçen pilot" olduğunu bilmesi için sabit bir referans noktası — `id` (cuid, rastgele) buna
uygun değil.

### 1.2 `backend/src/modules/etiket/etiket-zpl.ts` — element ve veri tiplerini genişletin

`ElementType` union'ına şunları EKLEYİN (var olanları SİLMEYİN):
```ts
| 'kutu'              // boş, sadece çerçeve — hiçbir zaman veri/metin göstermez
| 'barkodMetin'       // barkod değerinin insan-okunur metin kopyası (barkod görselinin altına)
| 'model'             // veri.icReferans'ı "model kodu" olarak gösterir
| 'renkKodu'          // veri.renkVaryant'ı "renk kodu" olarak gösterir
| 'nitelik'           // Model/Renk/Ölçü kısa birleşik gösterim (bkz 1.4)
| 'fiyatDegisimTarihi'// "FİYAT DEĞİŞİM TARİHİ: {tarih}" sabit önekli
| 'gs1Referans'       // çok satırlı UTS-öncelikli GS1 AI bloğu (bkz 1.3)
```

`CanvasElement` tipine ekleyin:
```ts
fontWeight?: 'normal' | 'bold';
lineGap?: number;   // sadece gs1Referans için, satır aralığı (dot), varsayılan fontSize+2
mode?: 'uts' | 'lotseri' | 'oto';  // sadece gs1Referans için (bkz 1.3)
```

`EtiketVeri` tipine ekleyin:
```ts
lotNo?: string;
sktTarihi?: string;   // YYAAGG (UTS format)
```
(`model`/`renkKodu` için AYRI alan EKLEMEYİN — mevcut `icReferans`/`renkVaryant` alanları yeniden
kullanılacak, madde 1.2'deki yeni ElementType'lar bunları farklı etiketle gösterecek. Bunun
nedeni: gereksiz alan çoğaltmamak, tek veri kaynağını korumak.)

### 1.3 GS1 mantığı — TEK yerde, iki element tipi bunu paylaşacak (ÖNEMLİ, dikkatli okuyun)

Şu an `buildGs1Data(veri)` fonksiyonu sadece `(01){gtin}(21){seri}` üretiyor — UTS'nin gerektirdiği
`(17)` (SKT) ve `(10)` (Lot) alanlarını ATLIYOR. Bu YANLIŞ ve düzeltilmesi gerekiyor, çünkü karekod
(`gs1datamatrix` elementi) gerçek bir tarayıcıyla okunacak — içeriği eksikse UTS/depo tarama
sistemleri bunu kabul etmez.

Yeni ortak mantık (tek fonksiyon, iki yerde kullanılacak):

```ts
const FNC1 = '\x1d'; // gs1-parser.util.ts'teki (backend/src/modules/odoo/) ile AYNI karakter, oradan referans alın, farklı bir ayraç İCAT ETMEYİN

function gs1AiVerileri(veri: EtiketVeri): { gtin: string; skt?: string; lot?: string; seri?: string; utsVarMi: boolean } {
  const gtin = String(veri.utsKodu ?? veri.barkod ?? '').replace(/\D/g, '').padStart(14, '0').slice(-14);
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim());
  return { gtin, skt: veri.sktTarihi, lot: veri.lotNo, seri: veri.seriNo, utsVarMi };
}

// Karekodun İÇİNE gömülecek gerçek GS1 element string (tarayıcı için)
function buildGs1Data(veri: EtiketVeri): string {
  const { gtin, skt, lot, seri, utsVarMi } = gs1AiVerileri(veri);
  if (utsVarMi) {
    let s = `01${gtin}`;
    if (skt) s += `17${skt}`;
    if (lot) s += `${FNC1}10${lot}`;
    if (seri) s += `${FNC1}21${seri}`;
    return s;
  }
  let s = `01${gtin}`;
  if (lot) s += `${FNC1}10${lot}`;
  if (seri) s += `${FNC1}21${seri}`;
  return s;
}

// Karekodun YANINA/ALTINA yazılacak, insan-okunur AI satırları
function gs1ReferansSatirlari(veri: EtiketVeri, mode: 'uts' | 'lotseri' | 'oto' = 'oto'): string[] {
  const { gtin, skt, lot, seri, utsVarMi } = gs1AiVerileri(veri);
  const kullanUts = mode === 'uts' || (mode === 'oto' && utsVarMi);
  if (kullanUts) {
    const lines = [`(01) ${gtin}`];
    if (skt) lines.push(`(17) ${skt}`);
    if (lot) lines.push(`(10) ${lot}`);
    if (seri) lines.push(`(21) ${seri}`);
    return lines;
  }
  const lines: string[] = [];
  if (lot) lines.push(`(10) ${lot}`);
  if (seri) lines.push(`(21) ${seri}`);
  return lines;
}
```

**Doğrulama:** `backend/src/modules/odoo/gs1-parser.util.ts`'i açıp FNC1 karakterinin gerçekten
`'\x1d'` olduğunu TEYİT EDİN (bu oturumda daha önce doğrulanmıştı ama siz de kontrol edin), farklıysa
oradaki gerçek değeri kullanın, yukarıdaki kodu ona göre düzeltin.

### 1.4 `nitelikKisa()` — mevcut mantığı taşıyın, yeniden yazmayın

`packages/web/src/components/etiket-tasarimci/sablon-zpl.ts` satır ~69'daki `nitelikKisa(raw: string): string`
fonksiyonunu AYNEN (mantığını değiştirmeden) `backend/src/modules/etiket/etiket-zpl.ts` içine
taşıyın/kopyalayın. `nitelik` elementi bunu şöyle çağıracak:
```ts
case 'nitelik':
  return nitelikKisa(String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? ''));
```

### 1.5 `resolveElementText`'e yeni case'ler ekleyin

```ts
case 'kutu':
  return null; // metin yok, elementToZpl'de ayrıca ele alınacak
case 'barkodMetin':
  return veri.barkod ?? veri.icReferans ?? '';
case 'model':
  return veri.icReferans ?? '';
case 'renkKodu':
  return veri.renkVaryant ?? '';
case 'fiyatDegisimTarihi':
  return `FİYAT DEĞİŞİM TARİHİ: ${veri.sonGuncelleme ?? ''}`;
case 'gs1Referans':
  return null; // çok satırlı, elementToZpl'de ayrıca ele alınacak
```

### 1.6 `elementToZpl`'e yeni dallar ekleyin

```ts
if (el.type === 'kutu') {
  const w = Math.round(el.width ?? 50);
  const h = Math.round(el.height ?? 30);
  return `^FO${x},${y}^GB${w},${h},1^FS`;
}

if (el.type === 'gs1Referans') {
  const satirlar = gs1ReferansSatirlari(veri, el.mode ?? 'oto');
  const font = Math.round(el.fontSize ?? 8);
  const gap = Math.round(el.lineGap ?? (font + 2));
  return satirlar
    .map((line, i) => `^FO${x},${y + i * gap}^A0N,${font},${font}^FD${escapeZpl(line)}^FS`)
    .join('\n');
}
```
(Not: `barkodMetin`, `model`, `renkKodu`, `fiyatDegisimTarihi` mevcut genel metin dalına
`fontWeight` desteğiyle otomatik düşer, ayrı `if` gerekmez — ama `fontWeight==='bold'` durumunda
ZPL font ailesini `^A0N` yerine kalın bir varyanta (örn. aynı `^A0N` ama daha büyük font YA DA
`^A0B` gibi ZPL'nin desteklediği bold font seçeneği varsa) çevirip çevirmeyeceğinizi kontrol edin —
ZPL'de `^A0N` zaten "normal" rotasyon anlamına gelir, kalınlık için farklı bir yazı tipi (`^AD`
gibi) gerekebilir. Emin değilseniz mevcut `sablon-zpl.ts`'teki `textZpl`'in bold için ne yaptığını
inceleyin (muhtemelen HİÇBİR ŞEY yapmıyor, sadece font boyutunu büyütüyor) — aynı davranışı
koruyun, YENİ bir ZPL font komutu İCAT ETMEYİN.)

## 2) Sırayla mı, paralel mi — SIRAYLA yapın

Madde 1 bitmeden madde 4/5'e geçmeyin (JSON'lar yeni element tiplerine bağımlı). Madde 1 bitince
KISA bir rapor verin ("1.1-1.6 tamamlandı, dosya/satır listesi"), ben onaylamadan devam etmeyin.

## 3) Backend derleme/tip kontrolü

Madde 1 sonunda `cd backend && npx tsc --noEmit` (ya da projede kullanılan build/typecheck komutu
neyse) çalıştırıp hatasız derlendiğini raporda belirtin.

## 4) Pilot şablon 1 — Depo Etiketi (30×50mm), TAM JSON (aynen kullanılacak)

```json
{
  "ad": "Depo Etiketi (30x50mm)",
  "kategori": "GENEL",
  "slug": "depo-etiketi",
  "etiketGenislik": 30,
  "etiketYukseklik": 50,
  "elemanlar": [
    { "id": "barkod", "type": "barcode128", "x": 10, "y": 8, "width": 220, "height": 90 },
    { "id": "barkodNo", "type": "barkodMetin", "x": 10, "y": 104, "fontSize": 13 },
    { "id": "urunAdi", "type": "urunAdi", "x": 10, "y": 130, "fontSize": 16, "fontWeight": "bold" },
    { "id": "nitelik", "type": "nitelik", "x": 10, "y": 158, "fontSize": 11, "width": 106 },
    { "id": "sonSayim", "type": "sonGuncelleme", "x": 124, "y": 158, "fontSize": 9 },
    { "id": "cerceveTuruLabel", "type": "serbestMetin", "text": "Çerçeve Türü", "x": 10, "y": 180, "fontSize": 8 },
    { "id": "cerceveTuruKutu", "type": "kutu", "x": 10, "y": 190, "width": 106, "height": 34 },
    { "id": "materyalLabel", "type": "serbestMetin", "text": "Materyal", "x": 124, "y": 180, "fontSize": 8 },
    { "id": "materyalKutu", "type": "kutu", "x": 124, "y": 190, "width": 106, "height": 34 }
  ]
}
```

**Not — veri eksikliği hatırlatması (önceki talimattan taşınıyor):** `sonSayim` elementi şu an
`sonGuncelleme` (son fiyat/stok güncelleme tarihi) değerini GEÇİCİ olarak gösteriyor — sistemde
gerçek "son sayım tarihi" takibi YOK (ayrı bir "sayım ekranı" işi, kapsam dışı, daha önce
konuşuldu). `cerceveTuruKutu`/`materyalKutu` KASITLI OLARAK boş — hiçbir veriye bağlanmayacak,
Görkem elle dolduracak.

## 5) Pilot şablon 2 — Güneş Gözlüğü Etiketi Katlanır (102×20mm), TAM JSON (aynen kullanılacak)

```json
{
  "ad": "Güneş Gözlüğü Etiketi (Katlanır)",
  "kategori": "GUNES",
  "slug": "gunes-gozlugu-katlanir",
  "etiketGenislik": 102,
  "etiketYukseklik": 20,
  "elemanlar": [
    { "id": "barkod", "type": "barcode128", "x": 334, "y": 16, "width": 147, "height": 27 },
    { "id": "barkodNo", "type": "barkodMetin", "x": 334, "y": 58, "fontSize": 11 },
    { "id": "urunAdi", "type": "urunAdi", "x": 290, "y": 74, "fontSize": 14, "fontWeight": "bold" },
    { "id": "model", "type": "model", "x": 290, "y": 90, "fontSize": 13 },
    { "id": "renkKodu", "type": "renkKodu", "x": 341, "y": 90, "fontSize": 13 },
    { "id": "fiyat", "type": "fiyat", "x": 388, "y": 112, "fontSize": 26, "fontWeight": "bold" },
    { "id": "fiyatTarihi", "type": "fiyatDegisimTarihi", "x": 289, "y": 131, "fontSize": 10 },
    { "id": "kdv", "type": "kdvDahildir", "x": 289, "y": 144, "fontSize": 10 },
    { "id": "karekod", "type": "gs1datamatrix", "x": 569, "y": 18, "width": 94, "height": 94 },
    { "id": "gs1Referans", "type": "gs1Referans", "x": 665, "y": 38, "fontSize": 13, "lineGap": 16, "mode": "oto" }
  ]
}
```

**Fiziksel not:** Etiketin sol 280 dot'luk (35mm) bölümü ince çekme çubuğu — ÖNCEDEN KESİLMİŞ
(die-cut) etiket kağıdından geldiği için içerik koordinatları zaten bu bölgeye HİÇ girmiyor
(en soldaki eleman x=289'dan başlıyor). Bu tasarım kararı önceki "GÜNEŞ GÖZLÜĞÜ ETİKETİ KATLANIR
TASARIM TALIMATI" dosyasında zaten detaylandırıldı — o dosyanın "0) ÖNEMLİ" bölümünü okuyun, aynı
mantık geçerli.

**UTS testi:** `mode:"oto"` demek — üründe `utsKodu` doluysa otomatik 4 satır (01)(17)(10)(21),
boşsa sadece dolu olan (10)/(21) satırları basılacak (madde 1.3). Bunu iki farklı örnek ürünle
(biri UTS'li, biri sadece lot/seri'li) test edip İKİ FARKLI ZPL çıktısını raporda gösterin.

## 6) Şablon Düzenleyici — minimal, YENİ bir sayfa (mevcut `EtiketTasarimciPage.tsx`'e DOKUNMAYIN)

Mevcut `EtiketTasarimciPage.tsx` eski sistemi (`sablon-registry.ts`) kullanıyor, kampanya/optik
şablonları hâlâ ona bağımlı — DEĞİŞTİRMEYİN, BOZMAYIN.

Yeni, ayrı bir sayfa/route ekleyin (öneri: `packages/web/src/pages/admin/EtiketSablonDuzenleyici.tsx`,
route `/admin/etiket-sablon-duzenleyici`, `AdminLayout.tsx`'teki menüye "Etiket Şablonları (Yeni)"
gibi bir giriş ekleyin). Kapsam MİNİMAL:

1. Sayfa açılışta `GET /etiket/sablonlar` çağırıp liste gösterir (mevcut `getEtiketSablonlari()`
   fonksiyonu `etiket.api.ts`'de zaten var, kullanın).
2. Bir şablon seçilince `elemanlar` dizisi listelenir — HER ELEMAN İÇİN TEK SATIRDA: `id`/`type`
   etiketi (salt okunur), metin içeriği varsa (`text` alanı olan `serbestMetin` gibi elemanlar
   için) bir metin kutusu, `fontSize` için sayı kutusu, `x`/`y` için iki sayı kutusu (bugünkü
   widget oturumlarındaki gibi ▲▼◀▶ buton da olabilir, sayı kutusu da yeterli — hangisi daha az iş
   gerektiriyorsa onu seçin, ikisi de kabul).
3. Sağda/üstte CANLI ÖNİZLEME: seçili şablonun `elemanlar`'ını `SablonVeri` benzeri örnek bir veri
   ile HTML/SVG olarak (bugünkü widget'lardaki gibi basit dikdörtgen/metin render'ı, ZPL üretmeye
   gerek yok, sadece x/y/fontSize'a göre konumlandırılmış `<div>`/`<text>` yeterli) gösterir. `mm
   → px` ölçeği: `DOTS_PER_MM=8` kullanılarak `px = dot / 8 * (görüntü_mm_ölçeği)` — sabit bir
   ölçek (örn. 4px/mm) yeterli.
4. "Kaydet" butonu değişen `elemanlar` dizisini `PUT /etiket/sablon/:id` ile gönderir (mevcut
   `guncelleEtiketSablon()` fonksiyonu zaten var).
5. YENİ ELEMAN EKLEME/SİLME, sürükleme, palet — BUGÜN GEREKLİ DEĞİL. Sadece var olan elemanları
   düzenleyebilmek yeterli.

Bu sayfa ile Görkem madde 4/5'teki iki pilot şablonu ilerde (bugün değil, istediği zaman) tekrar
açıp ince ayar yapabilecek — amaç bu.

## 7) Gerçek "Etiket Bas" akışına bağlama — SADECE 2 pilot şablon için

`packages/web/src/components/etiket/etiket-sablon-helpers.ts`'teki `otomatikSablonSec()` şu an bir
`SablonId` (eski sistem string literal'i) döndürüyor. Bunu DEĞİŞTİRMEYİN. Bunun yerine
`EtiketBasModal.tsx`'te (satır ~63 `etiketBas()` fonksiyonu) şu mantığı ekleyin:

- `sablonId === 'gunes-aksesuar'` VE seçili ürünün kategorisi güneş gözlüğü ise → ESKİ
  `uretCokluEtiketZpl()` yerine YENİ yolu kullanın: `packages/web/src/api/etiket.api.ts`'teki
  mevcut `generateZplFromSablon()` fonksiyonunu çağırın, body: `{ sablonId: '<gunes-gozlugu-katlanir
  DB id, slug ile bulunacak>', etiketler: [...seçili ürünler, EtiketVeri şekline map'lenmiş...] }`.
  DB id'yi slug'tan bulmak için `GET /etiket/sablonlar` sonucunu (ya da tek satır ekleyip
  `GET /etiket/sablon/slug/:slug` gibi yeni bir endpoint — hangisi daha az değişiklikse onu seçin,
  YENİ endpoint eklerseniz `etiket.controller.ts`'e ekleyin ve raporda belirtin) kullanın.
- Aynı mantık `sablonId === 'depo-kutu'` (eski depo etiketi seçimi) için, YENİ pilot
  `'depo-etiketi'` slug'ına yönlendirerek.
- Diğer TÜM `sablonId` değerleri için (optik-cerceve-uts, kampanya-*) MEVCUT `uretCokluEtiketZpl()`
  yolu AYNEN kalsın — DOKUNMAYIN.

Bu, kapsam-0'daki "SADECE 2 pilot şablonun akışını bağlama" isteğinin somut karşılığı.

## 8) Ölü kod — SİLMEYİN, sadece raporlayın

`packages/web/src/components/etiket-tasarimci/constants.ts` ve `.../zpl.ts` (backend'deki
`etiket-zpl.ts`'in KULLANILMAYAN bir kopyası/öncülü) — bugünkü değişikliklerden SONRA tekrar
`grep` ile bu iki dosyanın hâlâ hiçbir yerden import edilmediğini doğrulayın. Doğrulanırsa SİLMEYİN
— raporda "X ve Y dosyaları hâlâ referanssız, silinebilir, karar sizde" diye belirtin. Silme kararı
Görkem'e ait, bugünkü işin parçası değil.

## 9) Test / Rapor — HER AŞAMA için ayrı, toplamda şunlar kanıtlanacak

1. Madde 1: `tsc --noEmit` temiz.
2. Madde 4/5: her iki pilot şablon `EtiketSablonu` tablosunda `slug` ile bulunabiliyor (seed
   script'in çıktısı/DB sorgusu ekran görüntüsü ya da metin çıktısı).
3. Madde 5 UTS testi: aynı ürün için UTS'li ve UTS'siz iki ayrı ZPL çıktısı, farklı satır sayısıyla.
4. Madde 6: yeni Şablon Düzenleyici sayfasında bir elemanın (örn. fiyat font boyutu) değiştirilip
   kaydedildiğini, DB'den tekrar çekildiğinde değişikliğin kalıcı olduğunu gösterin.
5. Madde 7: gerçek "Etiket Bas" modalından bu 2 pilot şablonla üretilen ZPL'in madde 4/5'teki JSON
   ile TUTARLI (aynı koordinatlar) olduğunu gösterin; diğer (optik/kampanya) şablonların ESKİ
   yoldan hâlâ çalıştığını (regresyon yok) doğrulayın.
6. Madde 8: ölü kod grep sonucu.

## Rapor formatı

Her aşama (1, 4-5, 6, 7, 8) bittiğinde AYRI bir mesajla: değişen dosyalar/satırlar + o aşamanın
test sonucu. Belirsiz/eksik bir nokta varsa TAHMİN ETMEYİN, açıkça sorun. Talimatta yazmayan hiçbir
ek özellik/element tipi/sayfa EKLEMEYİN.
