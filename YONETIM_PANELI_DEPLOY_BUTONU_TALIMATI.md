# Yönetim Paneline "Tek Tık Deploy" Özelliği

## Amaç

Yönetim panelinde (Admin) yeni bir sayfa/alan: localde yapılan güncellemeleri, tek
butona basarak production sunucusuna (yakında İlkbyte üzerinde kurulacak) uygulayan
bir "Deploy" özelliği.

## Mimari (nasıl çalışacak)

Bu buton, sunucudaki backend'in KENDİ ÜZERİNDE çalışan yeni bir endpoint'i tetikler.
Yani buton local makineden SSH ile sunucuya bağlanmıyor — sunucuda zaten çalışan
backend, kendi klasöründe `git pull` yapıp kendini yeniden derleyip yeniden
başlatıyor. Akış:

1. Kullanıcı (ADMIN rolü) `/admin/deploy` sayfasında "Şimdi Güncelle" butonuna basar.
2. Frontend `POST /api/admin/deploy` çağırır (mevcut `adminApi` axios instance'ı ile,
   `admin-token` zaten header'da).
3. Backend'de yeni endpoint, sunucu üzerinde sırayla:
   - `git pull` (repo kök dizininde)
   - `npm install` (`backend/` ve `packages/web/` içinde)
   - `npx prisma migrate deploy` (`backend/` içinde — DİKKAT: `migrate dev` DEĞİL,
     `migrate deploy` — production'da interaktif prompt vermeyen, sadece bekleyen
     migration'ları uygulayan komut)
   - `npm run build` (her iki klasörde de)
   - `pm2 restart guven-backend guven-frontend` (mevcut `ecosystem.config.js`'teki isimler)
4. Her adımın çıktısını bir log dosyasına (`deploy.log` gibi) yazar, son deploy
   zamanını ve durumunu (başarılı/başarısız + hangi adımda hata) bir küçük JSON
   dosyasında veya basit bir DB tablosunda tutar.
5. Frontend, deploy tetiklendikten sonra durumu (çalışıyor/bitti/hata) periyodik
   olarak (`GET /api/admin/deploy/status`) sorup ekranda gösterir.

## KRİTİK güvenlik noktaları — atlamayın

Bu proje şu ana kadar `child_process`/shell komutu çalıştıran HİÇBİR kod içermiyor
(kontrol ettim). Bu, YENİ ve HASSAS bir davranış — dikkatli yazılmalı:

1. **Komut enjeksiyonu riski yok çünkü kullanıcıdan hiçbir parametre alınmıyor.**
   Endpoint, body'den/query'den gelen HİÇBİR string'i komuta enjekte ETMEMELİ — sabit,
   önceden tanımlı komutlar (`git pull`, `npm install`, vs.) sabit argümanlarla
   çalıştırılmalı. `execSync('git pull')` gibi sabit string kullanın, asla
   `` `git pull ${req.body.x}` `` gibi bir şey yazmayın.
2. **Sadece `Role.ADMIN` erişebilmeli** — `authorize(Role.ADMIN)` middleware'i ile
   (mevcut `admin.controller.ts`'teki desen, örn. `router.post('/branch',
   authorize(Role.ADMIN), ...)`).
3. **Backend kendi kendini yeniden başlatıyor** — yani `pm2 restart guven-backend`
   çalıştığı an, o isteğe cevap veren process öldürülüyor demek. Bu yüzden:
   - Önce HTTP response'u (`res.json({ started: true })`) gönderin,
   - SONRA deploy script'ini `setImmediate`/arka planda (`exec` callback'i beklemeden,
     ya da ayrı bir küçük shell script'i `spawn` ile detached modda) çalıştırın,
   - Yoksa restart, response'u istemciye ulaştırmadan bağlantıyı kesebilir.
4. **Eşzamanlı deploy'u engelleyin** — bir deploy çalışırken ikinci bir deploy isteği
   gelirse reddedin (basit bir in-memory `isDeploying` boolean flag yeterli), yoksa
   yarım kalmış git/npm işlemleri çakışabilir.
5. **Migration adımını `prisma migrate deploy` ile sınırlayın**, `migrate dev` asla
   production'da kullanılmamalı (interaktif sorular sorar, otomasyonda takılır).

## Frontend

- Yeni sayfa: `/admin/deploy`, `App.tsx`'teki mevcut admin route deseniyle eklenin
  (bkz. `patron`, `rapor-matris` route'ları).
- `AdminLayout.tsx`'teki `MENU` dizisine ekleyin.
- Görünürlük: `constants/ekYetki.ts` içindeki `canSeeAdminMenuItem`'a, `/admin/patron`
  gibi, `role === 'ADMIN'` özel durumu olarak ekleyin (genel ek-yetki sistemi
  ÜZERİNDEN DEĞİL — bu sayfa sadece gerçek ADMIN'lere görünmeli).
- Stil: mevcut admin sayfalarındaki gibi (`PatronPage.tsx`, `EtiketBasModal.tsx`)
  inline `style={{}}` ve CSS değişkenleri (`var(--color-...)`) kullanın, Tailwind
  class'ı KULLANMAYIN (projede kullanılmıyor).
- Ekranda göstermesi gerekenler: "Şimdi Güncelle" butonu, son deploy zamanı, son
  deploy durumu (başarılı/başarısız), ve son deploy'un log çıktısının bir kısmı
  (hata olduysa tam log'u görebilmek önemli).

## Kapsam dışı / henüz yapmayın

- Sunucu henüz kurulmadı (İlkbyte hesabı açılıyor) — bu özelliği KODLAYIN ama gerçek
  sunucuda test ETMEYİN, sunucu bilgileri geldiğinde birlikte test edeceğiz.
- SSH/uzaktan tetikleme YOK — sadece sunucunun kendi backend'i kendi üzerinde
  çalıştırıyor (yukarıdaki mimari).
- Otomatik/zamanlanmış deploy YOK — sadece manuel buton.

## Test

1. `tsc --noEmit` her iki paket için temiz olsun.
2. Localde (gerçek `git pull`/`pm2 restart` çalıştırmadan) endpoint'in doğru
   authorize kontrolü yaptığını, yanlış rolle 403 döndüğünü doğrulayın.
3. Deploy script'inin adımlarını (git/npm/prisma/build/pm2 komutlarının TAM
   metnini) raporda satır satır paylaşın, ben mantığını gözden geçireyim.
4. Eşzamanlı ikinci istek gönderildiğinde reddedildiğini (409 gibi) test edin.
