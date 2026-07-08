#!/usr/bin/env python3
"""Read-only CSV export from isolated GUVEN10 SQL Server."""
import csv
import subprocess
import sys
from pathlib import Path

try:
    import pymssql
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymssql", "-q"])
    import pymssql

OUT_DIR = Path("/Users/guvenoptikgorkem/Desktop/siber-optik-export")
OUT_DIR.mkdir(parents=True, exist_ok=True)
SCHEMA_LOG = OUT_DIR / "optik_stok_hrk_sutunlar.txt"

SA_PASSWORD = subprocess.check_output(
    ["docker", "exec", "siber-optik-explore", "printenv", "MSSQL_SA_PASSWORD"],
    text=True,
).strip()

conn = pymssql.connect(
    server="127.0.0.1",
    user="SA",
    password=SA_PASSWORD,
    port=1433,
    database="GUVEN10",
    login_timeout=30,
)
cur = conn.cursor()


def fetchall(sql, params=None):
    cur.execute(sql, params or ())
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    return cols, rows


def write_csv(path: Path, cols, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for row in rows:
            w.writerow(["" if v is None else v for v in row])


# --- OptikStokHrk sütun yapısı ---
_, optik_schema_rows = fetchall(
    """
    SELECT c.name AS KolonAdi, ty.name AS Tip
    FROM sys.columns c
    JOIN sys.types ty ON c.user_type_id = ty.user_type_id
    WHERE c.object_id = OBJECT_ID('OptikStokHrk')
    ORDER BY c.column_id
    """
)
optik_col_names = [r[0] for r in optik_schema_rows]
with SCHEMA_LOG.open("w", encoding="utf-8") as f:
    f.write("OptikStokHrk sütun yapısı\n")
    f.write("KolonAdi\tTip\n")
    for name, typ in optik_schema_rows:
        f.write(f"{name}\t{typ}\n")
print("=== OptikStokHrk SÜTUN YAPISI ===")
for name, typ in optik_schema_rows:
    print(f"  {name}\t{typ}")

# Stok ürün adı kolonu
stok_cols, _ = fetchall("SELECT TOP 0 * FROM Stok")
stok_name_col = next(
    (c for c in stok_cols if c in ("StokAd", "StokAdi", "Ad", "UrunAdi", "Aciklama")),
    None,
)
if not stok_name_col:
    stok_name_col = next((c for c in stok_cols if "Ad" in c and "Muhasebe" not in c), stok_cols[0])
stok_pk = "IdStok" if "IdStok" in stok_cols else stok_cols[0]
print(f"\nStok PK: {stok_pk}, ürün adı kolonu: {stok_name_col}")

# --- 50 rastgele müşteri ---
customer_cols, customer_rows = fetchall(
    """
    SELECT TOP 50
      ch.IdCariHesap,
      ch.Ad,
      ch.Soyad,
      ch.Telefon1,
      ch.CepTelefon,
      ch.TcKimlikNo,
      ch.Adres,
      ch.Email,
      ch.DogumTar,
      oc.LensTarih,
      oc.UCerTar,
      oc.YCerTar,
      oc.UCamTar,
      oc.YCamTar,
      oc.YakinlikId
    FROM CariHesap ch
    LEFT JOIN OptikCari oc ON oc.CariHesapId = ch.IdCariHesap
    WHERE ch.IdCariHesap > 0
      AND NULLIF(LTRIM(RTRIM(ch.Ad)), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(ch.Soyad)), '') IS NOT NULL
      AND (ch.Kapali IS NULL OR ch.Kapali = 0)
      AND (ch.Aktif IS NULL OR ch.Aktif <> 0)
    ORDER BY NEWID()
    """
)
write_csv(OUT_DIR / "musteri_ornek.csv", customer_cols, customer_rows)
customer_ids = [r[0] for r in customer_rows]
print(f"\nMüşteri seçildi: {len(customer_ids)}")

id_list = ",".join(str(int(i)) for i in customer_ids)

# --- Satış geçmişi ---
sales_cols, sales_rows = fetchall(
    f"""
    SELECT
      sh.IdStokHrk,
      sh.CariHesapId,
      ch.Ad,
      ch.Soyad,
      sh.Tarih,
      sh.Saat,
      sh.BelgeNo,
      sh.SubeId,
      sh.GenelToplam,
      sh.BrutToplam,
      sh.NetToplam,
      sh.IskontoToplam,
      sh.KdvToplam,
      sh.StokHrkTipId,
      sh.GC,
      sd.IdStokHrkDt,
      sd.StokId,
      s.[{stok_name_col}] AS UrunAdi,
      sd.Miktar,
      sd.Fiyat,
      sd.KdvOran,
      sd.NetToplam AS KalemNetToplam,
      sd.GenelToplam AS KalemGenelToplam,
      sd.BrutToplam AS KalemBrutToplam
    FROM StokHrk sh
    INNER JOIN StokHrkDt sd ON sd.StokHrkId = sh.IdStokHrk
    LEFT JOIN Stok s ON s.[{stok_pk}] = sd.StokId
    LEFT JOIN CariHesap ch ON ch.IdCariHesap = sh.CariHesapId
    WHERE sh.CariHesapId IN ({id_list})
    ORDER BY sh.CariHesapId, sh.Tarih, sh.IdStokHrk, sd.IdStokHrkDt
    """
)
write_csv(OUT_DIR / "satis_ornek.csv", sales_cols, sales_rows)
customers_with_sales = len({r[1] for r in sales_rows})
print(f"Satış kaydı: {len(sales_rows)} satır, {customers_with_sales}/50 müşteride veri")

# --- Reçete (OptikStokHrk) ---
if "StokHrkId" in optik_col_names:
    recete_sql = f"""
    SELECT osh.*, sh.CariHesapId, sh.Tarih AS SatisTarih
    FROM OptikStokHrk osh
    INNER JOIN StokHrk sh ON sh.IdStokHrk = osh.StokHrkId
    WHERE sh.CariHesapId IN ({id_list})
    ORDER BY sh.CariHesapId, sh.Tarih, osh.StokHrkId
    """
elif "StokHrkDtId" in optik_col_names:
    recete_sql = f"""
    SELECT osh.*, sh.CariHesapId, sh.Tarih AS SatisTarih
    FROM OptikStokHrk osh
    INNER JOIN StokHrkDt sd ON sd.IdStokHrkDt = osh.StokHrkDtId
    INNER JOIN StokHrk sh ON sh.IdStokHrk = sd.StokHrkId
    WHERE sh.CariHesapId IN ({id_list})
    ORDER BY sh.CariHesapId, sh.Tarih
    """
elif "StokHrkDt" in optik_col_names:
    recete_sql = f"""
    SELECT osh.*, sh.CariHesapId, sh.Tarih AS SatisTarih
    FROM OptikStokHrk osh
    INNER JOIN StokHrkDt sd ON sd.IdStokHrkDt = osh.StokHrkDt
    INNER JOIN StokHrk sh ON sh.IdStokHrk = sd.StokHrkId
    WHERE sh.CariHesapId IN ({id_list})
    ORDER BY sh.CariHesapId, sh.Tarih
    """
else:
    # fallback: export all optik columns for sales of selected customers via any numeric link
    link = next((c for c in optik_col_names if "Hrk" in c or "Stok" in c), optik_col_names[0])
    recete_sql = f"SELECT TOP 500 * FROM OptikStokHrk ORDER BY NEWID()"

recete_cols, recete_rows = fetchall(recete_sql)
write_csv(OUT_DIR / "recete_ornek.csv", recete_cols, recete_rows)
if "CariHesapId" in recete_cols:
    customers_with_recete = len({r[recete_cols.index("CariHesapId")] for r in recete_rows})
else:
    customers_with_recete = 0
print(f"Reçete kaydı: {len(recete_rows)} satır, {customers_with_recete}/50 müşteride veri")
print(f"OptikStokHrk link kolonları: {[c for c in optik_col_names if 'Hrk' in c or 'Stok' in c or 'Cari' in c]}")

print(f"\nCSV dizini: {OUT_DIR}")
for name in ("musteri_ornek.csv", "satis_ornek.csv", "recete_ornek.csv"):
    p = OUT_DIR / name
    print(f"  {p} ({p.stat().st_size} bytes)")

conn.close()
