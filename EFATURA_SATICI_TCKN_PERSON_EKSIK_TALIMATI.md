# e-Fatura reddi bulundu — SATICI (NG) tarafı TCKN'de `cac:Person` yazmıyor

## Durum

E-Arşiv kimlik bilgisi düzeltmesinden sonra e-Fatura artık gerçekten Uyumsoft'a gidiyor (kuyruğa
alınıyor, "eArsiv" senaryosu tetikleniyor) — bu kısım ARTIK ÇALIŞIYOR. Ama GİB, gönderilen belgeyi
şu net hatayla reddediyor (3 denemenin hepsinde aynı):

> SCHEMATRON KONTROL SONUCU HATALI: schemeID niteliği değeri 'TCKN' olması durumunda cac:Person
> elemanı bulunmalıdır. (EFT-IST-IMZ2 / IMZ6 / IMZ8 / IMZ10 / IMZ12)

Bu, önceki "1195" gibi belirsiz bir hata DEĞİL — GİB tam olarak hangi kuralın ihlal edildiğini
söylüyor.

## Kök neden (kodda doğrulandı)

`backend/src/modules/efatura/uyumsoft-efatura.service.ts`, fatura UBL'inin `AccountingSupplierParty`
(SATICI = bizim şirketimiz, NG) bloğu (satır 466-496):

```ts
<cac:PartyIdentification>
  <cbc:ID schemeID="${satici.idScheme}">${escapeXML(satici.vkn)}</cbc:ID>
</cac:PartyIdentification>
<cac:PartyName>
  <cbc:Name>${escapeXML(satici.idScheme === 'TCKN' ? toTrUpper(satici.unvan) : satici.unvan)}</cbc:Name>
</cac:PartyName>
```

`satici.idScheme` ne olursa olsun HER ZAMAN `<cac:PartyName>` yazıyor. NG (Nejla Gümüşkesen Optik)
şahıs firması olduğu için `satici.idScheme === 'TCKN'` — GİB şematronu, `schemeID="TCKN"` olan her
tarafta (`PartyIdentification`'da TCKN yazıyorsa) `<cac:PartyName>` DEĞİL `<cac:Person>` (FirstName +
FamilyName) bekliyor. Bu yüzden NG'nin gönderdiği HER fatura bu kurala takılıyor — müşteri VKN'li
olsun TCKN'li olsun fark etmez, SATICI tarafı zaten hatalı.

**Karşılaştırma — ALICI (müşteri) tarafı bunu doğru yapıyor:** Aynı dosyada `buildCustomerPartyXml()`
(satır 291-303) tam doğru desende:
```ts
const idScheme = data.aliciVkn.replace(/\D/g, '').length === 10 ? 'VKN' : 'TCKN';
const { ad, soyad } = splitAdSoyad(data.aliciAdi);
const isTckn = idScheme === 'TCKN';
const kimlikXML = isTckn
  ? `<cac:Person>
      <cbc:FirstName>${escapeXML(ad)}</cbc:FirstName>
      <cbc:FamilyName>${escapeXML(soyad)}</cbc:FamilyName>
    </cac:Person>`
  : `<cac:PartyName>
      <cbc:Name>${escapeXML(toTrUpper(data.aliciAdi))}</cbc:Name>
    </cac:PartyName>`;
```
SATICI tarafında AYNI mantık uygulanmamış — bu bir asimetri/gözden kaçırma hatası.

## İstenen

`AccountingSupplierParty` bloğunu (satır 466-496), `buildCustomerPartyXml()`'deki desenle BİREBİR
aynı şekilde güncelleyin:

1. `satici.idScheme === 'TCKN'` ise `splitAdSoyad(satici.unvan)` ile ad/soyad ayırıp
   `<cac:Person><cbc:FirstName>...</cbc:FirstName><cbc:FamilyName>...</cbc:FamilyName></cac:Person>`
   yazın.
2. `satici.idScheme === 'VKN'` ise mevcut `<cac:PartyName>` davranışını AYNEN koruyun.
3. `splitAdSoyad()` fonksiyonunun zaten dosyada tanımlı olduğunu (satır 293 civarında kullanılıyor)
   doğrulayıp aynen tekrar kullanın, yeni bir fonksiyon yazmayın.
4. Bu değişikliğin `buildPartyLegalEntityXml(satici.unvan, satici.vkn, satici.idScheme)` çağrısını
   (satır 490) ETKİLEMEDİĞİNİ doğrulayın — o fonksiyon zaten `idScheme === 'TCKN'` ise boş string
   dönüyor (satır 282), bu doğru, dokunmayın.
5. Kodda başka bir yerde (varsa, ör. transfer e-Fatura akışındaki ayrı bir satıcı/alıcı XML üretim
   noktası) AYNI "satıcı TCKN'de hep PartyName" hatasının tekrarlanıp tekrarlanmadığını grep ile
   kontrol edin (`cac:PartyName` + `satici` veya `gonderen` geçen diğer noktalar), varsa aynı
   düzeltmeyi orada da uygulayın.

## Test

1. Bugün hataya düşen iki faturayı (`ANA2026000000008`, `ANA2026000000009` — ETTN
   `DC1A6291-3D7C-45AD-9EEE-B2EB74ED22E5` ve `D87AF811-E372-4E96-BCDA-B57AAC712E37`) referans alarak
   AYNI müşteri/tutarla yeni bir test satışı yapıp e-Fatura gönderin — artık
   "SCHEMATRON KONTROL SONUCU HATALI ... cac:Person" hatası ALMADIĞINI, Uyumsoft'ta belge durumunun
   "Onaylandı" olduğunu gösterin.
2. VKN'li (kurumsal) bir müşteriye kesilen bir faturanın hâlâ sorunsuz çalıştığını (regresyon
   kontrolü — alıcı tarafı zaten doğruydu, satıcı tarafının VKN dalı da değişmedi ama yine de
   doğrulayın) gösterin.

## Not — iki kez kesilme sorunu (ayrı, küçük bir gözlem)

Görkem aynı satıştan yanlışlıkla İKİ fatura oluştuğunu fark etti (`ANA2026000000008` ve `...009`,
aynı tutar 9,82₺, birkaç dakika arayla). Muhtemelen "Durumu Yenile" butonuna art arda basılması
`tetikleSatisEFatura()`'yı tekrar tetikledi. `tetikleSatisEFatura()`'nın en başındaki
`if (!sale || sale.eFaturaDurum === 'GONDERILDI') return;` kontrolü, durum `BEKLIYOR`/`HATA` iken bu
tekrar denemeyi engellemiyor — bu beklenen bir davranış (retry için gerekli) ama art arda hızlı
tıklamalarda mükerrer kayıt riski var. Bu talimatın ana konusu değil, çözüldükten sonra ayrıca ele
alınabilir; şimdilik sadece not düşün, bu talimatta düzeltmeyin.

## Rapor formatı

Değişen satırlar + yeni test faturasının Uyumsoft'taki durumu (ETTN + "Onaylandı" ekran görüntüsü).
