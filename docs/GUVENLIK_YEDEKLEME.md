# Güven Optik — Sistem Güvenliği & Yedekleme Planı

## 1. PM2 — Process Manager

### Kurulum
```bash
npm install -g pm2
```

### ecosystem.config.js (proje kökünde)
```javascript
module.exports = {
  apps: [
    {
      name: 'guven-backend',
      cwd: './backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'guven-frontend',
      cwd: './packages/web',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 5173',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
    }
  ]
};
```

### Komutlar
```bash
pm2 start ecosystem.config.js    # başlat
pm2 save                          # sistem başlangıcına ekle
pm2 startup                       # otomatik başlatma (çıkan komutu çalıştır)
pm2 status                        # durum
pm2 logs guven-backend            # canlı log
pm2 restart guven-backend         # yeniden başlat
```

---

## 2. Nginx — Reverse Proxy + SSL

### Kurulum
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### /etc/nginx/sites-available/guvenoptik
```nginx
server {
    listen 80;
    server_name pos.guvenoptik.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name pos.guvenoptik.com;

    ssl_certificate     /etc/letsencrypt/live/pos.guvenoptik.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.guvenoptik.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass         http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   Host $host;
        proxy_read_timeout 60s;
    }

    # Rate limiting — brute force koruma
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    location /api/auth {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://localhost:3000;
    }
}
```

### SSL sertifikası
```bash
sudo ln -s /etc/nginx/sites-available/guvenoptik /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d pos.guvenoptik.com
# Otomatik yenileme (zaten cronjob var ama test et)
sudo certbot renew --dry-run
```

---

## 3. PostgreSQL Yedekleme

### Günlük otomatik yedek scripti
```bash
# /opt/guven-backup/backup.sh
#!/bin/bash

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/opt/guven-backup/dumps"
DB_NAME="optikpos"
DB_USER="postgres"
KEEP_DAYS=30

mkdir -p $BACKUP_DIR

# Dump al
pg_dump -U $DB_USER -d $DB_NAME -F c -f "$BACKUP_DIR/db-$DATE.dump"

# Sıkıştır
gzip "$BACKUP_DIR/db-$DATE.dump"

# Eski yedekleri sil (30 günden eski)
find $BACKUP_DIR -name "*.dump.gz" -mtime +$KEEP_DAYS -delete

echo "[$DATE] Yedek tamamlandı: db-$DATE.dump.gz" >> /var/log/guven-backup.log
```

### Cron ile zamanla
```bash
chmod +x /opt/guven-backup/backup.sh

# crontab -e ile ekle:
# Her gece 02:00'de yedek al
0 2 * * * /opt/guven-backup/backup.sh

# Her Pazar 03:00'de haftalık yedek (farklı klasöre)
0 3 * * 0 pg_dump -U postgres optikpos | gzip > /opt/guven-backup/weekly/week-$(date +\%V).sql.gz
```

### Yedeği geri yükle
```bash
gunzip -c /opt/guven-backup/dumps/db-2026-06-18.dump.gz | pg_restore -U postgres -d optikpos
```

---

## 4. .env Güvenliği

### .env.production (backend)
```env
NODE_ENV=production
DATABASE_URL="postgresql://guven_user:GUCLU_SIFRE@localhost:5432/optikpos"
JWT_SECRET="en-az-64-karakter-rastgele-string-buraya"
JWT_EXPIRES_IN="8h"

# Uyumsoft
UYUMSOFT_USERNAME=
UYUMSOFT_PASSWORD=
UYUMSOFT_SENDER=

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Patron PDKS
PATRON_TOKEN=
PATRON_ORG_ID=
```

### .env izinleri
```bash
chmod 600 backend/.env.production
chown www-data:www-data backend/.env.production
```

---

## 5. PostgreSQL Kullanıcı Güvenliği

```sql
-- Uygulama için ayrı kullanıcı (postgres superuser kullanma)
CREATE USER guven_user WITH PASSWORD 'GUCLU_SIFRE_BURAYA';
GRANT ALL PRIVILEGES ON DATABASE optikpos TO guven_user;

-- pg_hba.conf — sadece localhost
# TYPE  DATABASE  USER       ADDRESS    METHOD
local   optikpos guven_user            md5
host    optikpos guven_user 127.0.0.1/32 md5
```

---

## 6. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 3000 ve 5173 dışarıya KAPALIM — nginx üzerinden geçer
sudo ufw enable
sudo ufw status
```

---

## 7. Log Yönetimi

```bash
# /etc/logrotate.d/guvenoptik
/opt/guvenoptik/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## 8. Sistem İzleme — Basit Health Check

```bash
# /opt/guven-backup/healthcheck.sh
#!/bin/bash

API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$API" != "200" ]; then
    echo "[$(date)] Backend DOWN! HTTP: $API" >> /var/log/guven-health.log
    pm2 restart guven-backend
fi
```

```bash
# crontab -e
*/5 * * * * /opt/guven-backup/healthcheck.sh
```

Backend'e `/health` endpoint'i ekle:
```typescript
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
```

---

## UYGULAMA SIRASI

1. `npm run build` (backend)
2. PM2 ecosystem dosyasını yaz
3. `pm2 start` + `pm2 startup` + `pm2 save`
4. Nginx kur + config yaz + `nginx -t` + reload
5. Certbot SSL al
6. UFW aç
7. Backup script yaz + cron ekle
8. `.env` izinleri düzelt
9. Healthcheck cron ekle
10. Test: `curl https://pos.guvenoptik.com/api/health`
