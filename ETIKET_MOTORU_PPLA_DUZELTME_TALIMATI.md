# PPLA Üretici — 3 Kritik Düzeltme

Raporunuzu ben de aynı kaynaktan (a-one.uz PPLA Programmer's Manual, Mercury Series V1.00)
bağımsız doğruladım. Text/Bar Code/Box komutlarınız manuelin örnekleriyle karakter karakter
eşleşiyor, doğru. Ama şu 3 nokta manuelin kendi örneklerine göre HATALI — düzeltin:

## 1) `<STX>` kontrol baytı eksik

`generatePplaFromSablon()` bloğu şu an `L\n${PPLA_D_COMMAND}\n...\nE` üretiyor.
Manuelin İSTİSNASIZ HER örneği (`A5. LABEL FORMATTING COMMANDS` altındaki tüm örnekler,
`A6` altındaki Text/Bar Codes/Line/Box örnekleri) etiket bloğunu `<STX>L<CR>` ile açıyor
(`<STX>` = 0x02 kontrol baytı, harf 'L' değil, 'L'DEN ÖNCE gelen ayrı bir kontrol karakteri).
Örnek (Manual sf.46, Fig. A5-3): `<STX>L<CR>` + `D23<CR>` + `...` + `E<CR>`.

Düzeltme: blok `'\x02L\r' + PPLA_D_COMMAND + '\r' + ... + 'E'` şeklinde başlamalı (aşağıdaki
madde 2 ile birlikte, satır sonu karakteri de değişecek).

## 2) Satır sonu `\n` değil `<CR>` (0x0D) olmalı

Manuelin HER satırı `<CR>` ile bitiyor (örn. `D11<CR>`, `1E0004000800140TO JIMMY<CR>`, `E<CR>`).
Varsayılan end-of-line kodu `<CR>`dir; `T` komutuyla değiştirilebiliyor ama biz hiç göndermiyoruz,
yani printer `<CR>` bekliyor. Kod şu an `\n` (LF, 0x0A) ile satırları birleştiriyor — bunu `\r`
(CR, 0x0D) ile değiştirin. `generatePplaFromSablon` ve `generatePplaBatchFromSablon` içindeki
TÜM `\n` kullanımlarını (satır birleştirme ve komutlar arası) `\r`'ye çevirin. Test scriptindeki
konsola yazdırma kısmı okunabilirlik için `\n` gösterebilir (fark etmez, o sadece ekran çıktısı) —
ama gerçek üretilen PPLA STRING'İ `\r` kullanmalı.

## 3) Data Matrix komutunda 1 karakter eksik — GS1 verisinin ilk karakteri düşüyor

Manuel söz dizimi (sf.104): `aW1cbdeeeffffgggg200jjjkkkddddddddd...dd`

`X` koordinatından (`gggg`) sonra gelen sabit/otomatik blok TAM OLARAK şu 10 karakter:
`"200"` (ECC200 sabit, 3 hane) + `"0"` (sabit, 1 hane) + `jjj` (satır sayısı, 3 hane,
`"000"`=otomatik) + `kkk` (sütun sayısı, 3 hane, `"000"`=otomatik) = **10 karakter**.

`pplaDataMatrix()` şu an `"200000000"` yazıyor (9 karakter — bunu saydım, `2` + sekiz `0`).
Olması gereken: `"2000000000"` (`2` + DOKUZ `0` — yani `"200"+"0"+"000"+"000"`).

Düzeltme: `etiket-ppla.ts` içinde
```ts
return `1W1c${mod}${mod}000${pad4(pplaY)}${pad4(x)}200000000${data}`;
```
satırını
```ts
return `1W1c${mod}${mod}000${pad4(pplaY)}${pad4(x)}2000000000${data}`;
```
şeklinde değiştirin (`200000000` → `2000000000`, bir sıfır eklendi). Değişikliği yaptıktan sonra
karakter sayarak (`"2000000000".length === 10`) doğrulayın, gözle bakıp geçmeyin.

## Test

1. `test-pilot-etiket-ppla.ts` çıktısını TEKRAR üretin, bu sefer üretilen string'in byte
   uzunluğunu ve `\r`/`\x02` içerdiğini doğrulayan bir assertion ekleyin (örn.
   `zpl.startsWith('\x02L\r')`, `zpl.includes('\r')`, DataMatrix satırının `"2000000000"`
   alt dizisini içerdiğini kontrol eden bir test).
2. Raporda üretilen tam string'i bu sefer kontrol karakterlerini görünür şekilde (örn.
   `<STX>` ve `<CR>` olarak yazıp) paylaşın, ben tekrar manuel ile karşılaştıracağım.
3. `tsc --noEmit` temiz olsun.

## Kapsam dışı — dokunmayın

Diğer her şey (Text, Bar Code 128, Box komutları, Y ekseni dönüşümü, ASD font eşlemesi,
D11 seçimi, dosya/API mimarisi) doğrulandı ve doğru — bunlara dokunmayın, sadece yukarıdaki
3 maddeyi düzeltin.
