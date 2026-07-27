# e-İrsaliye Entegrasyonu — Teknik Rapor ve 1195 Hatası İçin Ek İnceleme Talebi

## Amaç

Devam eden "1195 SİSTEM HATASI" sorunu için (bkz. `UYUMSOFT_DESTEK_MESAJI_TASLAK.md`) kendi
tarafımızda içerik/şema seviyesinde deneyebileceğimiz her şeyi denedik. Bu belgede entegrasyon
kodumuzun tamamını (SOAP çağrıları, kimlik doğrulama, UBL üretimi, alias çözümleme) paylaşıyoruz ve
şimdiye kadar incelemediğimiz YENİ bir olası kaynağa — **gönderen posta kutusu/alias**
(`urn:mail:defaultgb@guvenoptik.com`) — dikkat çekmek istiyoruz.

## 1) Genel mimari

- Dil/kütüphane: Node.js/TypeScript, SOAP istemcisi için `node-soap` (`import * as soap from
  'soap'`).
- Servis: `https://efatura.uyumsoft.com.tr/Services/DespatchIntegration?singleWsdl`
- Kimlik doğrulama: `client.setSecurity(new soap.WSSecurity(username, password))` — WS-Security,
  kullanıcı adı/şifre.
- Kullandığımız operasyonlar: `SendDespatchAsync`, `QueryOutboxDespatchStatusAsync`,
  `GetUserAliassesAsync`, `GetSystemDateAsync`.

## 2) Kimlik bilgisi ayrımı — e-Fatura ile e-İrsaliye FARKLI hesaplar

Firmamızda (NG — Nejla Gümüşkesen Optik) e-Fatura ve e-İrsaliye için Uyumsoft portalında AYRI iki
web servis hesabı tanımlı:

- **e-Fatura + e-Arşiv:** `NejlaGumuskesen_WebServis`
- **e-İrsaliye:** `NejlaGumuskesen_WebServis2`

Kodda bu ayrım şöyle yönetiliyor:

```ts
// backend/src/modules/efatura/uyumsoft-irsaliye.service.ts
export async function getDespatchCredentialsForSirket(sirketId = DEFAULT_SIRKET_ID) {
  // önce uyumsoft_eirsaliye_* anahtarlarına bakılır; yoksa e-Fatura kimliğine düşülür
  const username = map.uyumsoft_eirsaliye_username;
  const password = map.uyumsoft_eirsaliye_password;
  if (username && password) {
    return {
      username, password,
      gonderenBirim: map.uyumsoft_eirsaliye_gonderen_birim || efaturaFallback?.gonderenBirim || '',
      kaynak: 'eirsaliye',
    };
  }
  return { ...(await getCredentialsForSirket(sirketId)), kaynak: 'efatura' };
}

export async function getDespatchClient(sirketId = DEFAULT_SIRKET_ID) {
  const creds = await getDespatchCredentialsForSirket(sirketId);
  const client = await soap.createClientAsync(DESPATCH_WSDL_URL);
  client.setSecurity(new soap.WSSecurity(creds.username, creds.password));
  return client;
}
```

**Önemli teknik not:** `gonderenBirim` alanını okuyup credentials objesine koyuyoruz ama **SOAP
isteğinin HİÇBİR yerinde bu değeri fiilen kullanmıyoruz** — sadece `username`/`password`
`WSSecurity` ile gönderiliyor. Yani göndericinin kimliği/posta kutusu tarafımızdan AÇIKÇA
belirtilmiyor; tamamen Uyumsoft'un o kullanıcı adına (`NejlaGumuskesen_WebServis2`) sunucu
tarafında eşlediği hesap/posta kutusu bilgisine bağlı.

## 3) Gönderim akışı — `SendDespatchAsync`

```ts
async function sendDespatchOnce(client, input, ettn, aliciAlias) {
  const xmlContent = buildDespatchAdviceUbl({ ...input, ettn });
  const despatchInfo = {
    attributes: { LocalDocumentId: input.localDocumentId ?? input.irsaliyeNo },
    DespatchAdvice: { $xml: ublToUyumsoftDespatchContent(xmlContent) },
    TargetCustomer: {
      attributes: {
        VknTckn: input.alici.vkn.replace(/\D/g, ''),
        Title: input.alici.unvan,
        ...(aliciAlias ? { Alias: aliciAlias } : {}),
      },
    },
  };
  const [result] = await client.SendDespatchAsync({ despatches: { DespatchInfo: [despatchInfo] } });
  return parseSendDespatchResponse(result, ettn);
}
```

`SendDespatchAsync` isteğinde **GÖNDEREN tarafı için alias/posta kutusu alanı hiç yok** — sadece
`TargetCustomer` (alıcı) için opsiyonel `Alias`. Gönderen kimliği tamamen WS-Security'deki
kullanıcı adına bağlı.

## 4) Alıcı alias çözümleme — `GetUserAliassesAsync`

Alıcının e-İrsaliye posta kutusu alias'ını önce sorguluyoruz, placeholder (varsayılan/test)
değerleri eliyoruz:

```ts
const PLACEHOLDER_ALIAS_MARKERS = ['defaultpk', 'default@', 'test@', 'noreply@'];

export function isPlaceholderDespatchAlias(alias?: string): boolean {
  if (!alias?.trim()) return true;
  const local = alias.replace(/^urn:mail:/i, '').trim().toLowerCase();
  return PLACEHOLDER_ALIAS_MARKERS.some((m) => local.includes(m));
}

export function parseDespatchReceiverAlias(aliasResult: unknown): string | undefined {
  const value = (aliasResult as any)?.GetUserAliassesResult?.Value;
  // e-İrsaliye için önce DespatchReceiverboxAliases — ReceiverboxAliases'teki defaultpk placeholder olabilir
  const sources = [value?.DespatchReceiverboxAliases, value?.ReceiverboxAliases];
  for (const boxes of sources) {
    for (const row of (Array.isArray(boxes) ? boxes : boxes ? [boxes] : [])) {
      const alias = row?.attributes?.Alias ?? row?.Alias;
      const clean = sanitizeDespatchReceiverAlias(alias);
      if (clean) return clean;
    }
  }
  return undefined;
}
```

Gönderim sırasında alias hatası alınırsa (mesajda "alias" + "bulunmuyor/not found/geçersiz"
geçiyorsa), alias'sız olarak bir kez daha deniyoruz:

```ts
let parsed = await sendDespatchOnce(client, baseInput, ettn, safeAlias);
if (!parsed.basarili && safeAlias && isAliasRelatedDespatchError(parsed.mesaj)) {
  parsed = await sendDespatchOnce(client, baseInput, ettn, undefined);
}
```

## 5) UBL DespatchAdvice — CarrierParty (taşıyıcı = kendi firmamız)

TCKN'li taraflar için `cac:Person`, VKN'li taraflar için `cac:PartyName` kullanıyoruz (bu ayrımı
GİB'in e-Fatura şematronunda da zorunlu bulup düzelttik):

```ts
function buildCarrierPartyXml(gonderen: DespatchPartyInfo): string {
  const scheme = gonderen.idScheme ?? partyIdScheme(gonderen.vkn);
  const isTckn = scheme === 'TCKN';
  const nameXml = isTckn
    ? `<cac:Person><cbc:FirstName>${ad}</cbc:FirstName><cbc:FamilyName>${soyad}</cbc:FamilyName></cac:Person>`
    : `<cac:PartyName><cbc:Name>${unvan}</cbc:Name></cac:PartyName>`;
  return `
    <cac:CarrierParty>
      <cac:PartyIdentification><cbc:ID schemeID="${scheme}">${vkn}</cbc:ID></cac:PartyIdentification>
      ${nameXml}
      <cac:PostalAddress>...</cac:PostalAddress>
    </cac:CarrierParty>`;
}
```

## 6) Outbox durum sorgulama

```ts
const [result] = await client.QueryOutboxDespatchStatusAsync({ despatchIds: { string: [ettn] } });
```

## 7) Şimdiye kadar denenen düzeltmeler (özet — hiçbiri 1195'i tek başına çözmedi)

1. UBL `Country` alanı `IdentificationCode` yerine `Name` ("Türkiye").
2. `CarrierParty`'ye eksik `PartyIdentification` eklendi.
3. Alıcı posta kutusu alias'ı doğru kaynaktan (`DespatchReceiverboxAliases`) okunacak şekilde
   düzeltildi.
4. `DeliveryAddress` ve `PostalZone` eklendi.
5. `cac:PartyLegalEntity` bloğu tüzel kişi taraflar için eklendi.
6. `CarrierParty`'de TCKN'li taraf için `cac:Person` kullanımı düzeltildi (madde 5'teki UBL şeması).

Sorun hem aynı VKN (NG içi şubeler arası) hem farklı VKN (NG→ADESE) senaryosunda devam ediyor.

## 8) YENİ inceleme talebi — gönderen posta kutusu/alias

Madde 2'de belirttiğimiz gibi, kodumuz gönderen tarafının posta kutusu/alias bilgisini SOAP
isteğinde HİÇ belirtmiyor — bu tamamen sunucu tarafında, kullandığımız web servis kullanıcı adına
(`NejlaGumuskesen_WebServis2`) bağlı olarak sizin sisteminizde çözümleniyor.

E-Fatura tarafında firmamızın göndericisi olarak `urn:mail:defaultgb@guvenoptik.com` adresini
kullandığımızı görüyoruz. Sorularımız:

- Bu adres, **e-Fatura hesabına** (`NejlaGumuskesen_WebServis`) mı yoksa **VKN/firma seviyesinde
  genel** bir varsayılan mı?
- **e-İrsaliye hesabımıza** (`NejlaGumuskesen_WebServis2`) sisteminizde AYNI/geçerli bir gönderen
  posta kutusu/alias tanımlı mı, yoksa bu hesap için eksik/varsayılan (default) bir değer mi
  atanmış? "default" ön ekli adresler (örn. `defaultgb@...`) tarafımızdaki alıcı-alias
  filtrelememizde de "henüz özel bir posta kutusu tanımlanmamış" anlamına geliyor
  (`isPlaceholderDespatchAlias` — `default@`, `defaultpk` gibi markerlar) — aynı mantık gönderen
  tarafı için de geçerliyse, e-İrsaliye hesabımızın gönderen kimliği eksik/varsayılan olabilir ve
  bunun zarf/şematron seviyesinde reddedilmeye (1195) yol açması mümkün.

**Değerlendirmemiz (görüşümüz):** Şimdiye kadarki 6 düzeltme UBL içeriği/şema seviyesindeydi ve
hiçbiri sorunu çözmedi. Kodumuzda gönderen posta kutusunu biz belirlemediğimize göre, kalan olası
kaynak UBL içeriği DEĞİL, **hesap/zarf düzeyinde bir yapılandırma** (özellikle e-İrsaliye'ye özgü
`NejlaGumuskesen_WebServis2` hesabının gönderen posta kutusu/yetkilendirme kaydı) olabilir. Bu
hesabın e-İrsaliye gönderimi için portalınızda doğru şekilde etkinleştirilip etkinleştirilmediğini
(gönderen posta kutusu ataması dahil) sizin tarafınızda kontrol etmenizi rica ediyoruz.

## 9) Canlı API teşhisi — `GetUserAliasses` ve hesap durumu (22.07.2026)

Madde 8'deki gönderen posta kutusu hipotezini doğrulamak için production kimlik bilgileriyle
`GetUserAliassesAsync` ve `UserInfoWithNoCheckAsync` çağrıları yapıldı.

### 9.1) NG (23819441406) — her iki web servis hesabı aynı sonucu döndürüyor

Hem `NejlaGumuskesen_WebServis` (e-Fatura) hem `NejlaGumuskesen_WebServis2` (e-İrsaliye) ile
sorgulandığında `GetUserAliassesResult.Value` içeriği birebir aynı:

| Alan | Alias | Enabled | Not |
|------|-------|---------|-----|
| `SenderboxAliases` (Type 2) | `urn:mail:defaultgb@guvenoptik.com` | true | e-Fatura gönderen GB |
| `ReceiverboxAliases` (Type 1) | `urn:mail:defaultpk@guvenoptik.com` | true | e-Fatura alıcı PK (placeholder) |
| **`DespatchSenderboxAliases` (Type 4)** | **`urn:mail:eirsaliyegb@gumuskesen.com`** | **true** | **e-İrsaliye gönderen GB — özel adres, `default` değil** |
| `DespatchReceiverboxAliases` (Type 3) | `urn:mail:eirsaliyepk@gumuskesen.com` | true | e-İrsaliye alıcı PK |

**Sonuç:** VKN/firma seviyesinde e-İrsaliye gönderen posta kutusu **tanımlı ve etkin** görünüyor;
eksik/placeholder bir `DespatchSenderboxAlias` kaydı yok.

Veritabanımızdaki `uyumsoft_eirsaliye_gonderen_birim` alanı (boşsa e-Fatura'dan devralınan)
`urn:mail:defaultgb@guvenoptik.com` değerini tutuyor — bu e-Fatura GB alias'ı, e-İrsaliye GB
değil. Ancak madde 2'de belirtildiği gibi bu alan **SOAP isteğinde kullanılmıyor**; yalnızca
ayar ekranında saklanıyor.

### 9.2) ADESE (0071251547) — alıcı alias'ları

e-İrsaliye hesabı (`WebServis2`) ile sorgulandığında:

| Alan | Alias |
|------|-------|
| `DespatchReceiverboxAliases` | `urn:mail:eirsaliyepk@adese.com.tr` |
| `DespatchSenderboxAliases` | `urn:mail:eirsaliyegb@adese.com.tr` |
| `ReceiverboxAliases` | `urn:mail:defaultpk@adeseoptik.com` (placeholder — kodumuz bunu eliyor) |

Kodumuz alıcı alias'ını `DespatchReceiverboxAliases`'ten okuyor; ADESE için doğru PK
(`eirsaliyepk@adese.com.tr`) seçiliyor.

### 9.3) `UserInfoWithNoCheck` — e-İrsaliye hesabı (`WebServis2`)

```
Username: NejlaGumuskesen_WebServis2
Services.HasEDespatch: true
Services.HasEInvoice / HasEarchive: false  (beklenen — ayrı hesap)
DetailedServiceInfo:
  - EDespatch: Active (2025-07-01)
  - EDespatchArchive: Active (2025-07-01)
IsWebServiceAdmin: true
```

Hesap e-İrsaliye servisi için **aktif** görünüyor; yetki/kapalı servis ihtimali zayıflıyor.

### 9.4) WSDL — `SendDespatch` gönderen alias alanı yok

`DespatchIntegration` WSDL'inde `DespatchInfo` complex type:

```
DespatchAdvice (UBL XML)
TargetCustomer { VknTckn, Alias?, Title? }   ← yalnızca ALICI
Notification
@LocalDocumentId
@ExtraInformation
```

Gönderen tarafı için SOAP seviyesinde alias alanı **tanımlı değil**; gönderen kimliği
WS-Security kullanıcı adına ve sunucu tarafı eşlemesine bağlı.

### 9.5) Outbox durumu (22.07.2026 sorgusu)

| ETTN | Senaryo | Outbox |
|------|---------|--------|
| `C2CD35DF-0109-4234-9DBB-ABC276FE05D4` | NG→ADESE | **Error / 1195 SISTEM HATASI** |
| `AA4C4487-2701-4270-864E-20536FB06170` | NG içi | (sorgu zaman aşımı — önceki kayıtlarda da Error/1195) |

### 9.6) Güncellenmiş değerlendirme ve ek sorular

Madde 8'deki "gönderen posta kutusu eksik/varsayılan olabilir" hipotezi **VKN seviyesinde
çürütülüyor**: `DespatchSenderboxAliases` altında `eirsaliyegb@gumuskesen.com` kayıtlı ve etkin.

Kalan açık sorular:

1. `SendDespatchAsync` çağrısında `NejlaGumuskesen_WebServis2` kimliğiyle zarf oluşturulurken
   sunucu tarafında hangi gönderen alias kullanılıyor?
   - `urn:mail:eirsaliyegb@gumuskesen.com` (DespatchSenderboxAliases) mı,
   - yoksa `urn:mail:defaultgb@guvenoptik.com` (SenderboxAliases / e-Fatura GB) mi?
2. Yukarıdaki test ETTN'leri için GİB şematron / zarf loglarında **hangi alan** reddediliyor?
   (UBL içeriğini tarafımızda doğruladık; sunucu tarafı detayına ihtiyacımız var.)
3. Aynı VKN'li şube transferi (ANADEPO→GVN2) GİB kurallarına göre e-İrsaliye kapsamında mı?
   (Kodumuz prod'da `isSameDespatchLegalEntity` ile atlıyor; test ETTN'leri bilinçli gönderim.)

## Test ETTN'leri (22.07.2026)

- Aynı VKN (NG içi, ANADEPO→GVN2): `AA4C4487-2701-4270-864E-20536FB06170`
- Farklı VKN (NG→ADESE, ANADEPO→GVN1): `C2CD35DF-0109-4234-9DBB-ABC276FE05D4`

**Gönderen VKN/TCKN:** 23819441406 (NG) — **Alıcı VKN (farklı VKN testinde):** 0071251547 (ADESE)

Yardımlarınız için şimdiden teşekkür ederiz.
