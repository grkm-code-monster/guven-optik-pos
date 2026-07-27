# Yeni transfer denemesi — fatura hiç kesilmedi, Uyumsoft'a gitmedi (teşhis talebi)

## Durum

Görkem az önce gerçek bir test yaptı: **NG (ANADEPO) → ADESE (GVN3)**, 1 adet **ULTRA lens**,
maliyet Stok Yönetimi'nden **750 TL**, KDV **%10** olarak tanımlandı (önceki iki talimatta istenen
düzeltmeler sonrası). Ama bu transferde **hiçbir fatura kesilmedi, Uyumsoft'a hiç gönderim
denemesi bile gitmedi**. Önceki test (Cursor'un kendi raporundaki `test-transfer-efatura-faz5`
senaryosu) başarılıydı, ama gerçek kullanıcı akışında (UI üzerinden) aynı sonuç alınamadı — bu
farkın nedenini bulmamız lazım.

Ben kodu okuyarak birkaç olası neden tespit ettim ama **canlı veritabanı/log erişimim yok** — bu
yüzden gerçek teşhisi sizin (Cursor'un backend/DB erişimi olan tarafın) yapması lazım. Aşağıdaki
sırayla kontrol edin.

## 1) Bu transferin log kaydı var mı? (`/admin/transfer-aksiyon-log`)

`backend/src/modules/admin/admin.controller.ts` satır 3360, `GET /transfer-aksiyon-log` zaten var:

```ts
router.get('/transfer-aksiyon-log', async (req, res) => {
  const logs = await listTransferAksiyonLogs({ transferRef, transferRefs, limit });
  ...
});
```

Görkem'in az önceki NG→ADESE(GVN3) ULTRA lens transferinin `transferRef`'ini bulup (en son
oluşturulan `TRANSFER-...` kaydı, ya da ilgili `stock.picking`/Odoo transfer kaydından) bu uçla
sorgulayın. Özellikle **`aksiyon: 'EFATURA'`** satırının olup olmadığına bakın:

- **Hiç EFATURA satırı YOKSA:** `runEFatura()` (`transfer-post-actions.service.ts`) hiç
  ÇAĞRILMAMIŞ demektir — yani sorun e-Fatura'da değil, ONDAN ÖNCEKİ bir adımda. Madde 2'ye geçin.
- **EFATURA satırı VARSA ama `durum: 'basarisiz'` ya da `'atlandi'`:** o satırın `mesaj` alanını
  okuyup bize AYNEN raporlayın — muhtemelen `assertPositiveTransferMaliyet()`'in fırlattığı hata
  (`'ULTRA KONTAKT LENS -0100' için kaynak şirkette maliyet bilgisi bulunamadı...`) ya da başka bir
  istisna olabilir.

## 2) `baslatSirketlerArasiTransfer()` post-action'ı hiç tetiklemedi mi?

`backend/src/modules/transfer/transfer-core.service.ts`, `baslatTransfer()` (satır 400-490):

```ts
if (arasi.durum === 'bekliyor' && arasi.kabulPickingId) {
  await postActionsBaslat(...);   // <-- e-Fatura/e-İrsaliye/UTS burada tetikleniyor
  ...
}
```

`postActionsBaslat` (ve dolayısıyla e-Fatura denemesi) **SADECE** `arasi.durum === 'bekliyor'` VE
`arasi.kabulPickingId` doluysa çalışıyor. Eğer bu transfer `sonuc.durum` başka bir değerde
kaldıysa (`'basarisiz'`, `'kismi'`), e-Fatura denemesi hiç yapılmamış olabilir — ama bu durumda
transferin KENDİSİ de kullanıcıya "başarısız/kısmi" olarak görünmüş olmalıydı. Görkem'e sorun:
transfer ekranında "Transfer gönderildi" / "başarılı" mesajı gördü mü, yoksa transfer de mi hata
verdi? Eğer transfer ekranda BAŞARILI görünüyorsa ama log'da hiç EFATURA adımı yoksa, bu ayrı bir
(yeni) hata demektir — `arasi.durum`'un neden `'bekliyor'` çıkmadığını (ya da
`arasi.kabulPickingId`'in neden boş kaldığını) `baslatSirketlerArasiTransfer()`
(`sirketler-arasi-transfer.service.ts`) içinde bu spesifik transferRef için loglayıp bulun.

## 3) ULTRA lensin maliyeti GERÇEKTEN NG (kaynak) bağlamında yazılı mı?

Önceki talimatta `writeStandardPriceAllCompanies()` tüm şirketlere (`ODOO_ALL_COMPANY_IDS = [1,2,3,4]`)
yazıyor. Ama bu, Stok Yönetimi'nden kaydedilen değerin GERÇEKTEN NG'nin Odoo şirket id'sine (2)
başarıyla yazıldığını garanti etmez (yazma sırasında sessiz bir hata/exception yutulmuş olabilir —
`resolveTransferKalemMaliyet`'teki `try/catch` gibi `writeStandardPriceAllCompanies`'de de
per-company try/catch varsa bir şirkete yazım sessizce başarısız olup diğerlerine geçmiş olabilir,
kontrol edin). Doğrudan Odoo'dan sorgulayıp doğrulayın:

```
product.product (id: 5571, "ULTRA KONTAKT LENS -0100") standard_price:
  company_id=2 (NG)    → ?
  company_id=3 (ADESE) → ?
```

İkisi de 750 dönüyorsa bu madde temiz demektir, guard'ın burada devreye girmiş olma ihtimali
düşer — o zaman madde 1-2'deki log/akış sorununa odaklanın.

## 4) "GVN3" location/company eşlemesi doğru mu?

Önceki testlerde ADESE'nin lokasyon kodu "GVN1" olarak geçiyordu, bu seferki test "GVN3". İkisi de
ADESE'ye (company_id=3) mi bağlı, yoksa "GVN3" farklı bir şirkete/lokasyona mı işaret ediyor
kontrol edin — `resolveLokasyonlar()` (`transfer-core.service.ts` satır 71-85) bu location
id'sinden `company_id`'yi Odoo'dan okuyor; eğer "GVN3" gerçekte `kaynakSirketId === hedefSirketId`
çıkmasına neden olan bir eşleşmeyse (örn. yanlışlıkla NG'nin bir şubesi gibi çözümlenirse),
sistem bunu **şirket-içi (`sirket-ici`)** transfer sanıp `baslatSirketlerArasiTransfer()`'ı hiç
ÇAĞIRMAZ — bu da "fatura hiç kesilmedi" ile TAM UYUMLU bir açıklama olurdu (çünkü şirket-içi
transferlerde zaten e-Fatura konsepti yok). Bunu doğrulayın: bu transfer gerçekten
`tip: 'sirketler-arasi'` olarak mı işlendi, yoksa yanlışlıkla `'sirket-ici'` mi algılandı?

## İstenen

Yukarıdaki 4 maddeyi sırayla kontrol edip HANGİSİNİN gerçek neden olduğunu bulun. Muhtemelen ya:
(a) madde 4 — GVN3 yanlış şirkete eşleniyor ve transfer yanlışlıkla şirket-içi sanılıyor, ya da
(b) madde 1'deki log'da somut bir hata mesajı var (maliyet hâlâ 0 bulunuyor çünkü madde 3'teki yazım
sessizce başarısız olmuş), ya da (c) madde 2 — post-action tetiklenme koşulu bu transferde
sağlanmamış.

Kesin nedeni bulduktan sonra düzeltin ve AYNI transferi (NG ANADepo → ADESE GVN3, ULTRA lens,
750 TL, %10 KDV) tekrar deneyip bu sefer e-Faturanın Uyumsoft'a gittiğini (ETTN + durum) gösterin.

## Rapor formatı

Hangi maddenin gerçek neden olduğu + o maddeye ait log/DB kanıtı (transfer-aksiyon-log çıktısı ya
da Odoo sorgu sonucu) + yapılan düzeltme + tekrar test sonucu (ETTN/durum).
