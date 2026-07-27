# Garanti & İade — "+ Yeni Kayıt" butonu çalışmıyor

## Durum

Görkem'in ekibinden Firat Yücel, "Garanti & İade" sayfasında "+ Yeni Kayıt" butonuna bastığında
hiçbir şey olmadığını bildirdi.

## Kod tarafı — kök neden

`GarantiPage.tsx` satır 40: `const [sekme, setSekme] = useState<'pos' | 'depo'>('pos')` — sayfa
**varsayılan olarak zaten "pos" (Yeni Kayıt) sekmesinde açılıyor**. "+ Yeni Kayıt" butonu (satır
208-211) sadece `setSekme('pos')` çağırıyor — sekme zaten "pos" ise React aynı state'e set
edildiği için hiçbir re-render/görünür değişiklik olmuyor.

Asıl sorun bu değil, daha önemlisi: bu buton **POS akışının state'ini hiç sıfırlamıyor**
(`posStep`, `musteriQ`, `musteriSonuc`, `seciliMusteri`, `musteriSatislar`, `seciliSatis`,
`seciliKalem`, `form`, `yeniKayit` — satır 51-59). Yani bir kullanıcı bir garanti/iade kaydını
tamamladıktan sonra (`kaydet()` çalışıp `posStep` 5'e geçtikten sonra, satır 112-135), "+ Yeni
Kayıt"a tekrar basarak **ikinci bir kayıt başlatamaz** — buton `sekme`'yi zaten "pos" olan
değerine tekrar set etmeye çalışır (no-op), `posStep` 5'te takılı kalır. Sayfayı yenilemeden yeni
kayıt açılamaz.

## İstenen

1. "+ Yeni Kayıt" butonunun `onClick`'ini, sadece `setSekme('pos')` değil, **tüm POS akış
   state'ini sıfırlayan** bir fonksiyona bağlayın: `posStep→1, musteriQ→'', musteriSonuc→[],
   seciliMusteri→null, musteriSatislar→[], seciliSatis→null, seciliKalem→null,
   form→{type:'CUSTOMER_WARRANTY', expectedOutcome:'UNKNOWN', problemDesc:''}, yeniKayit→null`.
2. Bu, kullanıcı "depo" sekmesindeyken VEYA "pos" sekmesinde bir kayıt tamamlamışken her iki
   durumda da doğru şekilde temiz bir "Adım 1 — Müşteri Ara" ekranına dönmeli.

## Test

1. Bir garanti kaydı baştan sona tamamlayın (posStep 5'e ulaşın).
2. "+ Yeni Kayıt"a basın — "Adım 1 — Müşteri Ara" ekranının temiz state'le (boş arama, seçili
   müşteri yok) geldiğini gösterin.
3. "Operasyon — İşlem" sekmesindeyken de "+ Yeni Kayıt"a basınca aynı temiz ekrana geçtiğini
   gösterin.

## Rapor formatı

Değişen dosya/satırlar + öncesi/sonrası kısa ekran görüntüsü/GIF.
