# Personel işten çıkarma — eksik buton + tam kapsam kontrolü

## Sorun

Görkem bir personelin işten ayrıldığını, tüm sistem erişiminin (POS girişi dahil) durması
gerektiğini bildirdi. Kontrol ettim: backend'de bu iş için gerekli mantık **zaten yazılmış ve
doğru**:

- `POST /admin/personel-isten-cikar/:id` (`admin.controller.ts` satır ~4063) — `Personel.aktif=false`,
  bağlıysa `User.isActive=false` (POS girişini gerçekten engelliyor, `auth.service.ts` satır 84'te
  kontrol ediliyor, doğruladım), bağlıysa Odoo `hr.employee.active=false` (arşivleme).
- `POST /admin/personel-aktifles/:id` — aynısının tersi, geri açma.
- Frontend'de (`IKPage.tsx` satır 493-504) `istenCikar()` fonksiyonu da yazılmış, doğru endpoint'i
  çağırıyor.

**Ama bu fonksiyon hiçbir JSX buton/onClick'e bağlanmamış** — İK & Prim → Personeller ekranında bu
işlemi tetikleyecek görünür bir buton yok. Yani mantık hazır ama kullanıcı arayüzden erişemiyor.

Görkem'in isteği tek kişiye özel acil bir müdahale değil, **genel ve kalıcı bir çözüm**: her
personel için, bağlı olduğu tüm sistemlerden (PDKS + Odoo + POS) erişimin kesilebildiği güvenilir
bir "İşten Çıkar" akışı.

## Yapılacak

### 1. Eksik butonu ekleyin

`IKPage.tsx`'teki personel listesinde (satır tablosu, "Bağla"/"Düzenle" butonlarının olduğu
alanda) her aktif personel satırına **"İşten Çıkar"** butonu ekleyin — zaten yazılmış `istenCikar()`
fonksiyonuna bağlayın (onay penceresi zaten var, dokunmayın). Pasif personel satırlarına da
**"Tekrar Aktifleştir"** butonu ekleyin, `aktifles()` fonksiyonuna bağlayın.

### 2. PDKS boşluğunu kapatın (ya da en azından görünür yapın)

Şu an işten çıkarma sonrası sadece `"PDKS sisteminden manuel olarak çıkarın"` uyarısı bir `alert()`
içinde gösteriliyor — kolayca gözden kaçar, PDKS tarafında kişi aktif kalmaya devam edebilir.

- Önce araştırın: Patron PDKS API'sinde bir kullanıcıyı pasife alma/silme ucu var mı
  (`https://app.patronpdks.com/api/v4` dokümantasyonunda arayın, ya da destekten sorulmuş
  bilgi varsa onu kullanın). Varsa, `personel-isten-cikar` akışına bunu da ekleyin, üçü de
  (PDKS+Odoo+POS) otomatik kesilsin.
- Yoksa (PDKS'te programatik pasife alma desteklenmiyorsa): `alert()` yerine kalıcı bir uyarı
  gösterin — işten çıkarma onay penceresinde "PDKS'ten manuel çıkarmayı unutmayın" checkbox'ı
  zorunlu tutulsun, ya da personel listesinde pasif ama `pdksId` hâlâ dolu olan kişiler için
  ekranda sürekli görünen kırmızı bir uyarı rozeti olsun ("PDKS'te hâlâ aktif olabilir").

### 3. Doğrulama

Test ortamında bir test personelini işten çıkarıp: POS'ta o kullanıcıyla giriş denemesinin
gerçekten reddedildiğini, Odoo'da employee'nin arşivlendiğini, sonra "Tekrar Aktifleştir" ile
geri açıp POS girişinin tekrar çalıştığını doğrulayın.

## Kabul kriteri

- İK & Prim → Personeller'de her personel satırında işten çıkarma/aktifleştirme görünür ve çalışır
  durumda.
- İşten çıkarılan bir kişi POS'a giriş yapamıyor (gerçek test ile doğrulanmış).
- PDKS boşluğu ya kapatılmış ya da gözden kaçmayacak şekilde belirginleştirilmiş.

Bitince kısa rapor + ekran görüntüsüyle bildirin.
