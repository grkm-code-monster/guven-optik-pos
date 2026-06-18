#!/bin/bash
set -euo pipefail

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_DIR:-/opt/guven-backup/dumps}"
DB_NAME="${DB_NAME:-optikpos}"
DB_USER="${DB_USER:-postgres}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_DIR/db-$DATE.dump"
gzip "$BACKUP_DIR/db-$DATE.dump"

find "$BACKUP_DIR" -name "*.dump.gz" -mtime +"$KEEP_DAYS" -delete

echo "[$DATE] Yedek tamamlandı: db-$DATE.dump.gz" >> /var/log/guven-backup.log
