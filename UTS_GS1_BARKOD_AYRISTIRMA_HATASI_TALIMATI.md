# UTS 400 hatasının asıl nedeni bulundu — GS1 barkod ayrıştırma iki yerde hatalı/eksik

## Bağlam

Görkem'in paylaştığı gerçek UTS barkodu:

```
010868203730100221240100000270*1124111810240100062916
```

Kendi açıklamasıyla bu şu AI'lara (GS1 Application Identifier) ayrışıyor:

- **(01)** Ürün kodu / GTIN: `08682037301002`
- **(21)** Seri no: `240100000270`
- **(11)** Üretim tarihi: `241118`
- **(10)** Lot no: `240100062916`

Kodu inceledim, bu YAPIYI doğru ayrıştıramadığımızı gösteren iki ayrı, somut hata buldum. Az önce
denediği "UTS Verme" bildirimindeki 400 hatası büyük ihtimalle buradan kaynaklanıyor.

## Hata 1 — Manuel "Bildirim" formunda GS1 ayrıştırma HİÇ YOK

`packages/web/src/pages/admin/UtsYonetimiPage.tsx`, `barkodlariEkle()` (satır 400-415):

```ts
function barkodlariEkle() {
  const satirlar = barkodMetin...
  // her satırı virgülle bölüyor:
  barkod: parcalar[0] ?? '',
  seriNo: parcalar[1] ?? '',
  ...
}
```

Bu form, kullanıcının yapıştırdığı metni SADECE virgülle ayırıyor — GS1 element string'i (yukarıdaki
gibi tek parça, AI kodlarıyla iç içe) hiç TANIMIYOR/AYRIŞTIRMIYOR. Yani Görkem az önce yaptığı testte
muhtemelen taranan HAM barkodu (55 karakterlik tüm string'i) doğrudan "Barkod" kutusuna yapıştırdı;
sistem bunu OLDUĞU GİBİ `UNO` alanına koyup TİTCK'e gönderdi
(`backend/src/modules/uts/uts.service.ts`, `gondermeBildiriminiYap()`, satır 134: `body.UNO =
kalem.barkod`). TİTCK, 14 haneli gerçek ürün kodu yerine 55 karakterlik anlamsız bir string görünce
haklı olarak 400 ile reddediyor.

**Karşılaştırma:** `packages/web/src/utils/parseGs1DataMatrix.ts` adında GS1 ayrıştırma için zaten
HAZIR bir yardımcı fonksiyon var (satış/transfer ekranlarında kullanılıyor) — ama UTS Yönetimi'nin
manuel bildirim formu bunu HİÇ ÇAĞIRMIYOR.

### İstenen

`UtsYonetimiPage.tsx`'teki `barkodlariEkle()` fonksiyonuna, her satır eklenmeden önce
`parseGs1DataMatrix`/`isGs1DataMatrix` kontrolü ekleyin:

```ts
import { isGs1DataMatrix, parseGs1DataMatrix } from '../../utils/parseGs1DataMatrix'
```

Her satır için: eğer `isGs1DataMatrix(satir)` true dönüyorsa, `parseGs1DataMatrix()` ile ayrıştırıp
`barkod: parsed.gtin14` (ya da UTS'nin beklediği format neyse — TİTCK genelde 14 haneli GTIN
bekliyor, `gtin13` DEĞİL), `seriNo: parsed.serial`, ve YENİ bir `lotNo: parsed.lot` alanı ekleyin
(şu an `BildirimKalem` tipinde `lotNo` hiç yok, sadece `barkod`/`seriNo`/`adet` var — ekleyin).
Ayrıştırılamazsa (düz barkod/GTIN girilmişse) mevcut virgül-bölme davranışını AYNEN koruyun (geriye
dönük uyumluluk).

Backend tarafında da `BildirimOlusturInput`/`UtsKalemInput` zaten `lotNo` alanını destekliyor
(`uts.service.ts` satır 16-21) — sadece frontend'in bunu doldurup göndermesi gerekiyor,
`bildirim-olustur` endpoint'ini kontrol edip `lotNo`'nun API'ye kadar taşındığından emin olun.

## Hata 2 — Paylaşılan GS1 ayrıştırıcı, AI **(11)** üretim tarihini hiç tanımıyor

`packages/web/src/utils/parseGs1DataMatrix.ts`:

```ts
const FIXED_LENGTH_AIS: Record<string, number> = {
  '01': 14,
  '17': 6,   // sadece SON KULLANMA tarihi (17) tanınıyor
}
const MATCH_AIS = ['240', '01', '17', '10', '21']   // (11) YOK
const VARIABLE_AI_STOP: Record<string, string[]> = {
  '21': ['240', '17'],   // (21) seri no'nun DURMASI gereken AI'lar arasında '11' YOK
}
```

Görkem'in paylaştığı barkodda AI sırası `01 → 21 → 11 → 10` — yani (21) seri no'dan HEMEN SONRA
(17) değil **(11)** üretim tarihi geliyor. Bu ayrıştırıcı (11)'i hiç tanımadığı için:

1. (21) seri no okunurken "hangi AI'da dur" listesinde `11` olmadığından, okuma `11241118...`
   kısmını da SERİ NO'nun içine yanlışlıkla dahil edebilir (ya da string sonuna kadar gidip lot'u
   hiç bulamayabilir).
2. Sonuç olarak `lot` alanı `undefined`/yanlış çıkabilir, `serial` alanı kirlenmiş olabilir — bu da
   hem satış/transfer ekranlarındaki lot eşleştirmesini hem de transfer motorunun otomatik UTS
   bildirimlerine (`transferKalemlerdenUtsKalemler`) giden `lotNo`/`seriNo` verisini bozar.

Backend'de aynı deseni tekrarlayan basitleştirilmiş kopya (`backend/src/modules/transfer/transfer.service.ts`,
satır 11-27: `normalizeGs1Raw`/`looksLikeGs1ElementString`/`extractGs1LotFromRaw`) da SADECE `17`'yi
tanıyor, `11`'i tanımıyor — aynı hata burada da var.

### İstenen

1. `parseGs1DataMatrix.ts`'e AI **`11`** (üretim tarihi, GS1 standardına göre sabit 6 haneli, tıpkı
   `17` gibi) ekleyin:
   ```ts
   const FIXED_LENGTH_AIS: Record<string, number> = {
     '01': 14,
     '11': 6,   // YENİ — üretim tarihi
     '17': 6,   // son kullanma tarihi
   }
   const MATCH_AIS = ['240', '01', '17', '11', '10', '21']   // '11' eklendi
   ```
2. `VARIABLE_AI_STOP['21']`'e `'11'`'i de ekleyin — (21) seri no artık hem (17) hem (11) hem (240)
   hem (10) görünce durabilsin:
   ```ts
   '21': ['240', '17', '11', '10'],
   ```
   (Not: mevcut kodda '21' listesinde '10' de yoktu — GS1 standardında seri no'dan sonra doğrudan
   lot da gelebilir, örn. AI sırası 01→21→10 gibi bir varyant da olabilir; bunu da ekleyin, aksi
   halde o senaryo da bozuk kalır.)
3. `normalizeGs1Raw()` fonksiyonuna, taşıyıcı/scanner'ın FNC1 yerine literal `*` karakteri
   basıyor olabileceği ihtimaline karşı (Görkem'in örneğinde `*` görünüyor) bu karakteri de
   temizleyin: `.replace(/\*/g, '')` ekleyin — mevcut `\x1d` (gerçek FNC1 kontrol karakteri) ve
   parantez temizleme satırına ekleyin.
4. `backend/src/modules/transfer/transfer.service.ts`'deki AYNI basitleştirilmiş parser'a (satır
   11-27) da BİREBİR aynı düzeltmeleri (AI 11 desteği + '*' temizleme) uygulayın — iki kopya
   birbirinden kopmasın.

## Test

1. Görkem'in paylaştığı GERÇEK barkodu (`010868203730100221240100000270*1124111810240100062916`)
   hem frontend'deki `parseGs1DataMatrix()`'e hem backend'deki eşdeğerine verip, çıkan sonucun TAM
   OLARAK şunu verdiğini doğrulayın:
   - `gtin14: '08682037301002'`
   - `serial: '240100000270'`
   - `lot: '240100062916'`
   (üretim tarihi `241118` şu an hiçbir alanda saklanmıyor, saklamaya gerek yok — sadece
   ayrıştırmayı BOZMADAN atlanması yeterli.)
2. UTS Yönetimi → Bildirim sekmesinden bu HAM barkodu "Barkod girişi" kutusuna yapıştırıp "Ekle"
   dediğinizde, artık kalemin `barkod` alanının `08682037301002` (14 hane), `seriNo` alanının
   `240100000270` olarak DOLDUĞUNU gösterin (ham 55 karakterlik string DEĞİL).
2. Bu haliyle gerçek bir "UTS Verme" bildirimi gönderip artık jenerik 400 yerine (varsa
   `UTS_GERCEK_HATA_MESAJI_GIZLENIYOR_TALIMATI.md` uygulandıysa) ya başarı ya da TİTCK'in GERÇEK
   ret nedenini gösterdiğini paylaşın.
3. Mevcut düz/kısa barkod (GS1 olmayan, sadece EAN-13 gibi) girişlerinde regresyon olmadığını
   doğrulayın — `isGs1DataMatrix()` false dönen durumlarda eski davranış AYNEN korunmalı.

## Rapor formatı

Değişen dosyalar/satırlar + test 1'in çıktısı (parse sonucu objesi) + test 2'nin ekran görüntüsü
(barkod/seriNo alanlarının doğru dolduğu) + gerçek UTS gönderim sonucu.
