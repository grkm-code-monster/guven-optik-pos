Konu: e-İrsaliye entegrasyonunda sürekli "1195 SİSTEM HATASI" — teknik detay ve gönderen alias sorusu (VKN: 23819441406 / 0071251547)

Merhaba,

Güven Optik 1959 bünyesindeki firmalarımız (Nejla Gümüşkesen Optik — VKN/TCKN 23819441406 ve
ADESE — VKN 0071251547) için geliştirdiğimiz entegrasyonda e-İrsaliye gönderimlerimiz sürekli
"1195 SİSTEM HATASI" ile reddediliyor. e-Fatura tarafındaki sorunları kendi tarafımızda çözdük
(o kısım artık sorunsuz çalışıyor); bu mesaj yalnızca e-İrsaliye ile ilgilidir.

Sizden hem entegrasyon kodumuzun teknik özetini paylaşmamızı hem de somut birkaç soruya yanıt
almamızı rica ediyoruz, çünkü kendi tarafımızda deneyebileceğimiz her şeyi tükettiğimizi
düşünüyoruz.

## Entegrasyonumuzun teknik özeti

- Node.js/TypeScript, SOAP istemcisi için `node-soap` kütüphanesi kullanıyoruz.
- Servis: `https://efatura.uyumsoft.com.tr/Services/DespatchIntegration?singleWsdl`
- Kimlik doğrulama: WS-Security (kullanıcı adı/şifre) — `SendDespatchAsync`,
  `QueryOutboxDespatchStatusAsync`, `GetUserAliassesAsync`, `GetSystemDateAsync` operasyonlarını
  kullanıyoruz.
- Firmamızda e-Fatura ve e-İrsaliye için portalınızda AYRI iki web servis hesabı tanımlı:
  - e-Fatura + e-Arşiv: `NejlaGumuskesen_WebServis`
  - e-İrsaliye: `NejlaGumuskesen_WebServis2`

## Şimdiye kadar denediğimiz düzeltmeler (hiçbiri 1195'i tek başına çözmedi)

1. UBL `Country` alanını `IdentificationCode` yerine `Name` ("Türkiye") olarak değiştirdik.
2. `CarrierParty` bloğuna eksik `PartyIdentification` (taşıyıcı kimlik) ekledik.
3. Alıcı posta kutusu alias'ını doğru kaynaktan (`DespatchReceiverboxAliases`) okuyacak şekilde
   düzelttik.
4. `DeliveryAddress` ve `PostalZone` (ilçe bazlı posta kodu) alanlarını ekledik.
5. Tüzel kişi taraflar için `cac:PartyLegalEntity` bloğunu ekledik.
6. `CarrierParty`'de TCKN'li taraf (kendi firmamız) için `cac:PartyName` yerine `cac:Person`
   (FirstName/FamilyName) kullanacak şekilde düzelttik — bu kuralı e-Fatura tarafında bulup
   düzelttiğimizde e-Fatura hemen onaylanmıştı, aynı mantığı e-İrsaliye'ye de uyguladık.

Sorun hem **aynı VKN'ye ait iki şube arasında** (NG'nin kendi şubeleri arası) hem **farklı VKN'ye
ait iki şube arasında** (NG'den ADESE'ye) ortaya çıkıyor — tek bir senaryoya özgü değil.

## Kendi tarafımızda yaptığımız ek teşhis — gönderen alias'ı

`SendDespatchAsync` isteğimizde gönderen tarafı için hiçbir alias/posta kutusu alanı
göndermiyoruz — WSDL'de `DespatchInfo` içinde yalnızca alıcı için (`TargetCustomer.Alias`)
opsiyonel bir alan var, gönderen için yok. Yani gönderen kimliğimiz tamamen kullandığımız web
servis kullanıcı adına (`NejlaGumuskesen_WebServis2`) bağlı olarak sizin sunucunuzda
çözümleniyor.

Bunu netleştirmek için `GetUserAliassesAsync` ile kendi hesaplarımızı sorguladık:

| Firma | Alan | Alias | Durum |
|-------|------|-------|-------|
| NG | `SenderboxAliases` (e-Fatura GB) | `urn:mail:defaultgb@guvenoptik.com` | Enabled |
| NG | `DespatchSenderboxAliases` (e-İrsaliye GB) | `urn:mail:eirsaliyegb@gumuskesen.com` | Enabled, özel adres |
| NG | `DespatchReceiverboxAliases` (e-İrsaliye PK) | `urn:mail:eirsaliyepk@gumuskesen.com` | Enabled |
| ADESE | `DespatchSenderboxAliases` | `urn:mail:eirsaliyegb@adese.com.tr` | Enabled |
| ADESE | `DespatchReceiverboxAliases` | `urn:mail:eirsaliyepk@adese.com.tr` | Enabled |

Yani e-İrsaliye için gönderen posta kutumuz VKN seviyesinde tanımlı ve etkin görünüyor — eksik ya
da varsayılan (default) bir kayıt değil. `UserInfoWithNoCheckAsync` sorgusunda da
`NejlaGumuskesen_WebServis2` hesabının `HasEDespatch: true` ve `EDespatch`/`EDespatchArchive`
servislerinin "Active" (01.07.2025 itibarıyla) olduğunu doğruladık.

## Sizden ihtiyacımız olan üç net cevap

1. `SendDespatchAsync` çağrısını `NejlaGumuskesen_WebServis2` kimliğiyle yaptığımızda, zarf
   oluşturulurken sunucu tarafında GERÇEKTEN hangi gönderen alias kullanılıyor —
   `urn:mail:eirsaliyegb@gumuskesen.com` mi, yoksa `urn:mail:defaultgb@guvenoptik.com`
   (e-Fatura'nın GB alias'ı) mı?
2. Aşağıdaki test ETTN'leri için GİB şematron/zarf loglarında TAM OLARAK hangi alan/kural
   reddediliyor? UBL içeriğimizi kendi tarafımızda elimizden geldiğince doğruladık; artık sunucu
   tarafındaki doğrulama sonucunu görebilecek bir yetkilinizin bakmasına ihtiyacımız var.
3. Aynı VKN'ye ait iki şube arasındaki sevkiyat (örn. bizim ANADEPO→GVN2 senaryomuz) GİB
   kurallarına göre e-İrsaliye kapsamında mı? (Prod ortamımızda bu senaryoyu bilinçli olarak
   atlıyoruz; test ETTN'i özellikle bunu doğrulamak için gönderildi.)

## Test ETTN'leri (22.07.2026)

- Aynı VKN (NG içi, ANADEPO→GVN2): `AA4C4487-2701-4270-864E-20536FB06170`
- Farklı VKN (NG→ADESE, ANADEPO→GVN1): `C2CD35DF-0109-4234-9DBB-ABC276FE05D4`

Gönderen VKN/TCKN: 23819441406 (NG)
Alıcı VKN (farklı VKN testinde): 0071251547 (ADESE)

Gerekirse entegrasyon kodumuzun ilgili kısımlarını (UBL üretimi, alias çözümleme, SOAP çağrıları)
ayrıca paylaşmaktan memnuniyet duyarız.

Yardımlarınız için şimdiden teşekkür ederiz.

İyi çalışmalar,
Görkem
Güven Optik 1959
grkmdsng@gmail.com
