#!/usr/bin/env bash
# FAZ 2B — Tüm Legacy müşteri aktarımı (5.000'lik partiler)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$BACKEND_DIR/logs/full-legacy-import-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$BACKEND_DIR/logs"

BATCH_SIZE=5000
TOTAL=145300
OFFSET=${START_OFFSET:-0}
BATCH_NUM=$(( OFFSET / BATCH_SIZE + 1 ))
START_TIME=$(date +%s)
SUCCESSFUL=()
FAILED_OFFSET=""

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== FAZ 2B Full Legacy Import ==="
echo "Başlangıç: $(date -Iseconds)"
echo "Log: $LOG_FILE"
echo "Batch size: $BATCH_SIZE, hedef: $TOTAL müşteri"
echo ""

cd "$BACKEND_DIR"

while [ "$OFFSET" -lt "$TOTAL" ]; do
  LIMIT=$BATCH_SIZE
  if [ $((OFFSET + LIMIT)) -gt "$TOTAL" ]; then
    LIMIT=$((TOTAL - OFFSET))
  fi

  echo "----------------------------------------"
  echo "Parti $BATCH_NUM | offset=$OFFSET limit=$LIMIT | $(date +%H:%M:%S)"
  echo "----------------------------------------"

  if ! python3 "$SCRIPT_DIR/export-legacy-batch.py" --offset "$OFFSET" --limit "$LIMIT" --batch-num "$BATCH_NUM"; then
    echo "HATA: Export başarısız — offset=$OFFSET batch=$BATCH_NUM"
    FAILED_OFFSET="$OFFSET"
    break
  fi

  if [ "$LIMIT" -le 0 ]; then
    echo "Parti $BATCH_NUM: limit=0, döngü sonlandırılıyor."
    break
  fi

  CUSTOMER_ROWS=$(python3 - <<PY
import csv
from pathlib import Path
p = Path("/Users/guvenoptikgorkem/Desktop/siber-optik-export/batch${BATCH_NUM}_musteri.csv")
if not p.exists():
    print(0)
else:
    with p.open(encoding="utf-8-sig") as f:
        print(max(0, sum(1 for _ in csv.reader(f)) - 1))
PY
)

  if [ "$CUSTOMER_ROWS" -eq 0 ]; then
    echo "Parti $BATCH_NUM: müşteri yok — tüm kayıtlar aktarılmış, döngü sonlandırılıyor."
    SUCCESSFUL+=("$BATCH_NUM")
    break
  fi

  if ! npx ts-node --transpile-only "$SCRIPT_DIR/import-legacy-batch.ts" --batch="$BATCH_NUM"; then
    echo "HATA: Import başarısız — offset=$OFFSET batch=$BATCH_NUM"
    FAILED_OFFSET="$OFFSET"
    break
  fi

  SUCCESSFUL+=("$BATCH_NUM")
  echo "Parti $BATCH_NUM tamamlandı."

  if [ $((BATCH_NUM % 5)) -eq 0 ]; then
    IMPORTED=$((BATCH_NUM * BATCH_SIZE))
    if [ "$IMPORTED" -gt "$TOTAL" ]; then
      IMPORTED=$TOTAL
    fi
    ELAPSED=$(( $(date +%s) - START_TIME ))
    echo ""
    echo ">>> İLERLEME: $BATCH_NUM parti tamamlandı (~$IMPORTED müşteri hedefe doğru), geçen süre: ${ELAPSED}s"
    echo ""
  fi

  sleep 2
  OFFSET=$((OFFSET + BATCH_SIZE))
  BATCH_NUM=$((BATCH_NUM + 1))
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "=== ÖZET ==="
echo "Bitiş: $(date -Iseconds)"
echo "Toplam süre: ${ELAPSED}s ($(( ELAPSED / 60 )) dk)"
echo "Başarılı parti sayısı: ${#SUCCESSFUL[@]}"
if [ -n "$FAILED_OFFSET" ]; then
  echo "DURDU: offset=$FAILED_OFFSET (batch $(( FAILED_OFFSET / BATCH_SIZE + 1 )))"
  exit 1
fi
echo "Tüm partiler tamamlandı."
