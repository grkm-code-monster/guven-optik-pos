/**
 * PRİME cam ürünlerinde tracking: lot → serial düzeltmesi.
 *
 * Kullanım:
 *   cd backend
 *   npm run fix-tracking-serial
 *   npm run fix-tracking-serial -- --execute
 *   npm run fix-tracking-serial -- --execute --batch-size 100
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TARGET_CATEGORY_PATHS = [
  'All / OPTİK CAM / STOK CAM / BEYAZ / PRİME',
  'All / OPTİK CAM / STOK CAM / FOTOKROMİK / PRİME',
] as const;

type ProductTemplate = {
  id: number;
  name: string;
  tracking: string;
  categ_id: [number, string];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let executeMode = false;
  let batchSize = 50;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--execute') executeMode = true;
    else if (a === '--dry-run') executeMode = false;
    else if (a === '--batch-size' && args[i + 1]) {
      batchSize = Math.max(1, Math.min(500, Number(args[++i]) || 50));
    } else if (a === '--help' || a === '-h') {
      console.log(`
PRİME cam ürünleri tracking düzeltmesi (lot → serial)

Seçenekler:
  --execute           Odoo'ya yazar (varsayılan: dry-run)
  --dry-run           Sadece rapor (varsayılan)
  --batch-size <n>    Write batch boyutu (varsayılan: 50)
`);
      process.exit(0);
    }
  }

  return { executeMode, batchSize };
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

async function loadCategoryCache(): Promise<Map<string, number>> {
  const cats = await execute('product.category', 'search_read', [[]], {
    fields: ['id', 'name', 'parent_id', 'complete_name'],
    limit: 5000,
  });

  const cache = new Map<string, number>();
  for (const c of cats as Array<{
    id: number;
    name: string;
    parent_id: [number, string] | false;
    complete_name?: string;
  }>) {
    const parentId = c.parent_id ? c.parent_id[0] : false;
    cache.set(categoryKey(parentId, c.name), c.id);
    if (c.complete_name) {
      cache.set(`complete:${c.complete_name.trim()}`, c.id);
    }
  }
  return cache;
}

async function resolveCategoryId(
  pathStr: string,
  cache: Map<string, number>,
): Promise<number> {
  const byComplete = cache.get(`complete:${pathStr.trim()}`);
  if (byComplete) return byComplete;

  const segments = parsePathSegments(pathStr);
  let parentId: number | false = false;

  for (const seg of segments) {
    const key = categoryKey(parentId, seg);
    const id = cache.get(key);
    if (!id) {
      throw new Error(`Kategori bulunamadı: "${seg}" (yol: ${pathStr})`);
    }
    parentId = id;
  }

  if (typeof parentId !== 'number') {
    throw new Error(`Kategori yolu çözülemedi: "${pathStr}"`);
  }
  return parentId;
}

async function fetchTemplatesInCategories(categIds: number[]): Promise<ProductTemplate[]> {
  const templateIds = (await execute('product.template', 'search', [
    [['categ_id', 'in', categIds]],
  ])) as number[];

  if (!templateIds.length) return [];

  const chunkSize = 500;
  const templates: ProductTemplate[] = [];

  for (let i = 0; i < templateIds.length; i += chunkSize) {
    const chunk = templateIds.slice(i, i + chunkSize);
    const rows = (await execute('product.template', 'read', [chunk], {
      fields: ['id', 'name', 'tracking', 'categ_id'],
    })) as ProductTemplate[];
    templates.push(...rows);
  }

  return templates;
}

async function assertNoStockActivity(templateIds: number[]): Promise<void> {
  if (!templateIds.length) return;

  const variants = (await execute('product.product', 'search_read', [
    [['product_tmpl_id', 'in', templateIds]],
  ], {
    fields: ['id'],
    limit: templateIds.length * 2,
  })) as Array<{ id: number }>;

  const variantIds = variants.map((v) => v.id);
  if (!variantIds.length) {
    console.log('[stok kontrol] Varyant bulunamadı — devam ediliyor');
    return;
  }

  const quantCount = (await execute('stock.quant', 'search_count', [
    [['product_id', 'in', variantIds]],
  ])) as number;

  const moveCount = (await execute('stock.move', 'search_count', [
    [['product_id', 'in', variantIds]],
  ])) as number;

  console.log(`[stok kontrol] stock.quant kaydı: ${quantCount}`);
  console.log(`[stok kontrol] stock.move kaydı: ${moveCount}`);

  if (quantCount > 0 || moveCount > 0) {
    throw new Error(
      `Stok aktivitesi tespit edildi (quant: ${quantCount}, move: ${moveCount}). ` +
        'Tracking değişikliği güvenli değil — işlem durduruldu.',
    );
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function main() {
  const { executeMode, batchSize } = parseArgs();

  console.log('='.repeat(60));
  console.log('Tracking düzeltmesi: lot → serial');
  console.log('='.repeat(60));
  console.log(`Mod        : ${executeMode ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`Batch size : ${batchSize}`);
  console.log('');

  const cache = await loadCategoryCache();
  const categIds: number[] = [];

  for (const path of TARGET_CATEGORY_PATHS) {
    const id = await resolveCategoryId(path, cache);
    categIds.push(id);
    console.log(`Kategori: ${path} → id ${id}`);
  }

  const templates = await fetchTemplatesInCategories(categIds);
  console.log(`\nBulunan product.template: ${templates.length}`);

  const alreadySerial = templates.filter((t) => t.tracking === 'serial');
  const needsUpdate = templates.filter((t) => t.tracking !== 'serial');
  const otherTracking = templates.filter(
    (t) => t.tracking !== 'serial' && t.tracking !== 'lot',
  );

  console.log(`  Zaten serial : ${alreadySerial.length}`);
  console.log(`  Güncellenecek: ${needsUpdate.length}`);
  if (otherTracking.length) {
    console.log(
      `  Diğer tracking değerleri: ${otherTracking.map((t) => `${t.id}=${t.tracking}`).slice(0, 5).join(', ')}${otherTracking.length > 5 ? '...' : ''}`,
    );
  }

  if (!needsUpdate.length) {
    console.log('\nGüncellenecek ürün yok.');
    return;
  }

  await assertNoStockActivity(templates.map((t) => t.id));
  console.log('[stok kontrol] Temiz — devam ediliyor\n');

  let updated = 0;
  let errors = 0;
  const idsToUpdate = needsUpdate.map((t) => t.id);

  for (const batch of chunk(idsToUpdate, batchSize)) {
    try {
      if (executeMode) {
        await execute('product.template', 'write', [batch, { tracking: 'serial' }]);
      }
      updated += batch.length;
      console.log(`[${updated}/${idsToUpdate.length}] ${executeMode ? 'Güncellendi' : 'Güncellenecek'}: ${batch.length}`);
    } catch (err) {
      errors += batch.length;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HATA] Batch (${batch.length} ürün): ${msg}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ÖZET RAPOR');
  console.log('='.repeat(60));
  console.log(`Toplam ürün (2 kategori)  : ${templates.length}`);
  console.log(`Zaten serial              : ${alreadySerial.length}`);
  console.log(`${executeMode ? 'Güncellenen' : 'Güncellenecek'}           : ${updated}`);
  console.log(`Hatalı batch              : ${errors}`);
  console.log('='.repeat(60));

  if (!executeMode) {
    console.log('\nGerçek güncelleme için: npm run fix-tracking-serial -- --execute');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
