# 1195 hatasını Uyumsoft'a sormadan önce son bir deneme — `PartyLegalEntity` eksik

## Durum

Görkem, Uyumsoft'a üçüncü kez aynı sorunu (1195 SİSTEM HATASI) sormak istemiyor haklı olarak — önce
kendi tarafımızda gerçekten deneyebileceğimiz bir şey kaldı mı diye bakalım istiyor. Kodu inceledim,
somut ve makul bir eksik buldum, Uyumsoft'a gitmeden önce bunu deneyelim.

## Bulgu

`uyumsoft-irsaliye.service.ts`, `buildPartyXml()` fonksiyonu `cac:Party` içine şunları koyuyor:
`PartyIdentification` (VKN/TCKN), `PartyName` (veya TCKN ise `Person`), `PostalAddress`,
`PartyTaxScheme`, `Contact`. **`cac:PartyLegalEntity` bloğu hiç yok** (`RegistrationName`,
`CompanyID`) — grep ile doğruladım, dosyada bu blok hiçbir yerde geçmiyor. Aynı eksik
`uyumsoft-efatura.service.ts`'de de var (o da yok), yani e-Fatura tarafında da muhtemelen aynı
eksiklik mevcut ama e-Fatura'yı e-Arşiv yetki sorunu yüzünden henüz test edemedik.

UBL-TR (Türkiye e-belge) uygulamalarında `cac:PartyLegalEntity > cbc:RegistrationName` (tüzel kişi
unvanı) ve genelde `cbc:CompanyID` (VKN, `schemeID` ile), tüzel kişi taraflar için GİB şematronunun
sıkça aradığı, `PartyName`'den AYRI bir zorunlu blok olabiliyor — `PartyName` daha çok görüntüleme
amaçlı, `PartyLegalEntity` ise resmi tüzel kimlik kaydı için kullanılıyor. Bu ikisinin karıştırılıp
sadece `PartyName`'in yazılması, genel/anlaşılması zor "1195 SİSTEM HATASI" gibi bir şematron
reddine yol açabilecek tipik bir hata.

## İstenen

1. `buildPartyXml()`'e (satır ~318-340 civarı), `PartyName`/`Person` bloğundan sonra, tüzel kişi
   (TCKN değil, VKN'li) taraflar için `cac:PartyLegalEntity` ekleyin:
   ```xml
   <cac:PartyLegalEntity>
     <cbc:RegistrationName>${escapeXML(toTrUpper(party.unvan))}</cbc:RegistrationName>
     <cbc:CompanyID schemeID="${scheme}">${escapeXML(party.vkn.replace(/\D/g, ''))}</cbc:CompanyID>
   </cac:PartyLegalEntity>
   ```
   TCKN'li (bireysel, `idScheme === 'TCKN'`) taraflarda bu blok muhtemelen gerekmez (zaten `Person`
   kullanılıyor) — sadece VKN'li taraflarda ekleyin, mevcut `isTckn` kontrolünü kullanın.
2. Bu bloğun UBL içinde DOĞRU SIRADA olması önemli olabilir — UBL-TR şemasında genel sıralama
   `PartyIdentification` → `PartyName` → `PostalAddress` → `PartyTaxScheme` → `PartyLegalEntity` →
   `Contact` şeklindedir (kesin sırayı Uyumsoft'un örnek/WSDL dokümantasyonundan teyit edebiliyorsanız
   edin, emin değilseniz `PartyTaxScheme`'den hemen sonra, `Contact`'tan önce koyun).
3. Bu değişikliği SADECE e-İrsaliye'de değil, aynı eksikliğin olduğu `uyumsoft-efatura.service.ts`'teki
   iki `Country` bloğunun bulunduğu parti oluşturma noktalarında da (aynı mantıkla) uygulayın —
   e-Arşiv yetkisi açıldığında orada da aynı soruna çarpmayalım.

## Test

1. Hem aynı-VKN hem farklı-VKN bir e-İrsaliye gönderimini tekrar deneyin, outbox durumunun artık
   1195 DEĞİL, `Success`/onaylı olduğunu gösterin.
2. Hâlâ 1195 alınıyorsa (bu ihtimal de var, kesin garanti değil), gönderilen UBL'in tam içeriğini
   raporda paylaşın — bu durumda gerçekten Uyumsoft'a sormamız gerekecek, ama en azından elimizde
   "şunu da denedik, olmadı" diyebileceğimiz somut bir kanıt olur.

## Rapor formatı

Değişen satırlar + yeni UBL'nin `PartyLegalEntity` bloğu (örnek) + outbox test sonucu (Success mı
hâlâ 1195 mi, ikisi de olasılıkla belirtilmişti, dürüstçe raporlayın).
