# Lot/Barkod adımında UTS kodunu "Belge Numarası" ile otomatik çekme (opsiyonel)

## Durum

"Ürün Girişi" → "4. Lot/Barkod" ekranında (`DepoPage.tsx`, `LotSatiri.utsKodu` alanı, input satır
~4649-4656) her satırda UTS Kodu **elle** giriliyor. Görkem, bunun yanına bir **seçenek** olarak
"Belge Numarası" girilince TİTCK UTS'den ilgili ürün/parti bilgisini otomatik çekip bu alanı
doldurabilme özelliği istiyor. **Mevcut elle giriş şekli aynen kalmalı** — bu tamamen ek/opsiyonel
bir yol olacak. Ayrıca: NG (Nejla Gümüşkesen Optik) üzerinden alım yapılırken, ürünün hangi UTS
şubesinde/kurumunda kayıtlı olduğuna bakılarak oradan sorgulama yapılabilmesi isteniyor.

## Kritik ön uyarı — önce bunu doğrulayın, tahmin etmeyin

Kod tabanını inceledim: şu an backend'de (`backend/src/modules/uts/uts.service.ts`) TİTCK UTS'ye
**sadece bildirim GÖNDERME** (ALMA/VERME/TÜKETİCİYE VERME vb., `.../bildirim/.../ekle` uçları) ve
tek bir "firma sorgula" (VKN doğrulama, `testUtsSubeToken`) çağrısı var. **Belge numarasıyla ya da
başka bir kriterle ürün/parti verisi SORGULAYAN (okuma) hiçbir mevcut kod yok.** Yani bu istek
büyük ihtimalle sıfırdan yeni bir TİTCK UTS entegrasyon noktası gerektiriyor.

**Bu yüzden önce şunu netleştirin, kafanıza göre bir endpoint uydurmayın:**

1. TİTCK UTS web servisinin (mevcut entegrasyonda kullanılan WSDL/REST dokümantasyonu, base URL
   `uts.service.ts` satır ~115-122 civarında görülüyor) gerçekten **belge numarası ile ürün/parti
   sorgulama** desteği olan bir ucu var mı? (Örn. "belgeSorgula", "partiSorgula", "urunSorgula" gibi
   bir REST/SOAP action.) Varsa tam endpoint adını, istek/cevap alanlarını raporlayın.
2. Yoksa, TİTCK UTS'nin GTİN/barkod ile veya başka bir kriterle sorgulama imkânı var mı? Görkem'in
   asıl ihtiyacı "elle UTS kodu yazmak yerine otomatik doldurmak" — belge no şart değil, mevcut
   API neyi destekliyorsa onu önerin.
3. Hiçbir sorgulama ucu yoksa, bunu açıkça bana raporlayın — özelliği "yapamıyoruz" diye kapatmak
   yerine, alternatif olarak son N bildirimden (`UtsBildirim` tablosu, zaten DB'de duruyor) veya
   Odoo lot geçmişinden otomatik tamamlama gibi bir workaround önerebilirsiniz, ama TİTCK'ye
   gerçekte olmayan bir API çağrısı YAZMAYIN.

## Eğer bir sorgulama ucu bulunursa — istenen özellik

1. Her lot satırının UTS Kodu input'unun yanına (veya satırların üstünde toplu bir alan olarak)
   **opsiyonel** bir "Belge No ile UTS'den Çek" butonu/mini modal ekleyin. Kullanıcı belge
   numarasını girer, buton tetiklenir, backend'e yeni bir endpoint (örn.
   `GET /admin/uts/belge-sorgula?belgeNo=...`) istek atılır, dönen veri `lotGuncelle(l.id,
   'utsKodu', deger)` ile mevcut alana yazılır — state alanı adı ve güncelleme mekanizması
   **değişmeyecek**, sadece dolduran kaynak farklı olacak.
2. **Hangi UTS şubesinden sorgulanacağı** NG üzerinden alım yapılıyorsa otomatik belirlenmeli:
   mevcut `UtsDisFirmaLokasyon` / `UtsSube` yapısını kullanın (`uts-kurum.service.ts`,
   `getUtsKurumNo(subeKodu)`) — hangi şirket/şube altında ürün girişi yapılıyorsa (frontend'de
   zaten seçili `sirketId`/`subeKodu`), o şubenin UTS kurum no/token'ıyla sorgulayın. Birden
   fazla UTS lokasyonu varsa `varsayilan` işaretli olanı kullanın, gerekirse kullanıcıya seçim
   sunun.
3. Bulunamayan/hata dönen sorgularda sessizce boş bırakın veya küçük bir hata mesajı gösterin —
   elle girişi engellemeyin, kullanıcı isterse yine kendisi yazabilsin.
4. Bu özellik TAMAMEN opsiyonel bir ek — mevcut manuel UTS Kodu girişi, kaydetme akışı
   (`/admin/urun-giris`), ve Odoo'ya `utsKodu` gönderimi (satır ~2493) hiçbir şekilde
   değişmemeli.

## Test

1. Mevcut elle UTS kodu girişinin hiçbir şekilde bozulmadığını gösterin (regresyon testi).
2. Gerçek bir belge numarasıyla (varsa test ortamı) sorgulama yapıp UTS Kodu alanının doğru
   dolduğunu gösterin.
3. NG üzerinden yapılan bir alımda doğru UTS şubesinin otomatik seçildiğini/kullanıldığını
   gösterin.

## Rapor formatı

Önce teşhis sonucu (TİTCK UTS'de gerçekten böyle bir sorgulama ucu var mı, varsa tam adı/alanları)
+ (bulunduysa) değişen dosya/satırlar + ekran görüntüsü. Bulunamadıysa net bir "bu API'de yok"
raporu ve önerilen alternatif.
