# ACİL — satışta e-Fatura, transferde e-İrsaliye hâlâ gitmiyor: gerçek hatayı bulup çözün

## Durum

Görkem canlı test etti: `GVNS-20260721-GVN2-00001` (Yaprak Gezer, 21.07.2026 14:10) satışında
e-Fatura durumu **BEKLIYOR**, hiç gönderilmemiş. Aynı işlem sırasında oluşan transferde de e-İrsaliye
yok. Daha önce hem kimlik bilgilerini (NG/ADESE şifreleri) hem `CarrierParty` UBL alanını düzelttik
ve testleri geçti diye rapor edildi — ama gerçek kullanıcı akışında hâlâ çalışmıyor. Artık tahminle
ilerlemiyoruz, gerçek hatayı DB'den/log'dan çekip ona göre düzeltin.

## Neden "BEKLIYOR" — kodda doğrulandı

`uyumsoft-efatura.service.ts`, `tetikleSatisEFatura()` (satır 852-894): `eFaturaGonder()` başarısız
olursa (`sonuc.basarili === false`), gerçek hata metni `sonuc.hata` içinde `faturaKuyruk` tablosuna
yazılıyor (`kuyrugaAl()`, satır 802-819, `hata` alanı), ve `sale.eFaturaDurum = 'BEKLIYOR'` set
ediliyor. Yani **"BEKLIYOR" = denendi ve başarısız oldu**, "henüz denenmedi" değil. Gerçek sebep
`faturaKuyruk` tablosunda duruyor ama hiçbir UI ekranı bunu göstermiyor — `Durumu Yenile` butonunun
çağırdığı `POST /efatura/satis-onay/:satisId` (`efatura.controller.ts` satır 87-104) sadece
`basarili`/`eFaturaDurum` döndürüyor, `hata` metnini hiç iade etmiyor.

## İstenen — ÖNCE teşhis, SONRA düzeltme

### 1. Önce şunu doğrulayın (en olası sebep)

Kimlik bilgisi güncellemesinden (NG/ADESE şifre fix'i) sonra backend GERÇEKTEN yeniden başlatıldı mı?
`uyumsoft.service.ts`'teki `clients` Map (satır 44) süreç belleğinde tutuluyor — süreç yeniden
başlamadan `clearUyumsoftClientCache()` çağrılmamışsa eski (yanlış) şifreyle açılmış SOAP client'ı
hâlâ kullanılıyor olabilir. Backend'in gerçek başlama zamanını (process uptime / log dosyası zaman
damgası) kontrol edip credential fix'ten SONRA olduğunu doğrulayın. Değilse, hemen yeniden başlatıp
BUNU İLK ÖNCE deneyin.

### 2. Gerçek hata metnini çıkarın ve raporda paylaşın

1. `GVNS-20260721-GVN2-00001` satışının `saleId`'sini bulun (müşteri Yaprak Gezer, tarih 21.07.2026
   ~14:10 ile eşleşen kayıt), ardından o `satisId`'ye ait EN SON `faturaKuyruk` kaydının `hata`
   alanını (tam metin) DB'den çekip **birebir raporda paylaşın** — kısaltmayın, özetlemeyin.
2. Aynı satışa bağlı transferin `transferRef`'ini bulun (muhtemelen bugünkü ANADEPO→GVN2 lot testiyle
   aynı, `NG/INT2/00014` / `IRS-1784639534663` — ama bu satışa gerçekten bağlı mı doğrulayın, farklı
   olabilir). O transferin GERÇEK outbox durumunu (`queryOutboxDespatchStatus` veya
   `listTransferAksiyonLogs`/`transfer-aksiyon-log` tablosundan) çekip **tam metnini** paylaşın —
   önceki "kabul edildi" raporu sadece SendDespatch'in ANLIK kabul cevabıydı, GİB'e nihai teslim
   onayı değildi; bu ihtimali kontrol edin, `Processing`'te takılı kalmış veya sonradan hataya
   düşmüş olabilir.

### 3. Bulduğunuz gerçek hataya göre düzeltin

Hatanın ne olduğunu önceden bilmiyoruz — 1. ve 2. adımların çıktısına göre asıl kök nedeni
düzeltin (kimlik bilgisi hâlâ mı yanlış, yeni bir UBL/alan sorunu mu, GİB tarafında farklı bir
red sebebi mi vb.). Lütfen bu talimatın devamı olarak AYRI bir talimat istemeyin — bulduğunuz hatayı
doğrudan düzeltip aynı raporda sonucu bildirin.

### 4. Kalıcı görünürlük ekleyin (bir daha kör debug yapmayalım)

1. `POST /efatura/satis-onay/:satisId` yanıtına `hata` alanını da ekleyin (kuyruktaki en son
   `hata` metni) — frontend `SaleDetailPage.tsx`'teki "Durumu Yenile" bölümünde bu metni
   `belgeError` benzeri bir alanda göstersin, kullanıcı "BEKLIYOR" yazısının ötesinde gerçek sebebi
   görsün.
2. `BekleyenTransferler.tsx`'teki e-İrs rozetine tıklanınca (veya hover'da) altındaki gerçek outbox
   mesajını gösteren bir tooltip/detay zaten varsa doğrulayın, yoksa ekleyin.

## Test

1. Aynı satış (`GVNS-20260721-GVN2-00001`) üzerinde "Durumu Yenile"ye basıp e-Fatura'nın gerçekten
   `GONDERILDI` olduğunu, PDF/UUID'nin oluştuğunu gösterin.
2. Aynı transferin outbox'ta gerçekten `Success` olduğunu gösterin.
3. Yeni bir satış + yeni bir transfer ile baştan sona (satış → temin/transfer → e-İrsaliye → fatura
   onayı → e-Fatura) uçtan uca sorunsuz çalıştığını kanıtlayın — bu son doğrulama olsun.

## Rapor formatı

Adım 1'in sonucu (restart zaman damgası karşılaştırması) + adım 2'nin tam hata metinleri (kısaltmadan)
+ yapılan düzeltme + adım 4'ün UI değişikliği + test sonuçları (ekran görüntüleriyle).
