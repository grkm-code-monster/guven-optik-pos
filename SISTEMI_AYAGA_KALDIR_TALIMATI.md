# Sistem açılmıyor — tüm local servisleri ayağa kaldır

## Durum

Görkem sisteme girmeye çalıştığında açılmıyor — terminallerdeki localhost sunucuları (muhtemelen
backend, belki de Docker container'lar) kapanmış görünüyor. Muhtemel sebep: bilgisayar yeniden
başlatıldı/uzun süre kapalı kaldı ve arka planda çalışan process'ler/Docker container'ları
sonlandı.

## Bu projede TAM olarak neyin çalışıyor olması gerekiyor

1. **Postgres (uygulama DB)** — Docker, `docker-compose.yml` (repo kökü), servis adı `postgres`,
   port **5432**, DB adı `optikpos`.
2. **Odoo 17 + kendi Postgres'i** — Docker, `odoo/docker-compose.yml`, servis adları `odoo-db`
   (port 5433) ve `odoo` (port **8069**). Backend `.env`'de `ODOO_URL=http://localhost:8069`
   ile buraya bağlanıyor.
3. **Backend** — `backend/` klasöründe `npm run dev` (nodemon + ts-node, `src/server.ts`), port
   **3000** (`.env`'de `PORT` yoksa varsayılan 3000).
4. **Frontend** — `packages/web/` klasöründe `npm run dev` (Vite), varsayılan port **5173**,
   `/api` isteklerini `http://localhost:3000`'e proxy'liyor (`vite.config.ts`).

Bu 4 katman da ayrı ayrı ayakta olmalı — biri eksikse sistem "açılmıyor" gibi görünür.

## İstenen

1. **Docker Desktop'ın (veya Docker daemon'ının) çalıştığını doğrulayın** — kapalıysa açın.
2. Repo kökünde: `docker compose up -d` — Postgres'i ayağa kaldırın. `docker ps` ile `postgres`
   container'ının `Up` durumda olduğunu doğrulayın.
3. `odoo/` klasöründe: `docker compose up -d` — Odoo + kendi DB'sini ayağa kaldırın. `docker ps`
   ile `odoo` ve `odoo-db` container'larının `Up` olduğunu doğrulayın. Odoo ilk açılışta veya uzun
   süre kapalı kaldıktan sonra ayağa kalkması birkaç dakika sürebilir — `docker logs -f odoo`
   (veya container adı neyse) ile hazır olduğunu izleyin.
4. `backend/` klasöründe: `npm run dev` ile backend'i başlatın (ayrı bir terminalde, arka planda
   kalıcı çalışsın). Terminalde hata çıkmadan `nodemon` ve sunucunun "listening on port 3000" gibi
   bir log verdiğini doğrulayın. Hata çıkarsa (örn. `ECONNREFUSED` ile Postgres'e bağlanamama)
   #2'nin gerçekten ayakta olduğunu tekrar kontrol edin.
5. `packages/web/` klasöründe: `npm run dev` ile frontend'i başlatın (ayrı terminal). Vite'ın
   verdiği local URL'yi (muhtemelen `http://localhost:5173`) tarayıcıda açıp giriş ekranının
   geldiğini doğrulayın.
6. **Tüm terminallerin arka planda AÇIK kalması gerekiyor** — bu iki `npm run dev` komutu ve iki
   Docker Compose stack'i kapatılırsa sistem yine düşer. Mümkünse Görkem'e bunları nasıl kalıcı
   arka planda tutabileceğini (örn. terminal sekmelerini kapatmadan bırakma, ya da `pm2`/benzeri
   bir process manager önerisi) kısaca not düşün — bu "sunucular kapanmış" sorununun tekrar
   yaşanmaması için.
7. Her katmanın gerçekten birbirine bağlandığını uçtan uca doğrulayın: tarayıcıdan giriş yapıp bir
   ekranın (örn. Depo Yönetimi) veri çektiğini görün — sadece process'lerin "ayakta" olması yetmez,
   gerçek bir istek/cevap döngüsünün çalıştığını kanıtlayın.

## Sorun giderme (yaygın takılma noktaları)

- `EADDRINUSE` (port zaten kullanımda) hatası: eski/zombi bir process portu tutuyor olabilir —
  `lsof -i :3000` (veya 5173/5432/8069) ile hangi process'in tuttuğunu bulup kapatın.
- Backend'de `node_modules` eksik/bozuksa `npm install` gerekebilir (uzun süredir çalıştırılmadıysa
  bağımlılıklar güncel olmayabilir, dikkatli olun — sürüm değişikliği riskini göze almadan önce
  Görkem'e sorun).
- `.env` dosyası (`backend/.env`) yanlışlıkla silinmiş/değişmiş olabilir — repo'daki
  `.env.example` ile karşılaştırıp eksik alan olup olmadığını kontrol edin.

## Rapor formatı

Her 4 katmanın (Postgres, Odoo, backend, frontend) ayakta olduğunun kanıtı (`docker ps` çıktısı +
her iki `npm run dev` terminalinin son satırları) + tarayıcıdan başarılı giriş ekran görüntüsü.
