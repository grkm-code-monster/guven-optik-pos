#!/usr/bin/env python3
"""Read-only Siber Optik DB exploration — isolated SQL Server container only."""
import json
import re
import subprocess
import sys

try:
    import pymssql
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymssql", "-q"])
    import pymssql

SA_PASSWORD = subprocess.check_output(
    ["docker", "exec", "siber-optik-explore", "printenv", "MSSQL_SA_PASSWORD"],
    text=True,
).strip()

conn = pymssql.connect(
    server="127.0.0.1",
    user="SA",
    password=SA_PASSWORD,
    port=1433,
    login_timeout=30,
    autocommit=True,
)


def run(sql: str):
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall() if cur.description else []
    return cols, rows


def db_exists(name: str) -> bool:
    _, rows = run(f"SELECT DB_ID('{name}')")
    return rows[0][0] is not None


if not db_exists("GUVEN10"):
    attach_sql = """
    CREATE DATABASE GUVEN10 ON
      (FILENAME = '/var/opt/mssql/data/GUVEN10.mdf'),
      (FILENAME = '/var/opt/mssql/data/GUVEN10_log.ldf')
    FOR ATTACH;
    """
    try:
        run(attach_sql)
        print("ATTACH: OK (FOR ATTACH)")
    except Exception as e:
        msg = str(e)
        print(f"ATTACH: FOR ATTACH failed: {msg[:200]}")
        rebuild_sql = """
        CREATE DATABASE GUVEN10 ON
          (FILENAME = '/var/opt/mssql/data/GUVEN10.mdf')
        FOR ATTACH_REBUILD_LOG;
        """
        run(rebuild_sql)
        print("ATTACH: OK (FOR ATTACH_REBUILD_LOG)")

conn.close()
conn = pymssql.connect(
    server="127.0.0.1",
    user="SA",
    password=SA_PASSWORD,
    port=1433,
    database="GUVEN10",
    login_timeout=30,
)

SENSITIVE = re.compile(r"(tel|telefon|phone|gsm|cep|tc|tckn|kimlik|vkn|vergi|email|mail|adres|address)", re.I)


def mask_value(name: str, val):
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return s
    if not SENSITIVE.search(name):
        return s
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 4:
        return "*" * max(0, len(s) - 4) + s[-4:]
    return "***"


def run_in_db(sql: str):
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    return cols, rows


print("\n=== TABLOLAR (satır sayısı) ===")
cols, tables = run_in_db(
    """
    SELECT t.name AS TabloAdi, SUM(p.rows) AS SatirSayisi
    FROM sys.tables t
    JOIN sys.partitions p ON t.object_id = p.object_id
    WHERE p.index_id IN (0,1)
    GROUP BY t.name
    ORDER BY SatirSayisi DESC;
    """
)
for row in tables:
    print(f"{row[0]}\t{row[1]}")

top15 = [r[0] for r in tables[:15]]
print("\n=== TOP 15 SÜTUN YAPISI ===")
schema = {}
for table in top15:
    _, cols_info = run_in_db(
        f"""
        SELECT c.name AS KolonAdi, ty.name AS Tip
        FROM sys.columns c
        JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        WHERE c.object_id = OBJECT_ID('{table}')
        ORDER BY c.column_id;
        """
    )
    schema[table] = cols_info
    print(f"\n-- {table} ({len(cols_info)} kolon)")
    for cname, ctype in cols_info:
        print(f"  {cname}\t{ctype}")

print("\n=== TOP 15 ÖRNEK VERİ (ilk 3 satır, maskeli) ===")
samples = {}
for table in top15:
    col_names = [c[0] for c in schema[table]]
    if not col_names:
        continue
    select_list = ", ".join(f"[{c}]" for c in col_names)
    try:
        _, rows = run_in_db(f"SELECT TOP 3 {select_list} FROM [{table}]")
    except Exception as e:
        print(f"\n-- {table}: okunamadı ({e})")
        continue
    masked_rows = []
    for row in rows:
        masked_rows.append({col_names[i]: mask_value(col_names[i], row[i]) for i in range(len(col_names))})
    samples[table] = masked_rows
    print(f"\n-- {table}")
    for i, row in enumerate(masked_rows, 1):
        print(f"  satır{i}: {json.dumps(row, ensure_ascii=False, default=str)[:500]}")

print("\n=== TABLO TAHMİN EŞLEMESİ ===")
keywords = {
    "müşteri": ["musteri", "müşteri", "cari", "customer", "kisi", "kişi", "muster", "carihesap", "hesap"],
    "satış": ["satis", "satış", "fatura", "siparis", "sipariş", "sales", "pos", "kasa", "tahsilat", "odeme", "ödeme"],
    "ürün/stok": ["stok", "urun", "ürün", "malzeme", "envanter", "depo", "stock", "barkod", "marka", "model"],
    "reçete": ["recete", "reçete", "optik", "cam", "sph", "cyl", "aks", "goz", "göz", "lens", "cerceve", "çerçeve"],
}
for table in [r[0] for r in tables]:
    tl = table.lower()
    guesses = []
    for cat, kws in keywords.items():
        if any(k in tl for k in kws):
            guesses.append(cat)
    if guesses:
        print(f"{table}\t→ {', '.join(guesses)}")

conn.close()
