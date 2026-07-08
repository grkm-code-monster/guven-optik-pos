#!/usr/bin/env python3
"""FAZ 2A — Siber Optik batch1 CSV export (read-only)."""
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
    cols = [d[0] for d in cur.description]
    return cols, cur.fetchall()


def write_csv(path: Path, cols, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for row in rows:
            w.writerow(["" if v is None else v for v in row])


# Sube kolon adını bul
sube_cols, _ = fetchall("SELECT TOP 0 * FROM Sube")
sube_id = next((c for c in sube_cols if "Id" in c or c.endswith("Sube")), sube_cols[0])
sube_name = next(
    (c for c in sube_cols if "Ad" in c or "Kod" in c or "Code" in c),
    sube_cols[1] if len(sube_cols) > 1 else sube_id,
)

# 500 müşteri — IdCariHesap sırası, Ad veya Soyad dolu
customer_cols, customer_rows = fetchall(
    f"""
    SELECT TOP 500
      ch.IdCariHesap,
      ch.Ad,
      ch.Soyad,
      ch.Telefon1,
      ch.CepTelefon,
      ch.TcKimlikNo,
      ch.Adres,
      ch.Email,
      ch.DogumTar,
      ch.SubeId,
      CAST(ch.SubeId AS varchar(20)) AS SubeIdStr,
      sb.[{sube_name}] AS SubeAdi
    FROM CariHesap ch
    LEFT JOIN Sube sb ON sb.[{sube_id}] = ch.SubeId
    WHERE ch.IdCariHesap > 0
      AND (
        NULLIF(LTRIM(RTRIM(ch.Ad)), '') IS NOT NULL
        OR NULLIF(LTRIM(RTRIM(ch.Soyad)), '') IS NOT NULL
      )
    ORDER BY ch.IdCariHesap
    """
)
write_csv(OUT_DIR / "batch1_musteri.csv", customer_cols, customer_rows)
ids = [int(r[0]) for r in customer_rows]
id_list = ",".join(str(i) for i in ids)
print(f"musteri: {len(customer_rows)} satır")

# Satış
sales_cols, sales_rows = fetchall(
    f"""
    SELECT
      sh.IdStokHrk,
      sh.CariHesapId,
      sh.Tarih,
      sh.Saat,
      sh.BelgeNo,
      sh.SubeId,
      sh.GenelToplam,
      sh.NetToplam,
      sh.BrutToplam,
      sd.IdStokHrkDt,
      sd.StokId,
      s.Aciklama AS UrunAdi,
      sd.Miktar,
      sd.Fiyat,
      sd.KdvOran,
      sd.NetToplam AS KalemNetToplam,
      sd.GenelToplam AS KalemGenelToplam
    FROM StokHrk sh
    INNER JOIN StokHrkDt sd ON sd.StokHrkId = sh.IdStokHrk
    LEFT JOIN Stok s ON s.IdStok = sd.StokId
    WHERE sh.CariHesapId IN ({id_list})
    ORDER BY sh.CariHesapId, sh.Tarih, sh.IdStokHrk, sd.IdStokHrkDt
    """
)
write_csv(OUT_DIR / "batch1_satis.csv", sales_cols, sales_rows)
print(f"satis: {len(sales_rows)} satır, {len({r[1] for r in sales_rows})} müşteri")

# Reçete — en az bir SPH/CYL dolu, tarih StokHrk'ten
recete_cols, recete_rows = fetchall(
    f"""
    SELECT
      osh.StokHrkId,
      osh.CariHesapId,
      sh.Tarih AS SatisTarih,
      osh.ReceteTarih,
      osh.URsph,
      osh.URcyl,
      osh.URaxis,
      osh.ULsph,
      osh.ULcyl,
      osh.ULaxis,
      osh.YRsph,
      osh.YRcyl,
      osh.YRAxis,
      osh.YLsph,
      osh.YLcyl,
      osh.YLAxis,
      osh.URAdisyon,
      osh.ULAdisyon,
      osh.YRAdisyon,
      osh.YLAdisyon
    FROM OptikStokHrk osh
    INNER JOIN StokHrk sh ON sh.IdStokHrk = osh.StokHrkId
    WHERE osh.CariHesapId IN ({id_list})
      AND (
        osh.URsph IS NOT NULL OR osh.URcyl IS NOT NULL
        OR osh.ULsph IS NOT NULL OR osh.ULcyl IS NOT NULL
        OR osh.YRsph IS NOT NULL OR osh.YRcyl IS NOT NULL
        OR osh.YLsph IS NOT NULL OR osh.YLcyl IS NOT NULL
      )
    ORDER BY osh.CariHesapId, sh.Tarih, osh.StokHrkId
    """
)
write_csv(OUT_DIR / "batch1_recete.csv", recete_cols, recete_rows)
print(f"recete: {len(recete_rows)} satır, {len({r[1] for r in recete_rows})} müşteri")

conn.close()
for name in ("batch1_musteri.csv", "batch1_satis.csv", "batch1_recete.csv"):
    p = OUT_DIR / name
    print(f"  {p} ({p.stat().st_size} bytes)")
