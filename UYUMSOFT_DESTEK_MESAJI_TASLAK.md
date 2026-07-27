Merhaba,

e-İrsaliye tarafında devam eden bir sorun için desteğinize ihtiyacımız var (e-Fatura/e-Arşiv
tarafında yaşadığımız sorunları kendi tarafımızda çözdük, bu mesaj sadece e-İrsaliye ile ilgili).

## Şirketler arası ve şube-içi e-İrsaliye'de 1195 SİSTEM HATASI devam ediyor

Bu konuda kendi tarafımızda sırasıyla şunları denedik, hepsini uyguladık ve UBL çıktısından
doğruladık:
- UBL `Country` alanını `IdentificationCode` yerine `Name` (`Türkiye`) olarak değiştirdik (sizin
  önceki geri bildiriminiz üzerine).
- `CarrierParty` bloğuna eksik olan taşıyıcı firma kimlik bilgisini (`PartyIdentification`) ekledik
  (yine sizin geri bildiriminiz üzerine).
- Alıcı posta kutusu takma adını (alias) doğru kaynaktan (`DespatchReceiverboxAliases`) okuyacak
  şekilde düzelttik.
- `DeliveryAddress` ve `PostalZone` (ilçe bazlı posta kodu) alanlarını ekledik.
- `cac:PartyLegalEntity` (`RegistrationName` + `CompanyID`) bloğunu, tüzel kişi taraflar için
  `PartyTaxScheme` ile `Contact` arasına ekledik.
- `CarrierParty`'de, taşıyıcı TCKN'li (şahıs) olduğunda `cac:PartyName` yerine `cac:Person`
  (FirstName/FamilyName) kullanacak şekilde düzelttik — bu son madde, e-Fatura tarafında AYNI kuralın
  (schemeID='TCKN' için cac:Person zorunlu) eksik olduğunu tespit edip düzelttiğimizde e-Fatura'nın
  hemen onaylanmasını sağlamıştı, e-İrsaliye'de de aynı mantığı uyguladık.

Bunların HİÇBİRİ tek başına ya da birlikte 1195'i çözmedi — her denemeden sonra yeni bir ETTN ile
test ettik, hepsinde aynı hata devam etti.

Sorun hem **aynı VKN'ye ait iki şube arasında** (tek şirketin kendi şubeleri arası) hem **farklı
VKN'ye ait iki şube arasında** (şirketler arası, örn. bizim NG'den ADESE'ye) ortaya çıkıyor — yani
tek bir senaryoya özgü değil.

**Son test ETTN'leri (22.07.2026):**
- Aynı VKN (ANADEPO→GVN2, NG içi): `AA4C4487-2701-4270-864E-20536FB06170`
- Farklı VKN (ANADEPO→GVN1, NG→ADESE): `C2CD35DF-0109-4234-9DBB-ABC276FE05D4`

**Gönderen VKN/TCKN:** 23819441406 (NG)
**Alıcı VKN (farklı VKN testinde):** 0071251547 (ADESE)

Bu belgeleri UBL şeması/GİB şematron seviyesinde inceleyip, hangi alanın hâlâ eksik/hatalı olduğunu
bize bildirebilir misiniz? Kendi tarafımızda makul gördüğümüz her şeyi denedik; artık sunucu
tarafındaki şematron kontrol sonucunu görebilecek bir yetkilinizin bakması gerekiyor.

Yardımlarınız için şimdiden teşekkür ederiz.
