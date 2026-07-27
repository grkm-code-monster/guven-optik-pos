# Envanter Girişi (Excel) — UTS Kodu ham GS1 string olarak kayıt ediliyor, lot yapısı bozuluyor

## Durum — ekran görüntüleriyle doğrulandı

Görkem, Depo Yönetimi → Envanter Girişi Excel aracına "UTS Kodu" sütununu doldurup (örnek:
`0108693283900499211266111804091 0ZS1001901` gibi ham GS1 DataMatrix tarama string'leri) aktardı.
Sonuç: Stok Kontrol'de ZAROSSI OPTİK ÇERÇEVE (ZA10019, barkod 22442529) satırını genişletince
**"Bu ürün için lot/UTS kaydı yok"** çıkıyor — Excel'de UTS kodu doluydu ama sisteme hiç
yansımamış. Görkem'in talebi net: **"her ürün varyantına ya da ürünse sadece ürüne, bizim lot
yapımıza uygun bir yapıyla LOT atması lazım"** — yani bu import, sistemin GERİ KALANINDA zaten
kurulu olan lot/UTS mimarisiyle TUTARLI kayıt üretmeli.

## Kök neden (kodda doğrulandı)

`backend/src/modules/admin/envanter-import-uygula.service.ts`, `uygulaEnvanterImport()` satır 213-221:

```ts
const lotNo = row.utsKodu?.trim() || row.barkod.trim();
const lotResult = await getOrCreateStockLot(
  lotNo, varyantId, companyId, row.barkod, row.utsKodu || undefined,
);
```

`backend/src/modules/admin/stock-lot.service.ts`, `getOrCreateStockLot()` satır 80-82:

```ts
const lotVals: Record<string, unknown> = { name: lotNo, product_id: productId };
if (barkod) lotVals.ref = barkod;
if (utsKodu) lotVals.x_uts_kodu = utsKodu;
```

**Sorun:** Excel'deki "UTS Kodu" hücresi, TİTCK/GS1 DataMatrix'in HAM, ayrıştırılmamış tarama
string'i (GTIN(01) + Seri(21) + Üretim Tarihi(11) + Lot(10) gibi birleşik AI kodları içeriyor —
tıpkı daha önce `UTS_GS1_BARKOD_AYRISTIRMA_HATASI_TALIMATI.md`'de çözdüğümüz manuel UTS bildirim
formundaki ham string sorunuyla AYNI desen). Bu kod bu ham string'i **HİÇ AYRIŞTIRMADAN**:

1. Doğrudan `stock.lot`'un `name` (yani LOT/SERİ NUMARASI) alanına yazıyor — oysa bu alanın normalde
   sistemin geri kalanında (POS satış, transfer, UTS bildirim akışları) kullandığı TEMİZ bir
   seri/lot numarası olması bekleniyor.
2. Aynı ham string'i `x_uts_kodu` alanına da AYNEN yazıyor.

Bu, hem "lot yapımıza uygun değil" (Görkem'in şikayeti — lot no artık 40+ karakterlik anlamsız bir
string) hem de muhtemelen UTS kodu görünmeme sorununun kaynağı: `x_uts_kodu` başka yerlerde
(`transfer.service.ts` satır 821, `POS`/`Stok Kontrol`'ün UTS arama/gösterim akışları) TAM
EŞLEŞME (`x_uts_kodu = term`) ile aranıyor/gösteriliyor — ham, normalize edilmemiş bir string
burada tutarsızlık yaratabilir (örn. görünmez karakter/boşluk farkı, ya da `getOrCreateStockLot`
içindeki `isLotAvailableForReceipt` kontrolünün bu anlamsız "lot no" ile beklenmedik şekilde
davranması).

**Karşılaştırma — doğru olan yer zaten var:** `packages/web/src/utils/parseGs1DataMatrix.ts`
(kanonik, doğru GS1 ayrıştırıcı — AI 01/10/11/17/21 hepsi destekleniyor) ve
`backend/src/modules/transfer/transfer.service.ts`'teki basitleştirilmiş kopyası
(`normalizeGs1Raw`, `looksLikeGs1ElementString`, `extractGs1LotFromRaw`). **Bu import akışı bu
ayrıştırıcılardan HİÇBİRİNİ kullanmıyor** — ham string'i olduğu gibi işliyor.

## İstenen

### 1) Backend'de paylaşılan bir GS1 ayrıştırıcı olsun (üçüncü bir kopya YAZMAYIN)

Şu an backend'de `transfer.service.ts` içinde GÖMÜLÜ, basit bir GS1 ayrıştırıcı var. Bunu ortak bir
dosyaya (örn. `backend/src/modules/odoo/gs1-parser.util.ts`) çıkarıp, frontend'deki
`parseGs1DataMatrix.ts`'in AYNI mantığını (AI 01/10/11/17/21, `*`→FNC1 dönüşümü, FNC1 durdurma)
birebir yansıtacak şekilde güçlendirin — `transfer.service.ts` bu ortak fonksiyonu kullanacak
şekilde refactor edilsin, `envanter-import-uygula.service.ts` da AYNI ortak fonksiyonu kullansın.

### 2) Envanter import'ta UTS Kodu hücresini ayrıştırın

`uygulaEnvanterImport()`'ta (satır ~213-221), `row.utsKodu` bir GS1 element string'i gibi
görünüyorsa (`looksLikeGs1ElementString`/benzeri kontrol), ayrıştırıp:

- **Lot/Seri No (`stock.lot.name`)** = ayrıştırılmış **Seri (AI 21)** değeri (yoksa Lot (AI 10),
  o da yoksa mevcut fallback olan barkod).
- **`x_uts_kodu`** = TİTCK'in ürün numarası olarak kullandığı GTIN (AI 01) — ya da sistemin geri
  kalanında `x_uts_kodu`'nun neyi temsil ettiğini (ÜNO mü, tam ham kod mu) `uts.service.ts`/`UTS
  Yönetimi` akışlarıyla KARŞILAŞTIRIP tutarlı olanı seçin; hangisini seçtiğinizi raporda AÇIKÇA
  belirtin.
- Ayrıştırılamıyorsa (GS1 formatına uymuyorsa) MEVCUT davranışı (ham değeri oldğu gibi kullan)
  koruyun — düz/basit UTS kodu girişleri (GS1 olmayan) için geriye dönük uyumluluk bozulmasın.

### 3) Zaten hatalı aktarılmış ZAROSSI kayıtlarını araştırın

ZA10019 (barkod 22442529) gibi, Excel'de UTS kodu dolu olup Stok Kontrol'de "lot/UTS kaydı yok"
çıkan satırları Odoo'da inceleyin: bu ürün için gerçekten HİÇ `stock.lot`/`stock.quant` kaydı
oluşmamış mı, yoksa oluşmuş ama ham string yüzünden mi (örn. `isLotAvailableForReceipt` hatası,
sessiz `BASARISIZ` sonucu) düzgün görünmüyor? Kök nedeni raporda AÇIKLAYIN. Bu ZATEN aktarılmış
satırları otomatik düzeltmeyin (ayrı, manuel bir konu) — sadece TEŞHİS edip raporlayın, Görkem
isterse ayrı bir düzeltme talimatı verir.

## Test (ZORUNLU)

1. Gerçek bir GS1 formatlı "UTS Kodu" hücresi içeren yeni bir test satırını Envanter Girişi'nden
   aktarıp, oluşan `stock.lot`'un `name` alanının TEMİZ bir seri/lot numarası (40+ karakterlik ham
   string DEĞİL) olduğunu Odoo'dan gösterin.
2. Aynı testte `x_uts_kodu`'nun doğru/beklenen değeri taşıdığını ve bu değerle sistemin başka bir
   noktasından (örn. Stok Kontrol'ün yeni Lot/UTS paneli, ya da UTS arama akışı) bu kaydın
   BULUNABİLDİĞİNİ gösterin.
3. GS1 olmayan, düz bir UTS kodu (örn. sadece "12345") ile eski davranışın BOZULMADIĞINI doğrulayın.
4. ZA10019/ZA10020/ZA10026 için 3. maddedeki teşhisin sonucunu raporlayın.

## Rapor formatı

Değişen dosyalar/satırlar + `x_uts_kodu` için hangi AI'ı seçtiğinizin gerekçesi + test 1-4'ün
gerçek Odoo verisiyle sonucu + ZAROSSI teşhis bulguları.
