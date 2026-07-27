# e-İrsaliye 1195'in muhtemel gerçek kaynağı — CarrierParty'de TCKN'de Person eksik

## Durum

Az önce e-Fatura'da AYNI kalıpta bir hata bulup düzelttik: GİB şematronu, `PartyIdentification`'da
`schemeID="TCKN"` yazan her tarafta `cac:PartyName` DEĞİL `cac:Person` bekliyor. e-Fatura'daki
satıcı bloğunda bu eksikti, düzelttik, fatura onaylandı. **Aynı eksiklik e-İrsaliye'nin
`CarrierParty` bloğunda da var** — bu, hem aynı-VKN hem farklı-VKN transferlerde hâlâ aldığımız
1195 hatasının gerçek kaynağı olabilir (CarrierParty her durumda NG'nin kendisi, TCKN'li).

## Kök neden (kodda doğrulandı)

`backend/src/modules/efatura/uyumsoft-irsaliye.service.ts`:

- `buildPartyXml()` (satır 309-334, `DespatchSupplierParty`/`DeliveryCustomerParty` için) **DOĞRU**:
  `isTckn` kontrolüyle `Person`/`PartyName` arasında geçiş yapıyor.
- `buildCarrierPartyXml()` (satır 457-...) **YANLIŞ** — `scheme` değişkenini hesaplıyor ama hiç
  kullanmadan HER ZAMAN `<cac:PartyName>` yazıyor:
  ```ts
  function buildCarrierPartyXml(gonderen: DespatchPartyInfo): string {
    const scheme = gonderen.idScheme ?? partyIdScheme(gonderen.vkn);
    const vkn = gonderen.vkn.replace(/\D/g, '');
    return `
        <cac:CarrierParty>
          <cac:PartyIdentification>
            <cbc:ID schemeID="${scheme}">${escapeXML(vkn)}</cbc:ID>
          </cac:PartyIdentification>
          <cac:PartyName>
            <cbc:Name>${escapeXML(toTrUpper(gonderen.unvan))}</cbc:Name>
          </cac:PartyName>
          ...
  ```
  `gonderen` (taşıyıcı = kendi aracımız = NG'nin kendisi) TCKN'li olduğu için, `schemeID="TCKN"`
  yazılırken hemen altında `Person` DEĞİL `PartyName` geliyor — tam olarak GİB'in reddettiği kural.

## İstenen

`buildCarrierPartyXml()`'i, `buildPartyXml()`'deki AYNI TCKN/VKN ayrımını kullanacak şekilde
güncelleyin:

```ts
function buildCarrierPartyXml(gonderen: DespatchPartyInfo): string {
  const scheme = gonderen.idScheme ?? partyIdScheme(gonderen.vkn);
  const vkn = gonderen.vkn.replace(/\D/g, '');
  const isTckn = scheme === 'TCKN';
  const nameXml = isTckn
    ? `<cac:Person>
        <cbc:FirstName>${escapeXML(toTrUpper(gonderen.unvan.split(/\s+/)[0] ?? gonderen.unvan))}</cbc:FirstName>
        <cbc:FamilyName>${escapeXML(toTrUpper(gonderen.unvan.split(/\s+/).slice(1).join(' ') || gonderen.unvan))}</cbc:FamilyName>
      </cac:Person>`
    : `<cac:PartyName>
        <cbc:Name>${escapeXML(toTrUpper(gonderen.unvan))}</cbc:Name>
      </cac:PartyName>`;
  return `
      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="${scheme}">${escapeXML(vkn)}</cbc:ID>
        </cac:PartyIdentification>
        ${nameXml}
        <cac:PostalAddress>
          ...
```

`buildPartyXml()`'deki ad/soyad bölme mantığını (satır 314-315) BİREBİR aynı şekilde kopyalayın,
yeni bir yardımcı fonksiyon yazmaya gerek yoksa doğrudan tekrar edin ya da ortak bir
`splitUnvanToPersonXml(unvan)` fonksiyonuna çıkarıp her iki yerden de çağırın (tercihiniz, ikisi de
kabul).

## Test

1. Aynı-VKN (ANADEPO→GVN2, NG içi) bir e-İrsaliye gönderin — outbox'ta artık `Success`/onaylı
   olduğunu, 1195 ALMADIĞINIZI gösterin.
2. Farklı-VKN (ANADEPO→GVN1/ADESE) bir e-İrsaliye gönderin — aynı şekilde artık başarılı olduğunu
   gösterin.
3. Eğer 1195 hâlâ devam ederse, gönderilen UBL'in tam içeriğini raporda paylaşın — bu durumda
   CarrierParty tek başına yeterli değilmiş demektir, başka bir yeri daha aramamız gerekecek, ama en
   azından bu somut, kanıtlanmış hatayı temizlemiş oluruz.

## Rapor formatı

Değişen satırlar + yeni UBL'nin `CarrierParty` bloğu (önce/sonra) + her iki senaryonun outbox
sonucu (ETTN + durum).
