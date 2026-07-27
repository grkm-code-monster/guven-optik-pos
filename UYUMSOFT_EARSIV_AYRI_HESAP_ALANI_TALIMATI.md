# Uyumsoft Ayarları'na üçüncü, ayrı bir "e-Arşiv" hesap alanı ekleyin

## Durum

Görkem'in isteği: e-İrsaliye için zaten var olan "ayrı hesap" tasarımının aynısı **e-Arşiv** için de
olsun. Yani Tanımlamalar → şirket → "Uyumsoft Ayarları" ekranında üç ayrı blok olsun: e-Fatura,
e-İrsaliye, e-Arşiv — her biri kendi kullanıcı adı/şifresini alabilsin.

## Mevcut durum (kodda doğrulandı — e-İrsaliye için zaten bu desen var, e-Arşiv için YOK)

`packages/web/src/pages/admin/TanimlamalarPage.tsx`, "Uyumsoft Ayarları" modal'ında (satır
1377-1420) ZATEN iki blok var:
- `WEB SERVİS (e-Fatura)` (satır 1383-1399): `uyumsoft_username`, `uyumsoft_password`,
  `uyumsoft_gonderen_birim`
- `WEB SERVİS (e-İrsaliye — ayrı portal hesabı)` (satır 1400-1419): `uyumsoft_eirsaliye_username`,
  `uyumsoft_eirsaliye_password`, `uyumsoft_eirsaliye_gonderen_birim`, boş bırakılırsa e-Fatura
  kimliğine düşüyor.

Backend'de bu ikili yapı `backend/src/modules/uyumsoft/uyumsoft.service.ts`'teki
`getCredentialsForSirket()` (e-Fatura, satır 14-33) ve
`backend/src/modules/efatura/uyumsoft-irsaliye.service.ts`'teki `getDespatchCredentialsForSirket()`
(satır 29-56 — önce `uyumsoft_eirsaliye_*`'a bakar, boşsa `getCredentialsForSirket()`'e düşer) ile
destekleniyor.

**e-Arşiv için bu ayrım hiç yok.** `uyumsoft-efatura.service.ts`, `eFaturaGonder()` →
`sendInvoice()` (`uyumsoft.service.ts` satır 264-289), `profileId` ('TEMELFATURA' veya
'EARSIVFATURA') ne olursa olsun HER ZAMAN `getCredentialsForSirket(sirketId)` (yani e-Fatura'nın ana
kimlik bilgisi) ve `getClient(sirketId)` (aynı cache, aynı kimlik bilgisiyle kurulmuş SOAP client)
kullanıyor. e-Arşiv'in kendi ayrı bir Uyumsoft hesabı olması ihtimali kodda hiç düşünülmemiş.

## İstenen

### 1. Backend — yeni kimlik bilgisi kaynağı

`uyumsoft.service.ts`'e (veya uygun görürseniz `uyumsoft-efatura.service.ts`'e),
`getDespatchCredentialsForSirket()` ile BİREBİR AYNI DESENDE yeni bir fonksiyon ekleyin:
```ts
const EARSIV_CREDS_KEYS = [
  'uyumsoft_earsiv_username',
  'uyumsoft_earsiv_password',
  'uyumsoft_earsiv_gonderen_birim',
] as const;

/**
 * e-Arşiv hesabı e-Fatura'dan ayrı olabilir.
 * Önce uyumsoft_earsiv_* anahtarlarına bakılır; yoksa e-Fatura kimliğine düşülür.
 */
export async function getEArsivCredentialsForSirket(
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<UyumsoftCredentials & { kaynak: 'earsiv' | 'efatura' }> {
  // getDespatchCredentialsForSirket ile aynı mantık, anahtar isimleri EARSIV_CREDS_KEYS
}
```

### 2. Backend — client cache'i profile'a göre ayırın

`getClient(sirketId)` şu an TEK bir Map (`clients`) ile, sadece `sirketId` anahtarıyla cache'liyor —
e-Arşiv için farklı kimlik bilgisi kullanılacaksa bu YETMEZ (aynı sirketId için iki farklı kimlik
bilgisiyle iki farklı client gerekebilir). `getClient()`'ı genişletin (ör.
`getClient(sirketId, credsOverride?: UyumsoftCredentials, cacheKeySuffix?: string)`) veya ayrı bir
`getInvoiceClientForProfile(sirketId, profileId)` fonksiyonu yazıp cache anahtarını
`${sirketId}:${profileId === 'EARSIVFATURA' ? 'earsiv' : 'efatura'}` yapın — hangisini seçerseniz
seçin, e-Arşiv kimliği e-Fatura'dan farklıysa iki ayrı SOAP client oluşmalı, birbirini ezmemeli.

### 3. Backend — `sendInvoice()`'ı profile-farkında yapın

`sendInvoice()` (`uyumsoft.service.ts` satır 264-289) şu an sadece `sirketId` alıyor. `profileId`'yi
de parametre olarak alacak şekilde güncelleyin, `profileId === 'EARSIVFATURA'` ise
`getEArsivCredentialsForSirket()`/yeni client fonksiyonunu, değilse mevcut
`getCredentialsForSirket()`/`getClient()`'ı kullanın. Çağrı noktalarını (`eFaturaGonder()` ve
transfer e-Fatura akışı) güncelleyin.

### 4. Backend — `/sirket-ayar/:sirketId` cache temizleme

`admin.controller.ts` satır 6695-6710 civarındaki `POST /sirket-ayar/:sirketId` handler'ı, şu an
sadece `uyumsoft_eirsaliye_` prefix'i değiştiyse despatch client cache'ini temizliyor (satır
6707-6710). `uyumsoft_earsiv_` veya `uyumsoft_username`/`uyumsoft_password` değiştiğinde de yeni
e-Arşiv/e-Fatura client cache'ini temizleyecek şekilde genişletin.

### 5. Frontend — üçüncü blok

`TanimlamalarPage.tsx`'te:
- `uyumsoftForm` state'ine (satır 1200-1216 civarı) `uyumsoft_earsiv_username`,
  `uyumsoft_earsiv_password`, `uyumsoft_earsiv_gonderen_birim` ekleyin.
- `uyumsoftAyarlariniYukle()`'de (satır ~1252-1273) bu üç alanı da yükleyin (e-İrsaliye alanlarıyla
  aynı desen).
- Modal'a (satır 1377-1420 arası, e-İrsaliye bloğunun HEMEN ALTINA, "ŞİRKET BİLGİLERİ" bloğundan
  ÖNCE), birebir aynı görsel desende üçüncü bir blok ekleyin:
  ```
  WEB SERVİS (e-Arşiv — ayrı portal hesabı)
  "e-Arşiv e-Fatura'dan farklı bir Uyumsoft hesabında olabilir. Boş bırakılırsa e-Fatura kimliği
  kullanılır."
  - e-Arşiv Kullanıcı Adı
  - e-Arşiv Şifre
  - e-Arşiv Gönderen Birim (opsiyonel)
  ```
- Özet satırında (satır 1310-1314 civarı, `eirsaliyeDbKayitli` ile "e-İrsaliye ayrı hesap tanımlı"
  gösteren mantık) aynı şekilde e-Arşiv için de `earsivDbKayitli` ekleyip özet metnine dahil edin.

## Test

1. Tanımlamalar → NG → Uyumsoft Ayarları'nı açın, üç blok halinde (e-Fatura / e-İrsaliye / e-Arşiv)
   ayrı kullanıcı adı/şifre girilebildiğini gösterin.
2. e-Arşiv alanlarını BOŞ bırakıp kaydedin — e-Arşiv gönderiminin hâlâ e-Fatura kimliğine düştüğünü
   (regresyon yok) doğrulayın.
3. e-Arşiv alanlarına GERÇEK bir değer girip kaydedin, bir e-Arşiv gönderimi deneyin — artık o ayrı
   hesabın kullanıldığını (log'da `kaynak: 'earsiv'` veya benzeri bir işaretle) gösterin.

## Rapor formatı

Değişen dosyalar/satırlar + üç bloklu ekranın görüntüsü + test sonuçları.
