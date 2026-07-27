# Uyumsoft desteğinin kesin cevabı — UBL `Country` alanı yanlış formatta, 1195 hatasının kaynağı

## Durum

Uyumsoft desteği ETTN `291FDC43-2E25-4409-AEBC-A2E382FE4FB9` ve `474EB415-DE5C-42AF-981F-7B0D964219D5`
irsaliyelerini inceledi, kök nedeni kesin olarak bildirdi: UBL `Party/PostalAddress/Country` bloğunda
`IdentificationCode` kullanılması hatalı, `Name` kullanılması gerekiyor.

**İstenmeyen (şu an gönderilen):**
```xml
<cac:Country>
  <cbc:IdentificationCode>TR</cbc:IdentificationCode>
</cac:Country>
```

**İstenen (Uyumsoft'un doğrudan verdiği format):**
```xml
<cac:Country>
  <cbc:Name>Türkiye</cbc:Name>
</cac:Country>
```

## Kod tarafı (doğrulandı — üç ayrı nokta)

```
backend/src/modules/efatura/uyumsoft-irsaliye.service.ts:329-331   (buildPartyXml — e-İrsaliye, tek nokta, hem gönderen hem alıcı için ortak)
backend/src/modules/efatura/uyumsoft-efatura.service.ts:306-308    (e-Fatura, muhtemelen gönderen partisi)
backend/src/modules/efatura/uyumsoft-efatura.service.ts:469-471    (e-Fatura, muhtemelen alıcı partisi)
```

## İstenen

1. Üç noktada da `<cac:Country><cbc:IdentificationCode>TR</cbc:IdentificationCode></cac:Country>`
   bloğunu `<cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>` ile değiştirin — Uyumsoft'un
   verdiği format birebir, ekstra alan eklemeyin/çıkarmayın.
2. Bu üç konumun her birinin gerçekten aynı fonksiyonda/kalıpta olup olmadığını kontrol edin —
   `uyumsoft-efatura.service.ts`'deki iki ayrı occurrence farklı fonksiyonlara mı ait (gönderen/
   alıcı ayrı build fonksiyonları), yoksa aynı yardımcı fonksiyon mu iki kez çağrılıyor —  ona göre
   tek yerden mi düzeltilecek yoksa iki ayrı yerden mi, kontrol edip doğru şekilde uygulayın.
3. **Daha önce reddedilen iki irsaliyeyi kurtarma (opsiyonel ama önerilir):** Uyumsoft desteği
   `MoveToDraftStatus` → belge üzerinde alanı güncelle (`SaveAsDraft`) → `SendDraft` ile yeniden
   gönderim yapılabileceğini belirtti. Mümkünse bu iki spesifik ETTN için bu akışı deneyip (kod
   değişikliği sonrası) gerçekten teslim edilip edilmediğini doğrulayın. Karmaşıksa/riskliyse
   atlayın, öncelik yeni gönderimlerin doğru formatla gitmesi.
4. Bu düzeltmenin, daha önce ayrı bir sorun olarak teşhis edilmiş "EARSIVFATURA/TEMELFATURA profil
   uyuşmazlığı" (GVN1 e-Fatura, `TRANSFER-1784101433075`) hatasıyla ilgisi olup olmadığını da not
   edin — aynı kökten mi kaynaklanıyormuş, yoksa gerçekten ayrı iki sorun muymuş.

## Test

1. Değişiklik sonrası backend'i yeniden başlatıp yeni bir ANA DEPO→GVN2 (e-İrsaliye) ve ANA
   DEPO→GVN1 veya GVN3 (e-Fatura, zaten KDV düzeltmesiyle birlikte) transferi deneyip her ikisinin
   de Uyumsoft outbox'ında gerçekten `Success`/onaylı durumda olduğunu (1195 hatası olmadan)
   gösterin.
2. Gönderilen XML'in `Country` bloğunun artık `Name` formatında olduğunu (loglanan/kaydedilen UBL
   içeriğinden) doğrulayın.

## Rapor formatı

Değişen dosyalar + yeni test sonucu (outbox durumu, ETTN) + eski iki belgenin draft-resend
denemesinin sonucu (denendiyse).
