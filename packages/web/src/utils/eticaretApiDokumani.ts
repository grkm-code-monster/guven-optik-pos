/**
 * E-Ticaret entegrasyonu için partner'a (e-ticaret sitesini yapan geliştiriciye)
 * verilecek API dökümanı. Tanımlamalar > E-Ticaret sekmesinden indirilebilir —
 * böylece her partner değişiminde/tekrar sorulduğunda elle hazırlamaya gerek kalmaz.
 */
export const ETICARET_API_DOKUMANI = `# Güven Optik — E-Ticaret API Entegrasyon Dökümanı

Bu döküman, Güven Optik POS sistemi ile e-ticaret sitesi arasındaki entegrasyonu tanımlar. İki yönlü bir entegrasyondur:

1. **Biz size veriyoruz:** Ürün/stok bilgisi API'si (sitenizin ürünleri göstermesi için).
2. **Siz bize veriyorsunuz:** Sipariş bilgisi API'si (bizim siparişleri çekmemiz için) + isteğe bağlı bir durum güncelleme adresi (kargo durumunu iletmemiz için).

Kapsam notu: Sadece **güneş gözlüğü** ve **kontakt lens** ürünleri bu entegrasyona dahildir. Numaralı gözlük camı (reçeteli) bu kapsamda değildir ve API'lerde görünmez.

---

## 1. Bize ait API — Ürün & Stok (biz size veriyoruz)

**Base URL:** \`https://pos.guvenoptik.net.tr/api/external\`

**Kimlik doğrulama:** Her istekte header olarak API anahtarını gönderin:

\`\`\`
x-api-key: <size verdiğimiz anahtar>
\`\`\`

API anahtarını Yönetim Paneli > Tanımlamalar > E-Ticaret sekmesinden alacağız/yenileyeceğiz.

**Rate limit:** Dakikada 60 istek (API anahtarı bazında).

### 1.1 GET /products — Ürün kataloğu

Query parametreleri:

| Parametre | Zorunlu | Açıklama |
|---|---|---|
| page | Hayır | Sayfa no (varsayılan 1) |
| pageSize | Hayır | Sayfa boyu (varsayılan 100, maksimum 200) |

Örnek cevap:

\`\`\`json
{
  "data": [
    { "barkod": "8680123456789", "ad": "Ray-Ban Aviator RB3025", "kategori": "Güneş Gözlüğü", "fiyat": 4250.00 }
  ],
  "totalCount": 342,
  "page": 1,
  "pageSize": 100
}
\`\`\`

### 1.2 GET /stock — Şube bazlı stok durumu

Query parametreleri:

| Parametre | Zorunlu | Açıklama |
|---|---|---|
| page / pageSize | Hayır | Sayfalama (1.1 ile aynı) |
| barkod | Hayır | Tek bir ürünün stok durumunu sorgulamak için tam barkod eşleşmesi |

Örnek cevap:

\`\`\`json
{
  "data": [
    {
      "barkod": "8680123456789",
      "urunAdi": "Ray-Ban Aviator RB3025",
      "toplamStok": 14,
      "subeler": [
        { "subeKodu": "ANADEPO", "subeAdi": "Ana Depo", "miktar": 8 },
        { "subeKodu": "GVN2", "subeAdi": "Güven Optik GVN2", "miktar": 6 }
      ]
    }
  ],
  "totalCount": 342,
  "page": 1,
  "pageSize": 100
}
\`\`\`

Sitenizde ürün gösterirken \`fiyat\` alanını /products'tan, o an satılabilir stok var mı kontrolünü /stock'un \`toplamStok\` alanından kullanmanızı öneririz. Stok bilgisi anlıktır; siparişi biz aldığımızda kendi tarafımızda ayrıca şube bazlı stok/öncelik kontrolü yapıyoruz.

---

## 2. Sizin bize vereceğiniz API'ler

### 2.1 Sipariş listesi API (zorunlu)

Biz, sisteminize **her 2 dakikada bir** GET isteği atarak yeni siparişleri çekeceğiz. İhtiyacımız olan:

- Bir **URL** (ör. https://sizinsite.com/api/guven-optik/siparisler)
- Bir **token** (biz her istekte hem \`Authorization: Bearer <token>\` hem \`x-api-key: <token>\` header'ı göndereceğiz — hangisini kontrol ederseniz kabul edin)

**Beklenen cevap formatı** (önerimiz; birebir bu olması şart değil, ilk entegrasyonda gerçek formatınıza göre bizim tarafta küçük bir uyarlama yapabiliriz):

\`\`\`json
{
  "orders": [
    {
      "siparisNo": "SITE-10234",
      "musteri": {
        "adSoyad": "Ayşe Yılmaz",
        "telefon": "05XXXXXXXXX",
        "adres": "Örnek Mah. Örnek Sk. No:1",
        "il": "İzmir",
        "ilce": "Bornova"
      },
      "odemeSekli": "online_odeme",
      "kalemler": [
        { "barkod": "8680123456789", "adet": 1 }
      ]
    }
  ]
}
\`\`\`

Önemli noktalar:

- kalemler[].barkod bizim ürün barkodumuzla **birebir aynı** olmalı (1.1/1.2'deki barkod alanı).
- Her siparişi siparisNo ile takip ediyoruz; aynı sipariş tekrar listede görünse bile bizde bir daha işlenmez (yinelenen çağrılar güvenlidir), yani listenizden sipariş silmenize gerek yok — biz zaten bir kez işleyip bir daha dokunmuyoruz.
- Reçeteli gözlük camı siparişi bu API'ye hiç düşmemeli (kapsam dışı).

### 2.2 Durum güncelleme adresi (opsiyonel ama önerilir)

Sipariş durumu değiştikçe (hazırlanıyor / kargoya verildi / stok yok vb.) biz sizin vereceğiniz bir adrese **POST** atacağız, siz de bunu müşteriye yansıtabilirsiniz.

- Bir **URL** verin (ör. https://sizinsite.com/api/guven-optik/durum-guncelle)
- Aynı token'ı kullanacağız (2.1 ile aynı, Authorization: Bearer + x-api-key)

Göndereceğimiz gövde:

\`\`\`json
{
  "siparisNo": "SITE-10234",
  "durum": "kargoya_verildi",
  "kargoTakipNo": "1234567890"
}
\`\`\`

durum şu değerlerden birini alır: hazirlaniyor, kargoya_verildi, stok_yok, hata.

2xx dönerseniz bildirimi aldığınızı varsayarız. 2xx dönmezse bir sonraki 2 dakikalık döngüde tekrar göndeririz.

---

## 3. Bu bilgileri nereye gireceğiz

Siz bize (2.1 ve 2.2'deki) URL + token'ı verdiğinizde, biz bunları **Yönetim Paneli > Tanımlamalar > E-Ticaret** sekmesine gireceğiz. Sistemimiz o andan itibaren otomatik sipariş çekmeye başlar. Test tarafı tamamen sizde — biz kendi tarafımızda test siparişi oluşturmuyoruz, gerçek/test siparişlerinizi çektiğimizde göreceğiz.
`

export function downloadEticaretApiDokumani(): void {
  const blob = new Blob([ETICARET_API_DOKUMANI], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Guven-Optik-Eticaret-API-Dokumani.md'
  a.click()
  URL.revokeObjectURL(url)
}
