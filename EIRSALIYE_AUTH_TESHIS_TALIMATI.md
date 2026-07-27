# e-İrsaliye "yetkisi yok" hatası — kimlik doğrulama + servis eşleşmesi teşhisi (v2)

Amaç: NG hesabında e-İrsaliye API çağrısının "Bu müşterinin e-irsaliye gönderim yetkisi yok
(EFT-IST-SRVS12)" hatasını verme sebebinin hesap yetkisi mi, yanlış kimlik doğrulama yöntemi mi,
yoksa **yanlış servis eşleşmesi** mi olduğunu netleştirmek. Uyumsoft'u aramadan önce bunu
netleştireceğiz — Görkem sonucu Uyumsoft'a göre anlatacak.

Sadece teşhis/test yapın. `uyumsoft-irsaliye.service.ts`'in canlıda kullanılan davranışını
(transfer akışını) kalıcı değiştirmeyin — testleri ayrı, tek seferlik script(ler)le yapın
(`backend/scripts/` altına, iş bitince silinebilir).

## Yeni bilgi — Görkem'in elindeki referans

Görkem'in elinde şu eşleşme var (muhtemelen Uyumsoft'un kendi entegrasyon dokümantasyonundan):

- **e-Fatura** → `https://efatura.uyumsoft.com.tr/Services/**Integration**`
- **e-İrsaliye** → `https://efatura.uyumsoft.com.tr/Services/DespatchIntegration`

Ama bizim kodumuz (`uyumsoft.service.ts`) e-Fatura için **`BasicIntegration`** kullanıyor
(`Integration` değil!) — ve bu servis şu an çalışıyor, POS satışlarında gerçek Uyumsoft fatura
numarası dönüyor. Yani en az üç farklı SOAP servisi var: `Integration`, `BasicIntegration`,
`DespatchIntegration`. Üçünün WSDL'i de tarayıcıdan/otomatik araçtan çekilemiyor (genel WCF açılış
sayfası dönüyor, gerçek XML içeriği alınamadı) — bu yüzden hangisinin hangi kimlik doğrulama
yöntemini beklediğini ancak deneyerek öğrenebiliriz.

**Olası ihtimal:** `Integration` ve `DespatchIntegration` aynı "tam entegrasyon" ailesinin parçası
olabilir (ortak modül/yetki), `BasicIntegration` ise ayrı, daha sınırlı bir servis. Eğer öyleyse
bizim e-Fatura'yı `BasicIntegration` üzerinden, e-İrsaliye'yi `DespatchIntegration` üzerinden
çağırmamız — iki farklı aileden servis karışımı — asıl sorunun kaynağı olabilir; kimlik doğrulama
yöntemi (Basic Auth vs WS-Security) bunun bir belirtisi olabilir, tek başına sebep olmayabilir.

## Adım 1 — Baseline: mevcut DespatchIntegration + WSSecurity ile hangi çağrılar çalışıyor?

`verifyDespatchConnection()`, `getDespatchSystemDate()`, `isEDespatchUser()` fonksiyonlarını NG
hesabı (`sirketId='ng'`) için tek tek, gerçek ağ çağrısıyla çalıştırın. Raporlayın: her biri
başarılı mı, hangi hata/sonuç dönüyor.

## Adım 2 — DespatchIntegration'ı Basic Auth ile deneyin

Ayrı bir test scriptinde, `getDespatchClient` mantığını kopyalayıp
`soap.createClientAsync(DESPATCH_WSDL_URL, { wsdl_headers: { Authorization: 'Basic ' + base64(user:pass) } })`
+ `client.setSecurity(new soap.BasicAuthSecurity(username, password))` ile aynı NG kimlik
bilgileriyle `GetSystemDate` / `UserInfoWithNoCheck` deneyin. Sonucu raporlayın.

## Adım 3 — YENİ: `Integration` servisini deneyin (e-Fatura için "doğru" uç)

`https://efatura.uyumsoft.com.tr/Services/Integration` servisine, NG kimlik bilgileriyle
**önce Basic Auth** (BasicIntegration'daki gibi) ile bağlanıp zararsız bir çağrı deneyin
(`GetSystemDate`, `TestConnection` gibi — WSDL'de hangi operasyonlar varsa `soap` client'ın
`describe()` çıktısından görebilirsiniz, önce onu da raporlayın). Başarısız olursa **WS-Security**
ile de deneyin. Bu servisin var olup olmadığını, kimlik bilgilerimizle görünür/erişilir olup
olmadığını netleştirin.

## Adım 4 — Sonuç raporu

Aşağıdaki tabloyu doldurarak raporlayın (her hücreye: başarılı / hata mesajı / denenmedi):

| Servis | Basic Auth | WS-Security |
|--------|-----------|-------------|
| BasicIntegration (e-Fatura, referans — zaten biliniyor) | ✅ çalışıyor | denenmedi |
| Integration | ? | ? |
| DespatchIntegration | ? (Adım 2) | ? (Adım 1, mevcut durum) |

Sonra üç ihtimalden hangisine işaret ediyor, net yazın:

1. **DespatchIntegration hiçbir kombinasyonda çalışmıyor, ama `Integration` servisi Basic Auth'la
   çalışıyor** → asıl sorun servis karışımı: e-İrsaliye'yi `DespatchIntegration` yerine
   `Integration` servisi üzerinden mi göndermemiz gerekiyor, yoksa `Integration`+`DespatchIntegration`
   birlikte mi aktifleştirilmesi gereken bir modül — bunu Uyumsoft'a sorarız.
2. **Hiçbiri (Integration dahil) kimlik bilgilerimizle çalışmıyor** → hesap seviyesinde gerçek bir
   yetki eksikliği var, Uyumsoft'a "e-İrsaliye/Integration Web Servis entegrasyon yetkim kapalı,
   EFT-IST-SRVS12" diye net söyleyebiliriz.
3. **DespatchIntegration'da sadece auth yöntemi (Basic Auth) değiştirince çalışıyor** → kod hatası,
   Uyumsoft'u aramaya gerek yok, `uyumsoft-irsaliye.service.ts`'de WSSecurity → BasicAuthSecurity
   değişikliği yaparız.

Kod değişikliği yapmadan önce bu raporu bana getirin, birlikte karar verelim.
