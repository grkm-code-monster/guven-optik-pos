# e-İrsaliye alias düzeltmesinden SONRA da hâlâ oluşmuyor — güncel log gerekli

## Durum

`TRANSFER_SONRASI_IRSALIYE_FATURA_OLUSMUYOR_TALIMATI.md` kapsamında `sanitizeDespatchReceiverAlias()`
+ alias'sız retry eklendi (`uyumsoft-irsaliye.service.ts`), backend yeniden başlatıldı. Görkem bu
düzeltmeden SONRA ANA DEPO → GVN2 transferini **tekrar** denedi: e-İrsaliye yine Uyumsoft'ta
oluşmadı. Elimizde bu yeni denemenin gerçek hata mesajı yok — eski `TRANSFER-1784553147602` kaydı
(defaultpk alias hatası) düzeltmeden ÖNCEKİydi, bu YENİ denemeyi göstermiyor.

## İstenen

1. `TransferAksiyonLog` tablosundan **bugünün en son** `EIRSALIYE` kaydını (en yeni `createdAt`,
   `aksiyon='EIRSALIYE'`, kaynak ANA DEPO/hedef GVN2 olan) çekin — yeni `transferRef` neyse onun
   tam `mesaj` alanını raporlayın. (`backend/src/modules/transfer/transfer-aksiyon-log.service.ts`
   içindeki `listTransferAksiyonLogs()`'u kullanabilirsiniz, `GET /api/transfer/aksiyon-log`
   üzerinden de sorgulanabilir.)
2. Eğer mesaj hâlâ "alias sistem kullanıcıları listesinde bulunmuyor" ise: `sendDespatch()`'teki
   retry mantığını (`uyumsoft-irsaliye.service.ts`, satır ~467-471) tekrar gözden geçirin —
   `isAliasRelatedDespatchError()` bu YENİ hata metnini gerçekten yakalıyor mu (regex/`includes`
   kontrolünü tam hata metniyle karşılaştırın, kelime farkı olabilir)? Yakalıyorsa retry neden
   yine başarısız oluyor — ikinci deneme (alias'sız) de mi aynı şekilde reddediliyor, yoksa retry
   hiç tetiklenmiyor mu? Backend konsol loglarında `[Uyumsoft] SendDespatch alias hatası —
   alias olmadan yeniden denenecek` satırı çıktı mı, kontrol edin.
3. Eğer mesaj FARKLI bir hataysa (alias değil, başka bir Uyumsoft reddi): ne olduğunu tam olarak
   raporlayın, kökten teşhis edin.
4. Backend'in gerçekten yeniden başlatılmış (kod değişikliğinin fiilen yüklü) olduğundan emin olun
   — `sanitizeDespatchReceiverAlias` fonksiyonunun binary/derlenmiş halinin güncel olduğunu
   doğrulayın (ör. bir log satırı ekleyip commit hash/timestamp basabilirsiniz, şüpheye yer
   bırakmayın).

## Test

Yeni bir ANA DEPO → GVN2 transferi başlatıp e-İrsaliye'nin Uyumsoft'ta gerçekten oluştuğunu (ETTN/
irsaliye no ile) gösterin — sadece "log'da basarili yazıyor" değil, Uyumsoft portalının kendisinde
görünür olduğunu teyit edin.

## Rapor formatı

Yeni transferin tam log mesajı (önce) + kök neden + varsa ek düzeltme + Uyumsoft portalında
oluşan irsaliyenin kanıtı (ekran görüntüsü/irsaliye no).
