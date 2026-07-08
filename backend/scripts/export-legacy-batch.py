#!/usr/bin/env python3
"""Siber Optik Legacy CSV export (read-only, parametrik)."""
import argparse
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


def parse_args():
    p = argparse.ArgumentParser(description="Siber Optik Legacy batch CSV export")
    p.add_argument("--offset", type=int, default=0, help="CariHesap OFFSET (IdCariHesap sırası)")
    p.add_argument("--limit", type=int, default=5000, help="FETCH limit")
    p.add_argument("--batch-num", type=int, help="CSV dosya numarası (batchN_*.csv)")
    return p.parse_args()


def fetchall(cur, sql, params=None):
    cur.execute(sql, params or ())
    cols = [d[0] for d in cur.description]
    return cols, cur.fetchall()


def write_csv(path: Path, cols, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for row in rows:
            w.writerow(["" if v is None else v for v in row])


def main():
    args = parse_args()
    batch_num = args.batch_num if args.batch_num is not None else args.offset // args.limit + 1
    prefix = f"batch{batch_num}"

    sa_password = subprocess.check_output(
        ["docker", "exec", "siber-optik-explore", "printenv", "MSSQL_SA_PASSWORD"],
        text=True,
    ).strip()

    conn = pymssql.connect(
        server="127.0.0.1",
        user="SA",
        password=sa_password,
        port=1433,
        database="GUVEN10",
        login_timeout=30,
    )
    cur = conn.cursor()

    sube_cols, _ = fetchall(cur, "SELECT TOP 0 * FROM Sube")
    sube_id = next((c for c in sube_cols if "Id" in c or c.endswith("Sube")), sube_cols[0])
    sube_name = next(
        (c for c in sube_cols if "Ad" in c or "Kod" in c or "Code" in c),
        sube_cols[1] if len(sube_cols) > 1 else sube_id,
    )

    customer_cols, customer_rows = fetchall(
        cur,
        f"""
        SELECT
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
        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
        """,
        (args.offset, args.limit),
    )
    write_csv(OUT_DIR / f"{prefix}_musteri.csv", customer_cols, customer_rows)
    ids = [int(r[0]) for r in customer_rows]
    print(f"[batch {batch_num}] offset={args.offset} limit={args.limit} musteri: {len(customer_rows)} satır")

    sales_cols = [
        "IdStokHrk",
        "CariHesapId",
        "Tarih",
        "Saat",
        "BelgeNo",
        "SubeId",
        "GenelToplam",
        "NetToplam",
        "BrutToplam",
        "IdStokHrkDt",
        "StokId",
        "UrunAdi",
        "Miktar",
        "Fiyat",
        "KdvOran",
        "KalemNetToplam",
        "KalemGenelToplam",
    ]
    recete_cols = [
        "StokHrkId",
        "CariHesapId",
        "SatisTarih",
        "ReceteTarih",
        "URsph",
        "URcyl",
        "URaxis",
        "ULsph",
        "ULcyl",
        "ULaxis",
        "YRsph",
        "YRcyl",
        "YRAxis",
        "YLsph",
        "YLcyl",
        "YLAxis",
        "URAdisyon",
        "ULAdisyon",
        "YRAdisyon",
        "YLAdisyon",
    ]

    if ids:
        id_list = ",".join(str(i) for i in ids)
        sales_cols, sales_rows = fetchall(
            cur,
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
            """,
        )
        recete_cols, recete_rows = fetchall(
            cur,
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
            """,
        )
    else:
        sales_rows = []
        recete_rows = []

    write_csv(OUT_DIR / f"{prefix}_satis.csv", sales_cols, sales_rows)
    write_csv(OUT_DIR / f"{prefix}_recete.csv", recete_cols, recete_rows)
    print(
        f"[batch {batch_num}] satis: {len(sales_rows)} satır, "
        f"{len({r[1] for r in sales_rows})} müşteri"
    )
    print(
        f"[batch {batch_num}] recete: {len(recete_rows)} satır, "
        f"{len({r[1] for r in recete_rows})} müşteri"
    )

    conn.close()
    for suffix in ("musteri", "satis", "recete"):
        p = OUT_DIR / f"{prefix}_{suffix}.csv"
        print(f"  {p} ({p.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
