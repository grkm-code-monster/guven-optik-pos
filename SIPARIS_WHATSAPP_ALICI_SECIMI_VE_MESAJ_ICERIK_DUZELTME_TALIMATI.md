# Sipariş WhatsApp mesajı — alıcıyı kullanıcı seçsin, mesaj içeriği sadeleşsin

## Durum

`SIPARIS_WHATSAPP_DETAY_GONDER_TALIMATI.md` uygulandı ve doğrulandı ama Görkem iki değişiklik istiyor:

1. Mesaj müşterinin kayıtlı numarasına DEĞİL, kullanıcının WhatsApp'ta seçtiği kişiye gitsin (bu
   mesaj çoğu zaman tedarikçiye/laboratuvara gidecek, müşteriye değil).
2. Mesaj içeriğinden **"Ürün"** ve **"Satış Temsilcisi"** satırları tamamen kalksın, sadece "Firma
   Ürünü" kalsın (zaten değer yoksa boş bırakılıyor, bu davranış korunsun).

## İstenen değişiklikler

`packages/web/src/pages/admin/DepoPage.tsx`:

### 1. `buildSiparisDetayMesaji()` (satır 774-841)

Şu iki bloğu kaldırın:
```ts
if (hasMesajDeger(detay.urunAdi)) lines.push(`Ürün: ${detay.urunAdi}`)   // satır 778 — kaldır
```
```ts
const temsilci = detay.satisTemsilcisi ?? detay.olusturanKullanici       // satır 780
if (hasMesajDeger(temsilci)) lines.push(`Satış Temsilcisi: ${temsilci}`) // satır 781 — ikisini de kaldır
```
`Firma Ürünü` satırı (satır 779) AYNEN kalsın — sonuç sırası: Müşteri → Firma Ürünü → Şube → Tarih →
(varsa Notlar) → Reçete → Ölçümler → Tedarikçi. Beklenen tam örnek çıktı (Görkem'in verdiği):
```
*Sipariş Detayı*
Müşteri: YAPRAK GEZER
Firma Ürünü: ...   ← değer varsa, yoksa bu satır hiç yok
Şube: GVN3
Tarih: 16.07.2026

*Reçete*
Sağ Göz — SPH: 0, CYL: -0.25, AKS: 10, PD: 30
Sol Göz — SPH: 0, CYL: -0.5, AKS: 0, PD: 30

*Ölçümler*
Çerçeve Tipi: NILOR
RPH: 24.00, LPH: 24.00, Koridor: 9.00
Sağ Çap: 70.00, Sol Çap: 70.00
Vertex: 12.00
Pantoskopik: 5.00
Çerçeve Bombesi: 4.00
```

### 2. WhatsApp butonu `onClick` (satır 1052-1065)

Şu anki hâli müşteri telefonu varsa doğrudan ona yönlendiriyor:
```ts
onClick={() => {
  const msg = buildSiparisDetayMesaji(detayPopup)
  const numara = normalizeWaPhone(detayPopup.musteriTelefon)
  const url = numara
    ? `https://wa.me/${numara}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`
  window.open(url)
}}
```
Bunu HER ZAMAN numarasız linke (kişi seçim ekranı) çevirin:
```ts
onClick={() => {
  const msg = buildSiparisDetayMesaji(detayPopup)
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`)
}}
```
`normalizeWaPhone()` fonksiyonunu koddan tamamen silmeyin gerekmiyor ama artık bu buton için
kullanılmıyor — başka bir yerde kullanılmıyorsa (grep ile kontrol edin) ölü kod olarak bırakabilir
ya da temizleyebilirsiniz, sizin tercihiniz.

## Test

1. Reçeteli bir sipariş için WhatsApp'a basınca artık HER ZAMAN kişi seçim ekranının açıldığını
   (müşteri numarasına otomatik gitmediğini) gösterin — müşterinin telefonu kayıtlı olsa bile.
2. Üretilen mesajda "Ürün" ve "Satış Temsilcisi" satırlarının hiç yer almadığını, "Firma Ürünü"
   satırının (değer varsa) yer aldığını gösterin.
3. Firma Ürünü boşsa o satırın da mesajda hiç görünmediğini doğrulayın (mevcut `hasMesajDeger`
   mantığı zaten bunu sağlıyor, regresyon olmadığını teyit edin yeterli).

## Rapor formatı

Değişen satırlar + gerçek üretilen mesaj örneği (Görkem'in verdiği formatla birebir karşılaştırın) +
ekran görüntüsü.
