# "5.5 Temin" adımında transfer başarısız oluyor ama gerçek hata gösterilmiyor — "Transfer başarısız" ile gizleniyor

## Durum

Yetki hatası (`INSUFFICIENT_PERMISSION`) düzeltmesinden sonra STORE_MANAGER artık "5.5 Temin"
adımında transfer talebi göndermeyi deneyebiliyor, AMA şimdi ekranda sadece "❌ Transfer başarısız"
yazıyor — gerçek sebep hiç görünmüyor. Bu, daha önce `YeniTransfer.tsx`'te düzelttiğimiz mesaj
gizleme bug'ıyla AYNI desende ama TAMAMEN FARKLI bir dosyada/koddaki yeni bir örneği.

## Kök neden (kodda doğrulandı)

`backend/src/modules/transfer/transfer-core.service.ts`, `baslatTransfer()` — aynı şirket içi
("sirket-ici") transfer başarısız olduğunda gerçek sebebi `message` alanına yazıyor:
```ts
// satır 407-416 — lokasyon bulunamadı
return {
  success: false, durum: 'basarisiz', transferRef, tip: 'sirket-ici',
  kabulPickingId: 0,
  message: 'Kaynak veya hedef lokasyon bulunamadı.',
};
// satır 420-430 — lot seçilmedi vb.
return {
  success: false, durum: 'basarisiz', transferRef,
  tip: kaynakSirketId === hedefSirketId ? 'sirket-ici' : 'sirketler-arasi',
  kabulPickingId: 0,
  message: lotHata,   // gerçek, kullanıcıya gösterilebilir hata metni
};
```
Bu nesnelerde `detay` alanı hiç yok (undefined).

`backend/src/modules/admin/transfer-olustur.service.ts`, `olusturTransfer()` — bu sonucu işlerken
İKİ farklı dala ayırıyor:
```ts
if (sonuc.tip === 'sirket-ici') {
  olusturulanlar.push({
    ...(sonuc.detay as object),   // undefined, hiçbir şey eklemiyor
    tip: 'sirket-ici',
    durum: sonuc.durum,
    transferRef: sonuc.transferRef,
    pickingId: sonuc.kabulPickingId,
    pickingName: sonuc.pickingName,
    kabulPickingId: sonuc.kabulPickingId,
    kalemSayisi: grup.length,
    // ← BURADA "hata" ALANI YOK — sonuc.message HİÇ KULLANILMIYOR
  });
} else {
  olusturulanlar.push({
    ...(sonuc.detay as object),
    tip: 'sirketler-arasi',
    // ...
    hata: sonuc.success ? undefined : sonuc.message,   // ← "sirketler-arasi" dalında BU VAR
  });
}
```
`sirket-ici` (aynı şirket içi) dalında `hata: sonuc.success ? undefined : sonuc.message` satırı
EKSİK — sadece `sirketler-arasi` dalında var. Sonuç: aynı şirket içi transfer başarısız olduğunda
`sonuc.message`'daki gerçek sebep (`"Kaynak veya hedef lokasyon bulunamadı."`, lot hatası metni vb.)
sessizce çöp oluyor.

Bu yüzden `olusturTransfer()`'ın döndürdüğü nihai `message` (satır 176-183) şuraya düşüyor:
```ts
message = basarisiz.map((t) => t.hata ?? t.manuelMudahaleMesaji ?? 'Transfer başarısız').join('; ');
```
`t.hata` undefined olduğu için hep `'Transfer başarısız'` sabit metnine düşüyor — frontend'de
(`StokTeminStep.tsx` satır 270) görünen de birebir bu.

## İstenen

1. `transfer-olustur.service.ts`'teki `sirket-ici` dalına (satır ~138-148), `sirketler-arasi`
   dalındakiyle birebir aynı satırı ekleyin:
   ```ts
   hata: sonuc.success ? undefined : sonuc.message,
   ```
2. Bu iki dalın olabildiğince aynı şekilde davranmasını sağlamak için, mümkünse ortak bir yardımcı
   fonksiyona çıkarmayı değerlendirin (ör. `mapSonucToRow(sonuc, grup)`) — ileride aynı hata tekrar
   girmesin diye. Zorunlu değil, süre kısıtlıysa sadece 1. maddeyi uygulayın.
3. Bu değişiklikten sonra STORE_MANAGER (İlker Yolcu) ile ekrandaki gerçek hatanın ne olduğunu görün
   — muhtemelen "Kaynak veya hedef lokasyon bulunamadı" ya da lot/UTS ile ilgili bir mesaj çıkacak.
   **Gerçek mesaj ortaya çıktıktan sonra o mesajın kendisini de raporda paylaşın** — altta yatan asıl
   sorunu (neden transfer gerçekten başarısız oluyor) ayrıca teşhis etmemiz gerekebilir, bu talimat
   sadece mesajın GÖRÜNÜR olmasını sağlıyor, transferin neden başarısız olduğunu değil.

## Test

1. Aynı senaryoyu (İlker Yolcu, STORE_MANAGER, ANADEPO'dan yerel stoğu olmayan bir ürün için "5.5
   Temin") tekrar deneyip artık ekranda `'Transfer başarısız'` yerine gerçek sebebi gösteren bir
   mesaj çıktığını gösterin (ekran görüntüsü).
2. Şirketler arası bir transfer senaryosunda (zaten çalışan dal) regresyon olmadığını doğrulayın.

## Rapor formatı

Değişen satır + yeni ortaya çıkan gerçek hata mesajının tam metni (ekran görüntüsü) + eğer mesaj
altta yatan farklı bir soruna işaret ediyorsa (ör. lokasyon eşleşme sorunu, UTS/lot eksikliği) bunu
ayrıca not edin, ben ona göre yeni bir talimat yazacağım.
