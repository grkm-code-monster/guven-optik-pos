# e-İrsaliye — CarrierParty (taşıyıcı firma) bilgisi eksik, Uyumsoft'un yeni tespiti

## Durum

Uyumsoft desteğinden ETTN `FB06A904-8E4B-4942-995A-6EC2BD72DFB2` için yeni bir cevap geldi (Country
alanı düzeltmesinden SONRA gönderilen, ayrı bir irsaliye):

> "Taşıyıcı firma bilgilerinin eksik olduğu tespit edilmiştir. Taşıyıcı firma bilgileri eksik
> olduğunda, GİB tarafından e-İrsaliye belgeleri hata durumuna düşebilmektedir."

Yani 1195 hatasının bir kısmı/devamı, Country alanından AYRI, gerçek bir eksiklik: `CarrierParty`
bloğunda sadece isim var, kimlik (VKN) yok.

## Kök neden (kodda doğrulandı)

`backend/src/modules/efatura/uyumsoft-irsaliye.service.ts`, `buildDespatchAdviceUbl()`, satır
399-411:

```xml
<cac:Shipment>
  <cbc:ID>1</cbc:ID>
  <cac:Delivery>
    <cac:Despatch>
      <cbc:ActualDespatchDate>${input.sevkTarihi}</cbc:ActualDespatchDate>
    </cac:Despatch>
    <cac:CarrierParty>
      <cac:PartyName>
        <cbc:Name>KENDİ ARACIMIZ</cbc:Name>
      </cac:PartyName>
    </cac:CarrierParty>
  </cac:Delivery>
</cac:Shipment>
```

`CarrierParty` sadece sabit metin `"KENDİ ARACIMIZ"` içeriyor — hiçbir `PartyIdentification`/VKN
yok. Transferler kendi araçlarımızla (şubeler arası) yapıldığı için taşıyıcı firma, gönderen şirketin
kendisi olmalı — yani `input.gonderen`'in VKN'si `CarrierParty`'ye kimlik olarak eklenmeli.

`DespatchPartyInfo` tipi (satır 59-69) zaten `vkn`, `idScheme`, `unvan` alanlarını içeriyor —
`input.gonderen` üzerinden bu bilgi hazır durumda, yeni veri toplamaya gerek yok.

## İstenen

1. `buildDespatchAdviceUbl()` içinde `CarrierParty` bloğunu, `buildPartyXml()`'deki
   `PartyIdentification` desenine benzer şekilde genişletin:
   ```xml
   <cac:CarrierParty>
     <cac:PartyIdentification>
       <cbc:ID schemeID="${gonderenScheme}">${gonderenVkn}</cbc:ID>
     </cac:PartyIdentification>
     <cac:PartyName>
       <cbc:Name>${escapeXML(toTrUpper(input.gonderen.unvan))}</cbc:Name>
     </cac:PartyName>
   </cac:CarrierParty>
   ```
   `gonderenScheme`/`gonderenVkn`, `input.gonderen.idScheme`/`input.gonderen.vkn`'den (VKN
   rakamları temizlenmiş hâliyle, `buildPartyXml()`'de yapılan `party.vkn.replace(/\D/g, '')` ile
   aynı temizleme) türetilsin. "KENDİ ARACIMIZ" sabit metnini kaldırın, gerçek unvan kullanın.
2. Bu değişikliğin SADECE `uyumsoft-irsaliye.service.ts`'i etkilediğini doğrulayın — e-Fatura akışında
   (`uyumsoft-efatura.service.ts`) `CarrierParty` kavramı yoksa (fatura UBL'inde sevkiyat/taşıyıcı
   bilgisi genelde bulunmaz) orayı değiştirmeyin, sadece kontrol edip yoksa dokunmayın.
3. GİB e-İrsaliye şemasında `CarrierParty` için `PartyIdentification` dışında zorunlu başka bir alan
   olup olmadığını (ör. `PartyTaxScheme`) Uyumsoft'un örnek/dokümantasyonundan kontrol edebilirseniz
   edin; emin değilseniz sadece `PartyIdentification` + `PartyName` ile başlayın (Uyumsoft'un mesajı
   sadece "taşıyıcı firma bilgisi eksik" diyor, ekstra alan istemiyor).

## Test

1. Değişiklik sonrası backend'i yeniden başlatıp yeni bir transfer üzerinden e-İrsaliye gönderin,
   oluşan UBL içeriğinde `CarrierParty` altında artık `PartyIdentification`/VKN bulunduğunu
   doğrulayın (loglanan/kaydedilen XML'den).
2. Outbox durumunu kontrol edip (`pollOutboxDespatchStatus` / mevcut durum sorgulama akışı) yeni
   ETTN'nin `Success`/onaylı olduğunu, 1195 veya benzer bir hata almadığını gösterin.
3. Daha önce reddedilen `FB06A904-8E4B-4942-995A-6EC2BD72DFB2` belgesini, Uyumsoft'un önerdiği
   `MoveToDraftStatus` → `SaveAsDraft` → `SendDraft` akışıyla kurtarmayı deneyin (opsiyonel, mümkünse).

## Rapor formatı

Değişen dosya/satırlar + yeni gönderilen UBL'nin `CarrierParty` bloğu (önce/sonra) + yeni test
sonucu (ETTN, outbox durumu).
