# UTS bildirimi 400 hatası veriyor ama gerçek sebep hiç görünmüyor

## Durum

Görkem, UTS Yönetimi → Bildirim sekmesinden elle bir "UTS Verme" bildirimi denedi (UTS'nin kendi
sisteminde kayıtlı ama bizim POS/Odoo stoğumuzda olmayan bir ürünle). TİTCK sunucusu isteği
reddetti ama arayüzde sadece **"Request failed with status code 400"** göründü — bu, TİTCK'in
GERÇEK ret sebebini değil, axios kütüphanesinin ürettiği JENERİK HTTP durum mesajını gösteriyor.
Muhtemelen "UTS'yi hiç gönderemedik" şikayetinin büyük kısmı bu — her hata aynı anlamsız "400"
mesajıyla görünüyor, gerçek sebebi kimse göremiyor.

## Kök neden (kodda doğrulandı)

`backend/src/modules/uts/uts.service.ts` ve `admin.controller.ts`'deki TÜM UTS hata yakalama
noktaları aynı deseni kullanıyor:

```ts
const message = err instanceof Error ? err.message : 'Gönderim hatası';
```

Axios, bir HTTP isteği 2xx dışı bir kodla dönerse `AxiosError` fırlatır ve bu hatanın `.message`
alanı SADECE `"Request failed with status code 400"` gibi jenerik bir metindir. TİTCK'in
GERÇEK ret nedenini (örn. "bu barkod sizin firmanıza kayıtlı değil", "bu ürün UTS'de pasif",
"kurum no eşleşmiyor" gibi) sunucu **`err.response.data`** içinde JSON olarak döndürür — ama
kodumuzun HİÇBİR YERİNDE bu alan okunmuyor, sadece jenerik `err.message` kaydediliyor/gösteriliyor.

Bu deseni şu 3 noktada tespit ettim:

1. `uts.service.ts` satır 220 (`bildirimOlusturVeGonder`'ın catch'i)
2. `admin.controller.ts` satır 6631-6632 (`/uts/bildirim-gonder/:id`)
3. `admin.controller.ts` satır 6661-6662 (`/uts/toplu-gonder`)

`testUtsSubeToken()` (`uts.service.ts` satır 528-534) kısmen daha iyi — en azından HTTP status
kodunu ekliyor (`HTTP ${status}`) ama yine de `err.response.data`'daki asıl JSON gövdesini
göstermiyor.

## İstenen

1. `uts.service.ts`'e paylaşılan bir yardımcı fonksiyon ekleyin:

```ts
export function extractUtsHataDetay(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const bodyText = typeof data === 'string'
      ? data
      : data
        ? JSON.stringify(data)
        : undefined;
    return [
      status ? `HTTP ${status}` : undefined,
      bodyText,
      !bodyText ? err.message : undefined,
    ].filter(Boolean).join(' — ');
  }
  return err instanceof Error ? err.message : 'Bilinmeyen hata';
}
```

2. Yukarıdaki 3 catch noktasını (ve varsa aynı deseni kullanan başka UTS hata yakalama yerlerini —
   grep ile `uts` klasörü ve `admin.controller.ts`'deki `/uts/` route'larının tamamını tarayın) bu
   yeni fonksiyonu kullanacak şekilde güncelleyin: `const message = extractUtsHataDetay(err);`.
3. `testUtsSubeToken()`'daki mevcut `HTTP ${status}` mesajını da aynı yardımcıyı kullanacak şekilde
   sadeleştirin (tutarlılık için), token geçersizliği ayrımını (`isUtsTokenAuthFailure`) BOZMADAN.
4. Bu değişiklik SADECE hata mesajının okunabilirliğini artırıyor — mevcut `durum: 'HATA'` /
   `hataDetay` alanlarına yazılan DEĞER değişiyor, akış/mantık değişmiyor. Regresyon riski düşük
   ama yine de bir başarılı gönderim senaryosunu (mesaj üretilmeyen yol) test edin, hata yolunu
   bozmadığınızı doğrulayın.

## Test

1. Görkem'in az önce denediği SENARYOYU tekrar edin: UTS'de kayıtlı ama Odoo/POS stoğunda olmayan
   bir ürünle "UTS Verme" bildirimi deneyin. Artık ekranda jenerik "Request failed with status
   code 400" DEĞİL, TİTCK'in gövdede döndürdüğü GERÇEK hata metnini görün — bu metni raporda
   AYNEN paylaşın (bu, hem bu talimatın doğrulaması hem de UTS'nin asıl neden reddettiğini
   anlamamız için kritik).
2. Geçerli/başarılı bir bildirim göndererek (token'ı "Hazır" olan bir şubeyle, gerçek stokta olan
   bir ürünle) normal akışın bozulmadığını doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + yukarıdaki test 1'in sonucunda görünen TAM hata metni (TİTCK'in gerçek
ret sebebi) + test 2'nin başarılı sonucu.
