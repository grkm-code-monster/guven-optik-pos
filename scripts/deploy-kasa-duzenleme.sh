#!/bin/bash
# 05.11.2026 — Kasa formu düzenlemeleri + stok düşme düzeltmesi yayını (tek hamle).
# Herhangi bir adım hata verirse script ORADA durur (set -e); yayın yarım kalmaz:
#  - yedek alınamazsa hiçbir şey değişmez,
#  - migration kontrolü beklenmeyen bir şey görürse hiçbir şey değişmez,
#  - derleme hata verirse servisler yeniden başlatılmaz (eski sürüm çalışmaya devam eder).
set -euo pipefail
cd /opt/guven-pos
ZAMAN=$(date +%Y-%m-%d-%H%M)
YEDEK=/root/yedek
mkdir -p "$YEDEK"
echo "== 1/7 Yedek ($ZAMAN) =="
DBURL=$(grep -E '^DATABASE_URL=' backend/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/?.*$//')
DBNAME=$(echo "$DBURL" | sed -E 's#.*/([^/?]+)$#\1#')
if command -v pg_dump >/dev/null 2>&1 && pg_dump "$DBURL" -Fc -f "$YEDEK/pos-$DBNAME-$ZAMAN.dump"; then
  echo "POS yedeği alındı (pg_dump)"
else
  KONT=$(docker ps --format '{{.Names}} {{.Image}}' | grep -v odoo | awk '$2 ~ /postgres/ {print $1; exit}')
  test -n "$KONT" || { echo "⚠️ DURDU: pg_dump yok ve POS veritabanı konteyneri bulunamadı"; exit 1; }
  DBUSER=$(echo "$DBURL" | sed -E 's#^postgres(ql)?://([^:@]+).*#\2#')
  docker exec "$KONT" pg_dump -U "$DBUSER" -Fc "$DBNAME" > "$YEDEK/pos-$DBNAME-$ZAMAN.dump"
fi
test -s "$YEDEK/pos-$DBNAME-$ZAMAN.dump"
docker exec odoo-odoo-db-1 pg_dump -U odoo -Fc guvenoptik > "$YEDEK/guvenoptik-$ZAMAN.dump"
test -s "$YEDEK/guvenoptik-$ZAMAN.dump"
ls -lh "$YEDEK/pos-$DBNAME-$ZAMAN.dump" "$YEDEK/guvenoptik-$ZAMAN.dump"
ESKI=$(git rev-parse --short HEAD)
echo "Şu anki sürüm: $ESKI (geri dönüş için not alın)"

echo "== 2/7 Kod çekiliyor =="
git pull --ff-only -q
git log --oneline -1

echo "== 3/7 Migration kontrolü (sadece okur) =="
cd backend
npx ts-node --transpile-only scripts/migration-kontrol.ts 20261105120000_kasa_tahsilat_ciro_duzeltme 20261106100000_tahsilat_subesi_manuel_saat 20261113150000_etiket_basim_kaydi 20261113180000_ikmal_taslak

echo "== 4/7 Veritabanı: yalnızca yeni alanlar ekleniyor =="
npx prisma migrate deploy
npx prisma generate

echo "== 5/7 Derleme (backend + ekran) =="
npm run build
cd ../packages/web
npm run build
cd ../..

echo "== 6/7 Yeniden başlatma =="
pm2 restart guven-backend
pm2 restart guven-frontend
sleep 8
pm2 status --no-color | grep guven
curl -fsS http://localhost:3000/api/health && echo

echo "== 7/7 Bitti — geri dönüş sürümü: $ESKI · yedekler: $YEDEK/*-$ZAMAN.dump =="
