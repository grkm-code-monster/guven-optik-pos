# WhatsApp mesajı — "Firma Ürünü" bazen eksik gidiyor + her tıklamada yeni sekme açılıyor

## Durum

Görkem test etti: "Firma Ürünü" alanına yazdı ama gönderilen WhatsApp mesajında bu satır hiç
görünmedi. Ayrıca WhatsApp zaten açıkken bile her "💬 WhatsApp" tıklamasında yeni bir sekme/pencere
açılıyor, aynı sekmeye gitmiyor.

## Kök neden 1 — Firma Ürünü kaybı (kodda doğrulandı)

`packages/web/src/pages/admin/DepoPage.tsx`:
- "Firma Ürünü" input'u (satır 1066-1074) yazarken değeri sadece `firmaUrunuDraft` state'ine
  yazıyor (satır 1069, `onChange`). `detayPopup.firmaUrunu`'ya ve backend'e kaydetme işlemi SADECE
  input **blur** olduğunda (satır 1070-1074, `onBlur`) gerçekleşiyor.
- WhatsApp butonu (satır 1038-1047) mesajı `buildSiparisDetayMesaji(detayPopup)` ile üretiyor —
  DOĞRUDAN `detayPopup.firmaUrunu`'yu okuyor, `firmaUrunuDraft`'a hiç bakmıyor.
- Kullanıcı Firma Ürünü'ne yazıp inputtan çıkmadan (blur olmadan) direkt WhatsApp'a basarsa,
  `detayPopup.firmaUrunu` hâlâ eski (boş) değerde oluyor — mesajda satır hiç görünmüyor. Tam olarak
  bildirilen senaryo bu.

### Düzeltme

WhatsApp butonunun `onClick`'inde mesajı üretmeden önce draft değeri varsa onu `detayPopup`'a
eklemiş gibi kullanın:
```ts
onClick={() => {
  const draft = firmaUrunuDraft[detayPopup.id]
  const detayIleDraft = draft !== undefined ? { ...detayPopup, firmaUrunu: draft } : detayPopup
  const msg = buildSiparisDetayMesaji(detayIleDraft)
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, 'guven-optik-whatsapp')
}}
```
(İkinci satırdaki `window.open` değişikliği aşağıdaki 2. kök nedenle ilgili, birlikte uygulayın.)

Daha sağlam bir alternatif: PDF/WhatsApp/E-posta butonlarının hepsi aynı "önce kaydet, sonra oku"
sorununa açık olabilir — isterseniz genel çözüm olarak butonlara basılmadan önce açık draft varsa
otomatik blur/kaydet tetikleyen ortak bir `flushFirmaUrunuDraft()` fonksiyonu da ekleyebilirsiniz,
ama minimum çözüm yukarıdaki gibi anlık birleştirme yeterli.

## Kök neden 2 — her tıklamada yeni sekme (kodda doğrulandı)

Satır 1042: `window.open(`https://wa.me/?text=...`)` — ikinci parametre (pencere/sekme adı) hiç
verilmiyor. Tarayıcılar isimsiz `window.open()` çağrısını her seferinde YENİ bir sekme/pencere olarak
açar. Bu yüzden WhatsApp zaten açık bir sekmede olsa bile her tıklama yeni bir `api.whatsapp.com`
sekmesi/penceresi açıyor.

### Düzeltme

`window.open()`'a sabit bir pencere adı verin, böylece tarayıcı aynı isimle açılmış varsa onu yeniden
kullanır, yeni sekme açmaz:
```ts
window.open(url, 'guven-optik-whatsapp')
```
Bu değişikliği SADECE bu buton için değil, aynı desende `window.open` kullanan diğer WhatsApp
linklerinde de (ör. `IKPage.tsx` satır ~1339) uygulayın — grep ile `window.open(` + `wa.me` aramasıyla
tüm kullanım noktalarını bulup aynı ikinci parametreyi ekleyin (her biri kendi sabit ismini kullanabilir,
karışmasın istiyorsanız, ama aynı isim de sorun değil — hepsi WhatsApp'a gidiyor).

## Test

1. Sipariş Detayı'nda "Firma Ürünü" alanına bir değer yazın, input'tan çıkmadan (blur olmadan)
   direkt "💬 WhatsApp"a basın — mesajda "Firma Ürünü" satırının artık doğru değerle göründüğünü
   gösterin.
2. Aynı popup'ta WhatsApp butonuna art arda 2-3 kez basın — her seferinde yeni sekme AÇILMADIĞINI,
   aynı sekmenin yeniden kullanıldığını gösterin (ekran görüntüsü/GIF yeterli).
3. IKPage'deki WhatsApp linkinde de aynı tekrar-sekme sorununun düzeldiğini doğrulayın.

## Rapor formatı

Değişen satırlar + önce/sonra test sonucu (Firma Ürünü'nün artık gittiği bir mesaj örneği + sekme
davranışının ekran görüntüsü).
