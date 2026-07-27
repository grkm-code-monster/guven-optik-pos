# Özel Sipariş Detayı — "💬 WhatsApp" butonu boş, ürün/reçete detayını mesaj olarak göndersin

## Durum

`packages/web/src/pages/admin/DepoPage.tsx`, "Sipariş Detayı" popup'ında (satır 918-951) dört buton
var: PDF (çalışıyor), WhatsApp, E-posta, API. **WhatsApp butonunun (satır 948) hiç `onClick`'i yok —
tamamen ölü, hiçbir şey yapmıyor.** Görkem, `IKPage.tsx`'teki (satır 1334-1352) "WhatsApp ile
Gönder" butonu gibi çalışmasını istiyor — AMA link göndermek yerine, siparişin tüm detay tablosunu
(müşteri, ürün, reçete, ölçümler) okunaklı bir metin olarak WhatsApp mesajına koysun.

## Referans desen (kodda doğrulandı, aynen kopyalanabilir)

`IKPage.tsx` satır 1334-1352:
```ts
onClick={() => {
  const link = `${window.location.origin}/belge-yukle/${p.id}`
  const msg = `Merhaba ${p.ad}, belge yükleme linkiniz: ${link}`
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`)
}}
```
Bu, numarasız `wa.me` linki açıyor (kullanıcı WhatsApp'ta kişi seçiyor). Bizim durumda
`detayPopup.musteriTelefon` zaten elimizde (satır 962'de zaten gösteriliyor) — doğrudan o numaraya
yönlendirmek daha iyi bir deneyim olur: `https://wa.me/<numara>?text=...`.

## detayPopup'ta mevcut alanlar (kodda doğrulandı, satır 955-1057)

- Genel: `musteriAdi`, `musteriTelefon`, `urunAdi`, `firmaUrunu`, `satisTemsilcisi`, `subeAdi`,
  `createdAt`, `notlar`
- Reçete (sadece `tip === 'RECETELI'` ise): `sagSph/sagCyl/sagAks/sagAdd/sagPd`,
  `solSph/solCyl/solAks/solAdd/solPd`, `camTipi`, `camIndeksi`, `kaplama`, `cerceveBilgisi`
- Ölçümler (`olcumBilgisi` dizisi varsa): `frameType`, `rph`, `lph`, `corridor`, `rightDia`,
  `leftDia`, `vertex`, `pantoscopic`, `frameBow`, `engraving`, prizma alanları

## İstenen

1. `DepoPage.tsx` içine bir yardımcı fonksiyon ekleyin, ör. `buildSiparisDetayMesaji(detayPopup)`,
   yukarıdaki alanları düz metin olarak biçimlendirsin (WhatsApp düz metin gösterir, `*kalın*` gibi
   basit WhatsApp biçimlendirmesi kullanılabilir). Örnek format:
   ```
   *Sipariş Detayı*
   Müşteri: Yaprak Gezer
   Ürün: PRO %40 İnceltme Beyaz
   Şube: GVN3
   Tarih: 16.07.2026

   *Reçete*
   Sağ Göz — SPH: 0, CYL: -0.25, AKS: 10, PD: 30
   Sol Göz — SPH: 0, CYL: -0.5, AKS: 0, PD: 30

   *Ölçümler*
   Çerçeve Tipi: NILOR
   RPH: 24.00, LPH: 24.00, Koridor: 9.00
   Sağ Çap: 70.00, Sol Çap: 70.00
   ```
   Sadece dolu olan alanları yazın (boş/`—` olanları atlayın) — mevcut popup'taki koşullu render
   mantığıyla (satır 994, 1015, 1027 civarındaki `&&` kontrolleri) aynı deseni kullanın.
2. Satır 948'deki butona `onClick` ekleyin:
   ```ts
   onClick={() => {
     const msg = buildSiparisDetayMesaji(detayPopup)
     const numara = normalizeWaPhone(detayPopup.musteriTelefon)  // bkz. madde 3
     const url = numara
       ? `https://wa.me/${numara}?text=${encodeURIComponent(msg)}`
       : `https://wa.me/?text=${encodeURIComponent(msg)}`
     window.open(url)
   }}
   ```
3. Telefon numarasını `wa.me` formatına çeviren küçük bir yardımcı ekleyin
   (`normalizeWaPhone(raw?: string | null): string | null`) — Türkiye numaraları genelde
   `05XX...` veya `+905XX...` ya da `5XX...` olarak kayıtlı olabilir; hepsini `90XXXXXXXXXX`
   (ülke kodu + boşluksuz 10 hane, başında `+` yok) formatına normalize edin. Numara yoksa/geçersizse
   `null` döndürün, o durumda numarasız link açılsın (madde 2'deki fallback).
4. Bu buton görsel olarak zaten hazır (stil satır 948'de var) — sadece `onClick` ve mesaj/numara
   üretimini ekleyin, stille oynamayın.

## Test

1. Reçeteli bir sipariş için WhatsApp'a bastığınızda, telefonunuzda/WhatsApp Web'de doğru numarayla
   (varsa) sohbet açıldığını ve mesaj kutusunda yukarıdaki gibi biçimlendirilmiş, tüm dolu alanları
   içeren bir metnin hazır geldiğini gösterin (ekran görüntüsü).
2. Reçetesiz (`tip !== 'RECETELI'`) bir sipariş için reçete bölümünün mesajda hiç yer almadığını
   doğrulayın.
3. Müşteri telefonu kayıtlı olmayan bir sipariş için numarasız linkin (kişi seçim ekranı) açıldığını
   doğrulayın, hata vermediğini gösterin.

## Rapor formatı

Değişen dosya/satırlar + örnek üretilen mesaj metni (bir dolu, bir eksik veri senaryosu) + ekran
görüntüsü.
