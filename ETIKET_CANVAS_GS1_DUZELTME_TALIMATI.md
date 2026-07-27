# Canvas Render — GS1 Data Matrix Girdi Formatı Hatası

`etiket-canvas-render.ts` → `drawGs1DataMatrix()` fonksiyonu şu an `buildGs1Data(veri)`'nin
ürettiği ham string'i (parantezsiz AI kodları + elle eklenmiş `\x1d` GS karakteri) doğrudan
`bwipjs.toCanvas(tmp, { bcid: 'gs1datamatrix', text: gs1, ... })`'e veriyor.

## Sorun

bwip-js'in resmi dokümantasyonu (bwipp/postscriptbarcode wiki, "GS1 DataMatrix" sayfası):
`gs1datamatrix` girdisi AI kodlarının PARANTEZ İÇİNDE olmasını bekliyor, örn.
`(01)02900285850353(21)ABC123(17)260624`. FNC1/GS ayraçlarını **bwip-js kendisi otomatik
ekliyor** — elle `\x1d` (GS, 0x1D) karakteri koymaya gerek yok, hatta bu yanlış.

`buildGs1Data()` (hem `etiket-zpl.ts`'te hem yeni `etiket-canvas-render.ts`'te) ham
PPLA/ZPL komut metni için tasarlandı — parantezsiz, elle `\x1d` eklenmiş. Bu format
sadece doğrudan yazıcıya gönderilen ham komutlarda doğru, bwip-js'e verilecek girdi
için YANLIŞ.

## Düzeltme

`etiket-canvas-render.ts` içinde, `buildGs1Data()`'yı DEĞİŞTİRMEYİN (ham PPLA/ZPL yolu
hâlâ ona ihtiyaç duyuyor) — bunun yerine bwip-js için AYRI, parantezli bir fonksiyon
yazın:

```ts
/** bwip-js gs1datamatrix icin AI-parantezli format (FNC1/GS otomatik eklenir, elle koymayin) */
function buildGs1DataForBwip(veri: EtiketRenderVeri): string {
  const gtin = gtin14(veri)
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim())
  const skt = veri.sktTarihi ? sktYyAagg(veri.sktTarihi) : undefined
  const lot = veri.lotNo && veri.lotNo !== '-' ? veri.lotNo : undefined
  const seri = veri.seriNo && veri.seriNo !== '-' ? veri.seriNo : undefined

  let s = `(01)${gtin}`
  if (utsVarMi && skt) s += `(17)${skt}`
  if (lot) s += `(10)${lot}`
  if (seri) s += `(21)${seri}`
  return s
}
```

Ve `drawGs1DataMatrix` çağrısını bu yeni fonksiyonu kullanacak şekilde değiştirin:

```ts
if (el.type === 'gs1datamatrix') {
  drawGs1DataMatrix(ctx, el, buildGs1DataForBwip(veri))  // buildGs1Data(veri) DEGIL
  return
}
```

## Test

1. Değişiklikten sonra üretilen Data Matrix'i gerçek bir GS1 barkod okuyucu uygulamasıyla
   (örn. "Barcode Scanner" veya herhangi bir GS1-uyumlu tarayıcı — sadece kamera QR
   okuyucu değil) tarayın, AI alanlarının (01, 17, 10, 21) doğru ayrıştığını doğrulayın.
2. Parantez karakterlerinin kendisinin barkoda DATA olarak girmediğini (yani "(01)" harfen
   değil, AI ayracı olarak yorumlandığını) teyit edin — bwip-js dokümantasyonu bunu
   otomatik garanti ediyor, parantezler asla veri olarak encode edilmiyor.
3. `tsc --noEmit` temiz olsun.

## Kapsam dışı

`buildGs1Data()` (parantezsiz, ham `\x1d`'li versiyon) `etiket-zpl.ts` ve `etiket-ppla.ts`
içindeki PPLA/ZPL komut üretiminde DOĞRU ve dokunulmamalı — sadece canvas/bwip-js yolu
için yeni, ayrı bir fonksiyon eklenecek.
