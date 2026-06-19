/**
 * Excel'den Odoo product.template toplu import.
 *
 * Kullanım:
 *   cd backend
 *   npm run import-urun-toplu -- --file "/path/to/dosya.xlsx"
 *   npm run import-urun-toplu -- --file "/path/to/dosya.xlsx" --execute
 *   npm run import-urun-toplu -- --file "/path/to/dosya.xlsx" --execute --batch-size 75
 *
 * Varsayılan: dry-run (Odoo'ya yazmaz, özet rapor verir).
 * --execute olmadan create yapılmaz.
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';

const DEFAULT_FILE =
  '/Users/guvenoptikgorkem/Desktop/Prime 42 25 İnceltme Kırılmaz .xlsx';

const EXPECTED_HEADERS = [
  'urun_kategorisi',
  'urun_adi',
  'satis_kdv_orani',
  'alis_kdv_orani',
] as const;

type ExcelRow = {
  rowNo: number;
  urunKategorisi: string;
  urunAdi: string;
  satisKdvOrani: number;
  alisKdvOrani: number;
};

type ImportStats = {
  toplamSatir: number;
  olusturulan: number;
  atlananMevcut: number;
  hatali: number;
  kategoriOlusturulan: number;
  kategoriMevcut: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let file = DEFAULT_FILE;
  let executeMode = false;
  let batchSize = 50;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--execute') executeMode = true;
    else if (a === '--dry-run') executeMode = false;
    else if (a === '--file' && args[i + 1]) {
      file = args[++i];
    } else if (a === '--batch-size' && args[i + 1]) {
      batchSize = Math.max(1, Math.min(200, Number(args[++i]) || 50));
    } else if (a === '--help' || a === '-h') {
      console.log(`
Excel → Odoo product.template toplu import

Seçenekler:
  --file <path>       Excel dosya yolu (varsayılan: Desktop dosyası)
  --execute           Gerçekten Odoo'ya yazar (yoksa dry-run)
  --dry-run           Sadece rapor (varsayılan)
  --batch-size <n>    Create batch boyutu (varsayılan: 50, max: 200)
`);
      process.exit(0);
    }
  }

  return { file: path.resolve(file), executeMode, batchSize };
}

function parsePathSegments(raw: string): string[] {
  return raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

function categoryKey(parentId: number | false, name: string): string {
  return `${parentId === false ? 'root' : parentId}|${name}`;
}

function productKey(categId: number, name: string): string {
  return `${categId}|${name}`;
}

async function readExcelRows(filePath: string): Promise<ExcelRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel dosyasında sayfa bulunamadı');

  const headerRow = ws.getRow(1);
  const headers = (headerRow.values as Array<string | number | undefined>)
    .slice(1)
    .map((v) => String(v ?? '').trim());

  for (const h of EXPECTED_HEADERS) {
    if (!headers.includes(h)) {
      throw new Error(`Beklenen sütun eksik: "${h}". Bulunan: ${headers.join(', ')}`);
    }
  }

  const colIndex: Record<(typeof EXPECTED_HEADERS)[number], number> = {
    urun_kategorisi: headers.indexOf('urun_kategorisi') + 1,
    urun_adi: headers.indexOf('urun_adi') + 1,
    satis_kdv_orani: headers.indexOf('satis_kdv_orani') + 1,
    alis_kdv_orani: headers.indexOf('alis_kdv_orani') + 1,
  };

  const rows: ExcelRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const urunKategorisi = String(row.getCell(colIndex.urun_kategorisi).value ?? '').trim();
    const urunAdi = String(row.getCell(colIndex.urun_adi).value ?? '').trim();
    if (!urunKategorisi && !urunAdi) continue;

    const satisRaw = row.getCell(colIndex.satis_kdv_orani).value;
    const alisRaw = row.getCell(colIndex.alis_kdv_orani).value;
    const satisKdvOrani = Number(satisRaw ?? 0);
    const alisKdvOrani = Number(alisRaw ?? 0);

    if (!urunKategorisi || !urunAdi) {
      throw new Error(`Satır ${r}: urun_kategorisi ve urun_adi zorunlu`);
    }
    if (!Number.isFinite(satisKdvOrani) || !Number.isFinite(alisKdvOrani)) {
      throw new Error(`Satır ${r}: KDV oranları sayı olmalı`);
    }

    rows.push({
      rowNo: r,
      urunKategorisi,
      urunAdi,
      satisKdvOrani,
      alisKdvOrani,
    });
  }

  return rows;
}

class CategoryResolver {
  private cache = new Map<string, number>();
  private created = 0;
  private reused = 0;

  constructor(private readonly executeMode: boolean) {}

  get stats() {
    return { created: this.created, reused: this.reused };
  }

  async preload(): Promise<void> {
    const cats = await execute('product.category', 'search_read', [[]], {
      fields: ['id', 'name', 'parent_id'],
      limit: 5000,
    });
    for (const c of cats as Array<{ id: number; name: string; parent_id: [number, string] | false }>) {
      const parentId = c.parent_id ? c.parent_id[0] : false;
      this.cache.set(categoryKey(parentId, c.name), c.id);
    }
    console.log(`[kategori] Önbelleğe alındı: ${this.cache.size} kayıt`);
  }

  async resolve(pathStr: string): Promise<number> {
    const segments = parsePathSegments(pathStr);
    if (!segments.length) throw new Error(`Geçersiz kategori yolu: "${pathStr}"`);

    let parentId: number | false = false;

    for (const seg of segments) {
      const key = categoryKey(parentId, seg);
      const cached = this.cache.get(key);
      if (cached) {
        parentId = cached;
        this.reused += 1;
        continue;
      }

      const domain: unknown[] = [['name', '=', seg]];
      domain.push(['parent_id', parentId === false ? '=' : '=', parentId === false ? false : parentId]);

      const found = await execute('product.category', 'search_read', [domain], {
        fields: ['id'],
        limit: 1,
      });

      if (Array.isArray(found) && found.length > 0) {
        const id = found[0].id as number;
        this.cache.set(key, id);
        parentId = id;
        this.reused += 1;
        continue;
      }

      if (!this.executeMode) {
        // Dry-run: sahte pozitif id yerine geçici negatif id (duplicate kontrolü için path bazlı)
        const fakeId = -(this.cache.size + 1000);
        this.cache.set(key, fakeId);
        parentId = fakeId;
        this.created += 1;
        continue;
      }

      const createVals: Record<string, unknown> = { name: seg };
      if (parentId !== false) createVals.parent_id = parentId;

      const newId = await execute('product.category', 'create', [createVals]);
      const id = Number(newId);
      this.cache.set(key, id);
      parentId = id;
      this.created += 1;
    }

    if (typeof parentId !== 'number') {
      throw new Error(`Kategori yolu çözülemedi: "${pathStr}"`);
    }
    return parentId;
  }
}

class TaxResolver {
  private saleCache = new Map<number, number>();
  private purchaseCache = new Map<number, number>();

  async saleTaxId(rate: number): Promise<number | null> {
    if (this.saleCache.has(rate)) return this.saleCache.get(rate)!;
    const taxes = await execute(
      'account.tax',
      'search_read',
      [[['type_tax_use', '=', 'sale'], ['amount', '=', rate], ['active', '=', true]]],
      { fields: ['id', 'name'], limit: 1, order: 'id asc' },
    );
    const id = taxes?.[0]?.id ?? null;
    if (id) this.saleCache.set(rate, id);
    return id;
  }

  async purchaseTaxId(rate: number): Promise<number | null> {
    if (this.purchaseCache.has(rate)) return this.purchaseCache.get(rate)!;
    const taxes = await execute(
      'account.tax',
      'search_read',
      [[['type_tax_use', '=', 'purchase'], ['amount', '=', rate], ['active', '=', true]]],
      { fields: ['id', 'name'], limit: 1, order: 'id asc' },
    );
    const id = taxes?.[0]?.id ?? null;
    if (id) this.purchaseCache.set(rate, id);
    return id;
  }
}

async function findExistingProducts(
  batch: Array<{ categId: number; urunAdi: string }>,
): Promise<Set<string>> {
  const names = [...new Set(batch.map((b) => b.urunAdi))];
  const categIds = [...new Set(batch.map((b) => b.categId))];

  const existing = await execute(
    'product.template',
    'search_read',
    [[['name', 'in', names], ['categ_id', 'in', categIds]]],
    { fields: ['name', 'categ_id'], limit: names.length * categIds.length },
  );

  const set = new Set<string>();
  for (const p of existing as Array<{ name: string; categ_id: [number, string] }>) {
    set.add(productKey(p.categ_id[0], p.name));
  }
  return set;
}

function buildProductVals(
  row: ExcelRow,
  categId: number,
  saleTaxId: number | null,
  purchaseTaxId: number | null,
): Record<string, unknown> {
  const vals: Record<string, unknown> = {
    name: row.urunAdi,
    categ_id: categId,
    type: 'product',
    tracking: 'serial',
    list_price: 0,
    standard_price: 0,
    sale_ok: true,
    purchase_ok: true,
  };
  if (saleTaxId) vals.taxes_id = [[6, 0, [saleTaxId]]];
  if (purchaseTaxId) vals.supplier_taxes_id = [[6, 0, [purchaseTaxId]]];
  return vals;
}

async function main() {
  const { file, executeMode, batchSize } = parseArgs();

  console.log('='.repeat(60));
  console.log('Excel → Odoo product.template toplu import');
  console.log('='.repeat(60));
  console.log(`Dosya      : ${file}`);
  console.log(`Mod        : ${executeMode ? 'EXECUTE (yazılacak)' : 'DRY-RUN (sadece rapor)'}`);
  console.log(`Batch size : ${batchSize}`);
  console.log('');

  const rows = await readExcelRows(file);
  console.log(`Excel satır: ${rows.length}`);

  const stats: ImportStats = {
    toplamSatir: rows.length,
    olusturulan: 0,
    atlananMevcut: 0,
    hatali: 0,
    kategoriOlusturulan: 0,
    kategoriMevcut: 0,
  };

  const categoryResolver = new CategoryResolver(executeMode);
  await categoryResolver.preload();

  const taxResolver = new TaxResolver();
  const uniqueKdvOranlari = [
    ...new Set(rows.flatMap((r) => [r.satisKdvOrani, r.alisKdvOrani])),
  ];
  for (const rate of uniqueKdvOranlari) {
    const saleId = await taxResolver.saleTaxId(rate);
    const purchaseId = await taxResolver.purchaseTaxId(rate);
    console.log(
      `KDV %${rate} → satış: ${saleId ?? 'BULUNAMADI'}, alış: ${purchaseId ?? 'BULUNAMADI'}`,
    );
  }

  const uniquePaths = [...new Set(rows.map((r) => r.urunKategorisi))];
  console.log(`\nBenzersiz kategori yolu: ${uniquePaths.length}`);
  const pathToCategId = new Map<string, number>();
  for (const p of uniquePaths) {
    const categId = await categoryResolver.resolve(p);
    pathToCategId.set(p, categId);
  }

  const catStats = categoryResolver.stats;
  stats.kategoriOlusturulan = catStats.created;
  stats.kategoriMevcut = catStats.reused;

  const prepared: Array<{
    row: ExcelRow;
    categId: number;
    vals: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    const categId = pathToCategId.get(row.urunKategorisi)!;
    const saleTaxId = await taxResolver.saleTaxId(row.satisKdvOrani);
    const purchaseTaxId = await taxResolver.purchaseTaxId(row.alisKdvOrani);

    if (!saleTaxId || !purchaseTaxId) {
      console.warn(
        `[UYARI] Satır ${row.rowNo}: KDV bulunamadı (satış %${row.satisKdvOrani}, alış %${row.alisKdvOrani}) — vergi alanı boş bırakılacak`,
      );
    }

    prepared.push({
      row,
      categId,
      vals: buildProductVals(row, categId, saleTaxId, purchaseTaxId),
    });
  }

  console.log('\nÜrün import başlıyor...\n');

  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = prepared.slice(i, i + batchSize);
    const end = Math.min(i + batchSize, prepared.length);

    try {
      const existingKeys = await findExistingProducts(
        batch
          .filter((b) => b.categId > 0)
          .map((b) => ({ categId: b.categId, urunAdi: b.row.urunAdi })),
      );

      const toCreate = batch.filter((b) => {
        const key = productKey(b.categId, b.row.urunAdi);
        if (existingKeys.has(key)) {
          stats.atlananMevcut += 1;
          console.log(`  [ATLA] Satır ${b.row.rowNo}: zaten var — "${b.row.urunAdi}"`);
          return false;
        }
        return true;
      });

      if (!toCreate.length) {
        console.log(`[${end}/${prepared.length}] Batch atlandı (tümü mevcut)`);
        continue;
      }

      if (executeMode) {
        const valsList = toCreate.map((b) => b.vals);
        await execute('product.template', 'create', [valsList]);
        stats.olusturulan += toCreate.length;
      } else {
        stats.olusturulan += toCreate.length;
        if (i === 0) {
          const sample = toCreate.slice(0, 2);
          console.log('  [DRY-RUN örnek oluşturulacak kayıtlar]:');
          for (const s of sample) {
            console.log(`    - ${s.row.urunAdi} (kategori id: ${s.categId})`);
          }
        }
      }

      console.log(
        `[${end}/${prepared.length}] ${executeMode ? 'Oluşturuldu' : 'Oluşturulacak'}: ${toCreate.length}, atlanan: ${batch.length - toCreate.length}`,
      );
    } catch (err) {
      stats.hatali += batch.length;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HATA] Batch ${i + 1}-${end}: ${msg}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ÖZET RAPOR');
  console.log('='.repeat(60));
  console.log(`Toplam Excel satırı     : ${stats.toplamSatir}`);
  console.log(
    `${executeMode ? 'Oluşturulan ürün' : 'Oluşturulacak ürün'}      : ${stats.olusturulan}`,
  );
  console.log(`Zaten vardı (atlandı)   : ${stats.atlananMevcut}`);
  console.log(`Hatalı batch satırı     : ${stats.hatali}`);
  console.log(`Kategori yeni/mevcut    : ${stats.kategoriOlusturulan} / ${stats.kategoriMevcut} (çözüm adımı)`);
  console.log('='.repeat(60));

  if (!executeMode) {
    console.log('\nGerçek import için: npm run import-urun-toplu -- --file "<path>" --execute');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
