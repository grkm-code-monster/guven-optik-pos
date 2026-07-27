# "Ürün Girişi" sihirbazı — uzun süre uzak kalınca ilerleme tamamen kayboluyor

## Durum

Görkem, Depo Yönetimi → "Ürün Girişi" akışında (Giriş Tipi → Fatura → Ürün Satırları → Lot/Barkod
→ Onay, 5 adım) bir süre bilgisayar başından ayrıldığında (ekran koruyucu devreye giriyor), geri
döndüğünde tüm ilerlemenin sıfırlandığını bildiriyor. Yarıda kalmış bir işlemi devam ettirebileceği
bir "taslaklar" listesi de yok. İstediği: bu ekran **her an kayıt altında olmalı**, uzak
kalınsa bile kaldığı yerden devam edilebilmeli.

## Kod tarafı — iki olası/birlikte çalışan kök neden bulundu

1. **Sıfır draft/otomatik kayıt mekanizması:** `DepoPage.tsx`'te "Ürün Girişi" sihirbazının tüm
   state'i (`satirlar`, `lotlar`, seçilen fatura, adım no vb.) sadece React `useState` içinde
   yaşıyor — kodda bu ekran için `localStorage`/`sessionStorage` veya backend'e ara kayıt
   (taslak) atan **hiçbir mekanizma yok**. Yani component her ne sebeple yeniden mount olursa
   (sayfa yenileme, sekme kapanıp açılma, aşağıdaki #2) o ana kadarki tüm giriş kayıpsız gider.

2. **401 → sessiz, uyarısız tam sayfa yeniden yükleme:** `packages/web/src/api/client.ts`
   (satır 14-22) — herhangi bir API isteği 401 dönerse:
   ```ts
   if (err.response?.status === 401) {
     useAuthStore.getState().logout()
     window.location.href = '/login'   // ← TAM SAYFA YENİDEN YÜKLEME, onay yok
   }
   ```
   `window.location.href` bir React Router yönlendirmesi değil, **tarayıcının tüm JS uygulamasını
   sıfırdan yeniden yüklemesine** sebep olur — hiçbir "kaydedilmemiş değişiklikleriniz var, emin
   misiniz" uyarısı olmadan. JWT token ömrü `auth.service.ts`'te **8 saat** (`expiresIn: '8h'`) —
   kısa bir ekran koruyucu molası bunu tek başına açıklamayabilir, ama Görkem'in tarif ettiği "bir
   süreliğine ayrılma" daha uzun sürdüyse veya arada token/oturum geçersiz kılan başka bir olay
   (sunucu yeniden başlatma, farklı bir cihazdan giriş vb.) olduysa, dönüşte yapılan ilk API
   çağrısı 401 alır ve **anında, uyarısız** bu sıfırlamayı tetikler.

## İstenen

**Önce teşhis, sonra düzeltme — hangisi/hangileri gerçekleşiyor netleştirin:**

1. Görkem'in tarif ettiği senaryoyu (bir süre işlem yapmadan bekleme) taklit edin: JWT süresi
   dolduktan sonra (ya da backend'i yeniden başlatıp) "Ürün Girişi" ekranında bir API çağrısı
   tetikleyin (örn. adım değiştirme, kaydet butonuna basma) — gerçekten 401 alıp `window.location
   .href='/login'` ile sıfırlandığını doğrulayın. Console/network log ile kanıtlayın.
2. Bunun dışında (401 olmadan) state'in kaybolduğu başka bir senaryo var mı (örn. tarayıcı sekmesi
   arka planda uzun süre kalınca OS/tarayıcı tarafından askıya alınıp yeniden yüklenmesi) — bunu da
   kontrol edin, mümkünse.

**Düzeltme — iki katmanlı çözüm önerisi, ikisini de uygulayın:**

1. **Otomatik taslak kaydı (asıl istenen "her an kayıt altında olmalı"):** "Ürün Girişi"
   sihirbazının state'ini (hangi fatura/satırlar/lotlar adımında olunduğu dahil) her önemli
   değişiklikte `localStorage`'a debounce'lu şekilde yazın. Sayfa/component yeniden mount
   olduğunda, aynı fatura/girişTipi için bir taslak varsa kullanıcıya **"Yarım kalmış bir ürün
   girişiniz var, devam etmek ister misiniz?"** diye sorup kaldığı adımdan devam ettirin.
   Backend'e kaydedilip onaylanan (5. adım tamamlanan) girişlerde taslağı temizleyin.
2. **"Yarıda kalmış işlemler" listesi:** Depo Yönetimi → Ürün Girişi ana ekranına, kaydedilmemiş
   (localStorage'daki) veya backend'de "taslak" durumunda kalmış girişleri listeleyen bir bölüm
   ekleyin — Görkem'in özellikle istediği bu. Birden fazla taslak biriktiyse hepsini görüp
   istediğinden devam edebilmeli veya silebilmeli.
3. **401 akışını yumuşatın:** `client.ts`'teki sert `window.location.href='/login'` yerine, önce
   kullanıcıya (varsa) mevcut ekran state'ini localStorage'a native `beforeunload` olmadan
   kaydetme fırsatı tanıyacak şekilde davranın — en azından #1 uygulandıktan sonra bu artık kritik
   olmaz (401 olsa bile localStorage'daki taslak sağ kalır ve login sonrası geri yüklenir), yine de
   mümkünse ani `window.location.href` yerine React Router `navigate('/login')` kullanmayı
   değerlendirin (SPA state'inin tamamen yok olmasını önler, sadece bu ekranın state'i değil genel
   olarak daha güvenli).

## Test

1. "Ürün Girişi" akışında 3. adıma kadar ilerleyip birkaç satır girin, ardından JWT'yi
   geçersizleştirin (süre dolumu simülasyonu) veya backend'i yeniden başlatın, bir API çağrısı
   tetikleyin — sayfa yeniden yüklendiğinde "yarım kalmış giriş" uyarısının çıktığını ve kaldığınız
   adımdan devam edebildiğinizi gösterin.
2. Tarayıcıyı tamamen kapatıp yeniden açtığınızda da (localStorage kalıcı olduğu için) aynı
   taslağın hâlâ orada olduğunu gösterin.

## Rapor formatı

Teşhis sonucu (401 mi, başka bir şey mi) + değişen dosyalar + ekran görüntüsü (taslak kurtarma
uyarısı + yarıda kalmış işlemler listesi).
