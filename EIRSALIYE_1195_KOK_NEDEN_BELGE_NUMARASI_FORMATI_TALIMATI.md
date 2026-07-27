# 1195 SİSTEM HATASI'nın gerçek kaynağı bulundu — irsaliye numarası formatı yanlış

## Durum — Uyumsoft'tan gelen resmi yanıt

Destek talebimize (`UYUMSOFT_EIRSALIYE_DESTEK_MAILI.md`) Uyumsoft'tan yanıt geldi. Test
ETTN'lerimiz (`AA4C4487-2701-4270-864E-20536FB06170`, `C2CD35DF-0109-4234-9DBB-ABC276FE05D4`)
incelenmiş ve NET bir teşhis verilmiş:

> İletmiş olduğunuz irsaliyeler kontrol edildiğinde, ETTN'lerinizin, **irsaliye numarası
> formatından** kaynaklı olarak hata verdiği tespit edilmiştir. Belge numarası şu formatta
> olmalı: `AAA2024000000001` — ilk 3 hane ön ek (seri), sonraki 4 hane belge yılı, son 9 hane
> sıralı numara — toplam **16 karakter**.

Şubeler arası irsaliye düzenlemesinin GİB mevzuatına uygun olduğunu da AYRICA teyit etmişler —
yani aynı-VKN şube-içi senaryo da dahil, konsept olarak sorun yok, SADECE numara formatı hatalıydı.

Bu, 6 içerik/şema denememizin HİÇBİRİNİN bulamadığı, tamamen farklı bir kök neden.

## Kök neden (kodda doğrulandı)

`backend/src/modules/transfer/transfer-post-actions.service.ts`, `runEIrsaliye()` satır 244:

```ts
const irsaliyeNo = `IRS-${input.transferRef.replace(/^TRANSFER-/, '')}`;
```

`input.transferRef` formatı `TRANSFER-${Date.now()}` (epoch milisaniye) — yani ortaya çıkan
`irsaliyeNo` örneğin `IRS-1753123456789` gibi bir şey oluyor: ne 3 haneli bir ön ek, ne 4 haneli
yıl, ne 9 haneli sıra numarası — Uyumsoft'un istediği formatın HİÇBİR kuralına uymuyor.

**Karşılaştırma — e-Fatura DOĞRU yapıyor:** Aynı projede `uyumsoft-efatura.service.ts`,
`faturaNoUret()` (satır 697-702) TAM OLARAK istenen formatı üretiyor ve bu sayede e-Fatura'larımız
GİB tarafından onaylanıyor:

```ts
export function faturaNoUret(sube: string, siraNo: number): string {
  const yil = new Date().getFullYear();
  const sira = siraNo.toString().padStart(9, '0');
  const subeKodu = sube.replace('GVN', 'GN').padEnd(3, '0').substring(0, 3);
  return `${subeKodu}${yil}${sira}`;
}
```

`GVN2` → `GN2` (3 hane) + `2026` (4 hane) + `000000010` (9 hane) = 16 karakter — bu tam olarak
Uyumsoft'un istediği format. e-İrsaliye numaralaması bu deseni HİÇ kullanmıyor, kendi ad-hoc
`IRS-...` şemasını kullanıyor.

## İstenen

1. e-Fatura ile AYNI mantıkla bir `irsaliyeNoUret(subeKodu, siraNo)` fonksiyonu ekleyin (aynen
   `faturaNoUret()`'i kopyalayabilir ya da paylaşılan bir yardımcıya çıkarabilirsiniz —
   `subeKodu.replace('GVN','GN')` dönüşümü aynı kalsın çünkü GİB seri kodu 3 karaktere sığmalı).
2. Sıra numarası (`siraNo`) için, `faturaNoUret`'in `prisma.fatura.count({where:{sube}})` yaptığı
   gibi, e-İrsaliye'ye özel bir sayaç lazım. `Fatura` tablosunu KARIŞTIRMAYIN (ayrı belge serisi).
   Basit ve güvenli çözüm: Prisma şemasına küçük bir `Irsaliye` tablosu ekleyin (id, irsaliyeNo,
   sube, transferRef, ettn, createdAt) — her başarılı gönderimden sonra bir kayıt oluşturun, sıra
   numarasını `prisma.irsaliye.count({where:{sube}}) + 1` ile hesaplayın. (Alternatif: mevcut
   `TransferAksiyonLog` tablosunda `aksiyon='EIRSALIYE' AND durum='basarili'` sayısını saymak da
   işe yarayabilir ama yeni, amaca özel bir tablo daha güvenilir — race condition'a karşı da aynı
   atomik `updateMany` deseni gerekirse e-Fatura'daki `tetikleSatisEFatura()`'daki gibi
   düşünülebilir, ama bu senaryoda transfer başına tek gönderim olduğu için muhtemelen gerekli
   değil.)
3. `runEIrsaliye()`'deki `const irsaliyeNo = \`IRS-${...}\`;` satırını bu yeni fonksiyonla
   değiştirin.
4. `sendDespatch()`'e geçen `irsaliyeNo`'nun artık 16 karakter, doğru formatta olduğunu XML
   çıktısından (`<cbc:ID>`) doğrulayın.

## Test

1. Aynı-VKN senaryosunu (NG içi, ANADEPO→GVN2) YENİ formatlı numarayla tekrar deneyin — artık
   1195 ALMADIĞINIZI, outbox'ta başarılı/onaylı göründüğünü gösterin.
2. Farklı-VKN senaryosunu (NG→ADESE) aynı şekilde tekrar deneyin.
3. İki test için de üretilen `irsaliyeNo`'nun tam olarak 16 karakter ve doğru formatta
   (`GN22026000000001` gibi) olduğunu raporda gösterin.
4. e-Fatura'nın `faturaNoUret()`'ini bu değişiklikten ETKİLEMEDİĞİNİZİ (ayrı fonksiyon/sayaç
   olduğunu) doğrulayın — regresyon kontrolü.

## Rapor formatı

Değişen dosyalar/satırlar + yeni Prisma migration (varsa) + iki test senaryosunun ETTN + outbox
durumu (Onaylandı/Success) + üretilen irsaliyeNo örnekleri.
