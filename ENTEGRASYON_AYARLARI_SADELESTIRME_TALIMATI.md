# Entegrasyon ayarları sadeleştirme — dağınık tanımlama ekranlarını toparlama

## Amaç

Şu an aynı entegrasyon bilgisi (özellikle Uyumsoft) birden fazla ekrandan giriliyormuş gibi
görünüyor, gerçekte tek bir yer okunuyor. Bu belge, kod okunarak doğrulanmış 3 somut sorunu
düzeltmek için. **Görkem onayladı, uygulayabilirsiniz** — ama Adım 1 (UTS ortam denetimi) için
alt adımdaki onay noktasına uyun, orada gerçek/canlı devlet sistemine bildirim gitmesi riski var.

Kod değişikliği yapmadan önce genel prensip: **her entegrasyon bilgisinin girildiği TEK bir ekran
olmalı.** Aşağıdaki 3 madde bunu sağlıyor.

---

## Madde 1 — UTS "Ortam" (Canlı/Test) denetimi — ÖNCE RAPORLA, SONRA DÜZELT

Doğrulanan kod: `backend/src/modules/uts/uts.service.ts` satır ~109-113 — `UtsSube.ortam === 'test'`
ise bildirim `https://utstest.saglik.gov.tr`'ye, değilse (`'canli'`) gerçek
`https://utsuygulama.saglik.gov.tr`'ye gidiyor.

UTS Yönetimi ekranında ANADEPO'nun Ortam'ı "Test" seçili görüldü — yani ANADEPO'dan atılan
VERME/ALMA bildirimleri muhtemelen gerçek Sağlık Bakanlığı sistemine hiç ulaşmıyor, sadece test
sunucusuna düşüyor, uygulama tarafında "başarılı" görünse bile.

**Adım 1a:** Tüm `UtsSube` kayıtlarını (branch code + kurumNo + ortam + aktif) tek bir tabloda
raporlayın (DB sorgusu yeterli, ekrana basmayın önce bana yazılı rapor verin). Hangi şubeler
`ortam='test'`, hangileri `'canli'` — net liste.

**Adım 1b:** Bu raporu bana getirin. Ben şube şube "bu gerçekten canlıya geçmeli mi" onayı
vereceğim (bazı şubeler bilerek test'te tutulmuş olabilir, kontrolsüz toplu değişiklik gerçek UTS
sistemine yanlış bildirim gönderebilir). Onay sonrası ilgili `UtsSube.ortam` kayıtlarını
güncelleyin.

**Adım 1b — ONAY (Görkem):** Raporlanan 6 test-ortamındaki şubenin (ANADEPO, GVN3, GVN5, GVN6,
GVN8, GVN9) hepsi fiilen aktif/gerçek satış-transfer yapan şubeler. Hepsinin `UtsSube.ortam`
değerini `'test'` → `'canli'` olarak güncelleyin. GVN1/GVN10/GVN2 zaten `'canli'`, dokunmayın.

Güncelleme sonrası her 6 şube için **Token Test Et** (UTS Yönetimi ekranındaki mevcut buton/uç)
çalıştırıp sonucu raporlayın — kurum no + token gerçek `utsuygulama.saglik.gov.tr` ortamında da
geçerli mi, yoksa sadece test ortamı için mi tanımlanmış, bunu görmemiz lazım (bazı token'lar
sadece test ortamına özel verilmiş olabilir, canlıya geçince "yetkisiz" hatası alabiliriz).

---

## Madde 2 — Şubeler formundaki ölü Uyumsoft kullanıcı adı/şifre alanını kaldırın

Doğrulanan kod:
- `backend/prisma/schema.prisma` → `Branch.uyumsoftUser` / `Branch.uyumsoftPass` alanları var.
- `backend/src/modules/admin/admin.controller.ts` satır ~885-935 → şube güncelleme rotası bu
  alanları yazıyor/okuyor.
- `packages/web/src/pages/admin/TanimlamalarPage.tsx` → "Şubeler" sekmesindeki düzenleme formunda
  bu alanlar için input var, ayrıca şube kartlarında `✓/✗ UYM` rozeti bu alanın dolu olup
  olmadığına bakıyor (satır ~764-771).
- **Ama gerçek Uyumsoft gönderim kodu (`backend/src/modules/uyumsoft/uyumsoft.service.ts`,
  `getCredentialsForSirket`) bu alanları HİÇ okumuyor** — sadece `SirketAyar` tablosundan
  (`sirketId` = şirket, NG/ADESE/POTENTIAL) okuyor. Yani bu alan tamamen işlevsiz, sadece kafa
  karıştırıyor ve yanıltıcı bir "✗ UYM" rozeti gösteriyor.

**Yapılacak:**
1. `TanimlamalarPage.tsx` → Şubeler sekmesindeki düzenleme formundan Uyumsoft kullanıcı adı ve
   şifre inputlarını kaldırın.
2. Şube kartlarındaki `✓/✗ UYM` rozetini kaldırın (yanıltıcı, gerçek durumu yansıtmıyor).
3. Backend tarafında `admin.controller.ts`'deki şube güncelleme rotasından `uyumsoftUser`/
   `uyumsoftPass` alan işlemesini kaldırın (artık UI'da olmayacağı için gövdeden gelmeyecek zaten,
   ama kodda da temizleyin).
4. `Branch.uyumsoftUser`/`uyumsoftPass` Prisma alanlarını **silmeyin** — mevcut veri kalsın, sadece
   kullanılmasın (ileride ihtiyaç olursa migration'sız geri açılabilir). Şema değişikliği/migration
   gerekmiyor bu adımda.

---

## Madde 3 — Sahte "Şube Bazlı Entegrasyonlar" kartını kaldırın

Doğrulanan kod: `TanimlamalarPage.tsx` → `SirketTanimlariTab` içinde, her şirketin altında
gösterilen "Şube Bazlı Entegrasyonlar" bloğu (`SubeBlok`/`SubeEntegrasyon` bileşenleri, satır
~1476-1543):
- UTS "Aktif" rozeti gerçek veriden gelmiyor, kodda sabit yazılı (`sirketId === 'ng' &&
  sube in ['GVN2','GVN10']`) — gerçek `UtsSube` tablosunu hiç sorgulamıyor.
- "Düzenle"/"Ayarla" butonlarının `onClick` handler'ı yok, tıklanınca hiçbir şey olmuyor
  (WhatsApp/Worldline kartlarında da aynı durum).

**Yapılacak:** Bu kartı (PDKS/UTS token/WhatsApp/Worldline şube alt bloğu) `SirketTanimlariTab`'dan
tamamen kaldırın. Yerine, isterseniz kısa bir bilgi notu ekleyin: "UTS ayarları için → UTS
Yönetimi", "PDKS mekan ID için → Şubeler sekmesi". WhatsApp/Worldline zaten hiç bağlı değil,
gerçek entegrasyon eklenene kadar bu ekranda hiç görünmesinler.

---

## Sonuç hedefi (Görkem'in istediği "tek yerden giriş")

Düzeltme sonrası her entegrasyon bilgisi tek bir ekrandan girilecek:

| Bilgi | Doğru/tek ekran |
|---|---|
| Uyumsoft kullanıcı adı/şifre | Tanımlamalar → Şirket Tanımları (şirket bazlı) |
| UTS Kurum No / Token / Ortam | UTS Yönetimi → Şube Tanımlamaları |
| Odoo location id, PDKS place id, VKN, adres | Tanımlamalar → Şubeler |
| Personel-PDKS/Odoo/POS eşleştirmesi | İK & Prim → Personeller |
| WhatsApp / Worldline | Henüz yok — gerçek entegrasyon eklenene kadar hiçbir yerde görünmesin |

## Madde 4 — ACİL: Token Test Et bug'ı gerçek UTS gönderimini sessizce kapatıyor

Bu, "isteğe bağlı iyileştirme" değil, prodüksiyon hatası — önce bunu düzeltin.

Doğrulanan kod:
- `backend/src/modules/admin/admin.controller.ts` satır ~6224-6252 (`POST /uts/token-test/:branchId`):
  UTS'nin `firmaSorgula` ucuna gövde olarak `{ VRG: '1' }` gönderiyor — VKN yerine sabit `'1'`
  string'i. UTS bunu "boyut 10-11 arası olmalı" diye reddediyor, token gerçekten geçerli olsa bile
  bu uç her zaman hata dönüyor.
- Bu hata dönünce aynı route `prisma.utsSube.update({ aktif: false })` çalıştırıyor (satır
  ~6246-6249).
- `backend/src/modules/uts/uts.service.ts` satır ~200-207: gerçek UTS bildirim gönderim akışı
  `if (!utsSube?.token || !utsSube.aktif)` kontrolü yapıyor — `aktif=false` ise bildirimi hiç
  göndermiyor, `hata: 'Bu şube için UTS token tanımlı değil'` döndürüyor (mesaj da yanıltıcı,
  token aslında tanımlı, sadece `aktif` bayrağı yanlışlıkla düşürülmüş oluyor).

**Sonuç:** UTS Yönetimi ekranında herhangi biri herhangi bir şube için "Token Test Et"e bastığında
— token gerçekten geçerli olsa bile — o şubenin gerçek UTS VERME/ALMA bildirimleri o andan
itibaren sessizce durur. Şu an ANADEPO/GVN3/GVN1/GVN2'nin DB'de `aktif=true` olması şans, ileride
biri test butonuna basarsa tekrar bozulur.

**Yapılacak:**
1. `token-test` route'unda `VRG: '1'` yerine ilgili şubenin gerçek VKN'sini gönderin (`Branch.vkn`
   alanından, veya UtsSube üzerinden şubenin bağlı olduğu şirketin VKN'si — hangisi doğruysa, Adım
   1b'deki manuel testte kullanılan VKN mantığıyla aynı olsun).
2. Bu düzeltmeden sonra ANADEPO, GVN1, GVN2, GVN3 için Token Test Et'i tekrar deneyin, artık
   "Token geçerli" dönmeli, `aktif` yanlışlıkla false'a düşmemeli.
3. GVN5/6/8/9 için düzeltilmiş test doğru şekilde geçersiz sonucu vermeye devam etmeli (bunlar
   gerçekten geçersiz, VKN sorunu değil) — teyit edin.

Bu düzeltme sonrası GVN5 (yeni token) ve GVN6/8/9 (gerçek kurum no + geçerli token) için Görkem
UTS portalından yeni bilgi girecek — bu kısım kod değil, dış işlem.

## Kabul kriteri

- Madde 1 raporu bana gelmeden hiçbir `ortam` değeri değiştirilmemiş olmalı.
- Madde 2-3 sonrası Tanımlamalar → Şirket Tanımları ve Şubeler sekmelerinde Uyumsoft'la ilgili
  tek görünen yer "Şirket Tanımları"ndaki gerçek kart olmalı, başka hiçbir yerde Uyumsoft
  kullanıcı adı/şifre alanı ya da yanıltıcı rozet kalmamalı.
- Bitince kısa ekran görüntüsüyle raporlayın, ben kontrol edip kapatacağım.
