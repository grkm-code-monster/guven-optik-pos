# UTS Yönetimi'ne "Bekleyen Alma Bildirimleri" sekmesi eklenmesi

## İstek

Görkem, TİTCK'in kendi UTS portalındaki "Ürün Kabul İşlemleri / Alma Bildir" ekranını referans
gösterdi (ekran görüntüsü: Gönderen / Belge Numarası / Ürün Numarası filtreleri + sonuç tablosu:
Ürün Numarası, Gönderen Kurum No, Bildirim Kodu, Lot/Batch, Seri/Sıra, Ürün Tanımı, Gönderen Kurum,
Adet, Belge Numarası, Bildirim Durumu, Bildirim Zamanı, Verme Tarihi — ve "Alma Bildir"/"Almak
İstemiyorum" aksiyon butonları). İstenen: kendi **UTS Yönetimi** sayfamıza, HER ŞUBENİN bekleyen
alma bildirimlerini listeleyen benzer bir ekran/sekme eklemek — bunun için ayrıca TİTCK portalına
girmeye gerek kalmasın.

## Mevcut durum (kodda doğrulandı)

- `backend/src/modules/uts/uts.service.ts`, `sorgulaBelgeNoIleAlmaBekleyenler()` (satır 431-461)
  zaten TİTCK'in `/UTS/uh/rest/bildirim/alma/bekleyenler/sorgula/offset` uç noktasını çağırıyor —
  ama fonksiyon **`belgeNo` PARAMETRESİNİ ZORUNLU** kılıyor (`if (!belgeNo) return [];`), yani
  sadece "bu belge numarasıyla ne bekliyor" diye tek tek sorgulanabiliyor, TİTCK ekranındaki gibi
  GENEL bir "şubenin TÜM bekleyenleri" listesi çekilemiyor.
- `admin.controller.ts`, `GET /uts/belge-sorgula` (satır 6535) de aynı şekilde `belgeNo`'yu
  zorunlu kılıyor (satır 6545-6547: `if (!belgeNo) return res.status(400)...`).
- Ekran görüntüsündeki TİTCK sayfasında Gönderen/Belge No/Ürün No filtrelerinin HEPSİ opsiyonel —
  boş bırakıp "Sorgula" ile TÜM bekleyenler listelenebiliyor. Yani TİTCK'in kendi API'si muhtemelen
  `BNO` olmadan da çalışıyor; bizim wrapper'ımız gereksiz yere bunu zorunlu kılmış.
- UTS Yönetimi sayfasında böyle bir liste/sekme şu an HİÇ YOK (mevcut sekmeler: Şube
  Tanımlamaları, Dış Firma Rehberi, Bildirim Oluştur, Bildirim Kuyruğu — bunların hiçbiri "bize
  gelen bekleyen alma bildirimleri"ni göstermiyor, `Bildirim Kuyruğu` sadece BİZİM gönderdiğimiz
  bildirimleri listeliyor).

## İstenen

### 1) Backend — `belgeNo`'yu opsiyonel yapın, ek filtreler ekleyin

`sorgulaBelgeNoIleAlmaBekleyenler()`'ı güncelleyin (isim de `sorgulaAlmaBekleyenler` gibi daha
genel bir isme alınabilir, tercihinize bırakıyorum):

- `belgeNo` artık OPSİYONEL — verilmemişse `BNO` alanını body'ye hiç eklemeyin.
- Ekran görüntüsündeki diğer filtreleri de destekleyin: `gonderenKurumNo` (zaten var, `GKK`),
  `urunNumarasi` (UNO) — TİTCK'in body'sinde bu alanın adı muhtemelen `UNO`, WSDL/REST
  dokümantasyonunu kontrol edin ya da mevcut `gondermeBildiriminiYap`'taki `UNO` kullanımıyla
  tutarlı olun.
- `GET /uts/belge-sorgula` endpoint'indeki `if (!belgeNo) return 400` zorunluluğunu kaldırın —
  `subeKodu` zorunlu kalsın (hangi şubenin token'ıyla sorgulanacağını bilmemiz lazım) ama
  `belgeNo`/`gkk`/`uno` hepsi opsiyonel filtre olsun. Endpoint adını isterseniz
  `/uts/alma-bekleyenler` gibi daha açıklayıcı bir isme taşıyabilirsiniz (eski endpoint'i geriye
  dönük uyumluluk için silmeyin, yeni bir tane ekleyin ya da mevcut olanı genişletin — tercihiniz).

### 2) Frontend — yeni sekme: "Bekleyen Alma Bildirimleri"

`packages/web/src/pages/admin/UtsYonetimiPage.tsx`'e yeni bir `Sekme` değeri ekleyin (mevcut
`'subeler' | 'firmalar' | 'bildirim' | 'kuyruk'` listesine `'bekleyen-alma'` gibi).

Bu sekmede:

- Üstte **Şube seçimi** (mevcut "Bildirim Oluştur" sekmesindeki "Kaynak Şube" dropdown deseniyle
  aynı) — hangi şubenin UTS token'ıyla sorgu yapılacağını seçin.
- Altında TİTCK ekranındaki gibi opsiyonel filtreler: Gönderen (kurum/firma — `Dış Firma
  Rehberi`ndeki listeden seçilebilir ya da serbest kurum no girilebilir), Belge Numarası, Ürün
  Numarası + "Sorgula"/"Temizle" butonları.
- Sonuç tablosu, TİTCK ekranındaki KOLONLARLA birebir aynı: Ürün Numarası, Gönderen Kurum No,
  Bildirim Kodu, Lot/Batch Numarası, Seri/Sıra Numarası, Ürün Tanımı, Gönderen Kurum, Adet, Belge
  Numarası, Bildirim Durumu, Bildirim Zamanı, Verme Tarihi (`UtsBekleyenAlmaSatir` tipi zaten
  `uno/lno/sno/bno/bid/gkk/adt` alanlarını taşıyor — `bildirimKodu`/`urunTanimi`/`gonderenKurum`/
  `bildirimDurumu`/`bildirimZamani`/`vermeTarihi` gibi eksik alanlar varsa TİTCK'in gerçek yanıt
  gövdesinden hangi anahtarlarda geldiğini kontrol edip `UtsBekleyenAlmaSatir` tipine ekleyin).
- Her satırda İKİ aksiyon butonu:
  - **"Alma Bildir"** — bu satırı kabul eder. Mevcut `bildirimOlusturVeGonder({tip:'ALMA', ...})`
    akışını, satırdaki `uno`/`lno`/`sno`/`adt`/`gkk` (gönderen kurum no → karşı taraf) değerleriyle
    ÖN DOLU şekilde tetikleyin — kullanıcı tek tıkla kabul edebilsin.
  - **"Almak İstemiyorum"** — TİTCK'in bu işlem için ayrı bir REST uç noktası olup olmadığını
    araştırın (muhtemelen `/UTS/uh/rest/bildirim/...istemiyorum` benzeri bir path olabilir, WSDL/
    API dokümantasyonuna bakın). Varsa aynı desende (`gondermeBildiriminiYap` benzeri) bir
    fonksiyon ekleyin. Yoksa bu butonu şimdilik "yakında" ya da devre dışı bırakıp raporda
    belirtin — kör bir varsayımla yanlış endpoint'e istek atmayın.
- Sayfa/şube grubu çok kalabalıksa "alt sekmeler" (Görkem'in önerisi) yerine tek bir şube
  dropdown'u + sonuç tablosu daha sürdürülebilir olur (yeni şube eklendikçe yeni sekme açmak
  gerekmez) — ama Görkem'in görsel tercihini önemsiyorsanız, depo grubu (ANADEPO+GVN2) ve
  mağazalar için iki alt-sekme + içeride şube dropdown'u şeklinde bir ORTA YOL da uygulanabilir.
  Hangisini seçtiğinizi raporda belirtin.

## Test

1. Bir şube seçip HİÇBİR filtre girmeden "Sorgula" ile o şubenin TÜM bekleyen alma bildirimlerini
   (varsa) listeleyin — TİTCK'in kendi ekranındaki sonuçla (ekran görüntüsündeki "Uygun Kayıt
   Bulunamadı" durumuyla ya da varsa gerçek kayıtlarla) KARŞILAŞTIRIN, birebir eşleştiğini
   doğrulayın.
2. Belge no filtresiyle daraltılmış bir sorguyu da test edip eski davranışın (mevcut
   `belge-sorgula` kullanan başka bir ekran/akış varsa) BOZULMADIĞINI doğrulayın.
3. "Alma Bildir" butonuyla gerçek bir bekleyen kaydı kabul edip UTS'te durumun güncellendiğini
   gösterin.

## Rapor formatı

Değişen dosyalar/satırlar + yeni ekranın ekran görüntüsü (TİTCK'in kendi ekranıyla yan yana
karşılaştırma iyi olur) + "Almak İstemiyorum" için TİTCK'te karşılık bulunup bulunmadığı + gerçek
bir "Alma Bildir" testinin sonucu.
