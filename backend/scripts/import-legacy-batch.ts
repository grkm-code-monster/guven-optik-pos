/**
 * Legacy batch CSV → PostgreSQL Legacy* tabloları
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node --transpile-only scripts/import-legacy-batch.ts --batch=1
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/database/prisma';

const EXPORT_DIR = '/Users/guvenoptikgorkem/Desktop/siber-optik-export';

function parseBatchNum(): number {
  const arg = process.argv.find((a) => a.startsWith('--batch='));
  if (!arg) return 1;
  const n = Number.parseInt(arg.split('=')[1] ?? '1', 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`Geçersiz --batch değeri: ${arg}`);
  }
  return n;
}

type CsvRow = Record<string, string>;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = '';
  };

  const pushRow = () => {
    pushCell();
    if (row.length > 1 || row[0] !== '' || rows.length === 0) {
      rows.push(row);
    }
    row = [];
  };

  const text = content.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // ignore, handled by \n
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

function loadCsv(fileName: string): CsvRow[] {
  const filePath = path.join(EXPORT_DIR, fileName);
  const raw = readFileSync(filePath, 'utf8');
  const table = parseCsv(raw);
  if (table.length <= 1) return [];
  const headers = table[0];
  return table.slice(1).filter((cells) => cells.some((c) => c.trim() !== '')).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function emptyToNull(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

function parseDate(v: string | undefined): Date | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDecimal(v: string | undefined): Prisma.Decimal | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : new Prisma.Decimal(n);
}

/** Decimal(5,2) — geçersiz/overflow değerleri null yap (örn. 4075.0) */
function parsePrescriptionDecimal(v: string | undefined): Prisma.Decimal | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n) || Math.abs(n) >= 1000) return null;
  return new Prisma.Decimal(n);
}

function parseIntOrNull(v: string | undefined): number | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

async function main() {
  const batchNum = parseBatchNum();
  const prefix = `batch${batchNum}`;
  const customers = loadCsv(`${prefix}_musteri.csv`);
  const sales = loadCsv(`${prefix}_satis.csv`);
  const prescriptions = loadCsv(`${prefix}_recete.csv`);

  console.log(
    `[batch ${batchNum}] CSV yüklendi: ${customers.length} müşteri, ${sales.length} satış kalemi, ${prescriptions.length} reçete`,
  );

  if (customers.length === 0) {
    console.log(`[batch ${batchNum}] Boş parti — atlanıyor.`);
    return;
  }

  const stats = {
    customersCreated: 0,
    customersSkipped: 0,
    salesCreated: 0,
    salesSkipped: 0,
    itemsCreated: 0,
    prescriptionsCreated: 0,
    prescriptionsSkipped: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      const customerIdBySiber = new Map<number, string>();

      for (const row of customers) {
        const siberId = Number.parseInt(row.IdCariHesap, 10);
        const existing = await tx.legacyCustomer.findUnique({
          where: { siberCariHesapId: siberId },
        });
        if (existing) {
          customerIdBySiber.set(siberId, existing.id);
          stats.customersSkipped++;
          continue;
        }

        const kaynakSube =
          emptyToNull(row.SubeAdi) ?? emptyToNull(row.SubeIdStr) ?? emptyToNull(row.SubeId);

        const created = await tx.legacyCustomer.create({
          data: {
            siberCariHesapId: siberId,
            ad: emptyToNull(row.Ad),
            soyad: emptyToNull(row.Soyad),
            telefon1: emptyToNull(row.Telefon1),
            cepTelefon: emptyToNull(row.CepTelefon),
            tcKimlikNo: emptyToNull(row.TcKimlikNo),
            adres: emptyToNull(row.Adres),
            email: emptyToNull(row.Email),
            dogumTarihi: parseDate(row.DogumTar),
            kaynakSube,
          },
        });
        customerIdBySiber.set(siberId, created.id);
        stats.customersCreated++;
      }

      const saleIdBySiber = new Map<number, string>();
      const salesByHeader = new Map<number, CsvRow[]>();

      for (const row of sales) {
        const siberSaleId = Number.parseInt(row.IdStokHrk, 10);
        if (!salesByHeader.has(siberSaleId)) {
          salesByHeader.set(siberSaleId, []);
        }
        salesByHeader.get(siberSaleId)!.push(row);
      }

      for (const [siberSaleId, lines] of salesByHeader) {
        const header = lines[0];
        const siberCustomerId = Number.parseInt(header.CariHesapId, 10);
        const legacyCustomerId = customerIdBySiber.get(siberCustomerId);
        if (!legacyCustomerId) {
          console.warn(`Satış atlandı (müşteri yok): StokHrk ${siberSaleId}`);
          continue;
        }

        const existingSale = await tx.legacySale.findUnique({
          where: { siberStokHrkId: siberSaleId },
        });

        let legacySaleId: string;
        if (existingSale) {
          legacySaleId = existingSale.id;
          saleIdBySiber.set(siberSaleId, legacySaleId);
          stats.salesSkipped++;
        } else {
          const tarih = parseDate(header.Tarih);
          const subeKodu = emptyToNull(header.SubeId) ?? emptyToNull(header.SubeId);
          const createdSale = await tx.legacySale.create({
            data: {
              siberStokHrkId: siberSaleId,
              legacyCustomerId,
              tarih,
              toplamTutar: parseDecimal(header.GenelToplam),
              subeKodu,
            },
          });
          legacySaleId = createdSale.id;
          saleIdBySiber.set(siberSaleId, legacySaleId);
          stats.salesCreated++;
        }

        const existingItemCount = await tx.legacySaleItem.count({
          where: { legacySaleId },
        });
        if (existingItemCount >= lines.length) {
          continue;
        }

        for (const line of lines.slice(existingItemCount)) {
          await tx.legacySaleItem.create({
            data: {
              legacySaleId,
              urunAdi: emptyToNull(line.UrunAdi),
              miktar: parseDecimal(line.Miktar),
              fiyat: parseDecimal(line.Fiyat),
            },
          });
          stats.itemsCreated++;
        }
      }

      for (const row of prescriptions) {
        const siberCustomerId = Number.parseInt(row.CariHesapId, 10);
        const legacyCustomerId = customerIdBySiber.get(siberCustomerId);
        if (!legacyCustomerId) continue;

        const siberStokHrkId = parseIntOrNull(row.StokHrkId);
        if (siberStokHrkId != null) {
          const dup = await tx.legacyPrescription.findFirst({
            where: { legacyCustomerId, siberStokHrkId },
          });
          if (dup) {
            stats.prescriptionsSkipped++;
            continue;
          }
        }

        const tarih = parseDate(row.SatisTarih) ?? parseDate(row.ReceteTarih);

        await tx.legacyPrescription.create({
          data: {
            siberStokHrkId,
            legacyCustomerId,
            tarih,
            r_sph: parsePrescriptionDecimal(row.URsph),
            r_cyl: parsePrescriptionDecimal(row.URcyl),
            r_aks: parseIntOrNull(row.URaxis),
            l_sph: parsePrescriptionDecimal(row.ULsph),
            l_cyl: parsePrescriptionDecimal(row.ULcyl),
            l_aks: parseIntOrNull(row.ULaxis),
            near_r_sph: parsePrescriptionDecimal(row.YRsph),
            near_r_cyl: parsePrescriptionDecimal(row.YRcyl),
            near_l_sph: parsePrescriptionDecimal(row.YLsph),
            near_l_cyl: parsePrescriptionDecimal(row.YLcyl),
          },
        });
        stats.prescriptionsCreated++;
      }
    },
    { timeout: 600_000 },
  );

  console.log(`[batch ${batchNum}] Import tamamlandı:`, stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
