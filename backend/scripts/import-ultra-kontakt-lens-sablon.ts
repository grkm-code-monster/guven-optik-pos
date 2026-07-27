/**
 * ULTRA KONTAKT LENS serisi — 37 product.template (varyantsız, lot takipli).
 *
 * Kullanım:
 *   cd backend
 *   npx tsx scripts/import-ultra-kontakt-lens-sablon.ts           # dry-run
 *   npx tsx scripts/import-ultra-kontakt-lens-sablon.ts --execute # Odoo'ya yazar
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const KATEGORI_TAM_AD = 'All / LENS / STANDART';
const SATIS_KDV = 10;

const URUNLER: Array<{ ad: string; barkod: string }> = [
  { ad: 'ULTRA KONTAKT LENS 0000', barkod: '' },
  { ad: 'ULTRA KONTAKT LENS -0025', barkod: '' },
  { ad: 'ULTRA KONTAKT LENS -0050', barkod: '' },
  { ad: 'ULTRA KONTAKT LENS -0075', barkod: '' },
  { ad: 'ULTRA KONTAKT LENS -0100', barkod: '785811314545' },
  { ad: 'ULTRA KONTAKT LENS -0125', barkod: '785811314552' },
  { ad: 'ULTRA KONTAKT LENS -0150', barkod: '785811314569' },
  { ad: 'ULTRA KONTAKT LENS -0175', barkod: '785811314576' },
  { ad: 'ULTRA KONTAKT LENS -0200', barkod: '785811314583' },
  { ad: 'ULTRA KONTAKT LENS -0225', barkod: '785811314590' },
  { ad: 'ULTRA KONTAKT LENS -0250', barkod: '785811314606' },
  { ad: 'ULTRA KONTAKT LENS -0275', barkod: '785812139741' },
  { ad: 'ULTRA KONTAKT LENS -0300', barkod: '785812139758' },
  { ad: 'ULTRA KONTAKT LENS -0325', barkod: '785812139765' },
  { ad: 'ULTRA KONTAKT LENS -0350', barkod: '785811314644' },
  { ad: 'ULTRA KONTAKT LENS -0375', barkod: '785811314651' },
  { ad: 'ULTRA KONTAKT LENS -0400', barkod: '785811314668' },
  { ad: 'ULTRA KONTAKT LENS -0425', barkod: '785811314675' },
  { ad: 'ULTRA KONTAKT LENS -0450', barkod: '785811314682' },
  { ad: 'ULTRA KONTAKT LENS -0475', barkod: '785811314699' },
  { ad: 'ULTRA KONTAKT LENS -0500', barkod: '785811314705' },
  { ad: 'ULTRA KONTAKT LENS -0525', barkod: '785811314712' },
  { ad: 'ULTRA KONTAKT LENS -0550', barkod: '785811314729' },
  { ad: 'ULTRA KONTAKT LENS -0575', barkod: '785812139864' },
  { ad: 'ULTRA KONTAKT LENS -0600', barkod: '785811314743' },
  { ad: 'ULTRA KONTAKT LENS -0650', barkod: '785811314750' },
  { ad: 'ULTRA KONTAKT LENS -0700', barkod: '785811314767' },
  { ad: 'ULTRA KONTAKT LENS -0750', barkod: '785811314774' },
  { ad: 'ULTRA KONTAKT LENS -0800', barkod: '785811314781' },
  { ad: 'ULTRA KONTAKT LENS -0850', barkod: '' },
  { ad: 'ULTRA KONTAKT LENS -0900', barkod: '785811314804' },
  { ad: 'ULTRA KONTAKT LENS -0950', barkod: '785811314811' },
  { ad: 'ULTRA KONTAKT LENS -1000', barkod: '785811314828' },
  { ad: 'ULTRA KONTAKT LENS -1050', barkod: '785812139963' },
  { ad: 'ULTRA KONTAKT LENS -1100', barkod: '785812139970' },
  { ad: 'ULTRA KONTAKT LENS -1150', barkod: '785812139987' },
  { ad: 'ULTRA KONTAKT LENS -1200', barkod: '785811314866' },
];

type RowResult =
  | { status: 'created'; tmplId: number; ad: string }
  | { status: 'skipped-duplicate'; tmplId: number; ad: string; reason: string }
  | { status: 'dry-run'; ad: string }
  | { status: 'error'; ad: string; error: string };

async function resolveKategoriId(): Promise<number> {
  const rows = await execute(
    'product.category',
    'search_read',
    [[['complete_name', '=', KATEGORI_TAM_AD]]],
    { fields: ['id', 'complete_name'], limit: 1 },
  );
  if (!rows?.length) {
    throw new Error(`Kategori bulunamadı: "${KATEGORI_TAM_AD}" — lütfen Odoo'da kontrol edin.`);
  }
  return Number(rows[0].id);
}

async function resolveSatisVergiId(): Promise<number> {
  const taxes = await execute(
    'account.tax',
    'search_read',
    [[['type_tax_use', '=', 'sale'], ['amount', '=', SATIS_KDV], ['active', '=', true]]],
    { fields: ['id', 'name', 'amount'], limit: 1, order: 'id asc' },
  );
  if (!taxes?.length) {
    throw new Error(`Satış KDV %${SATIS_KDV} vergisi bulunamadı — lütfen Odoo'da kontrol edin.`);
  }
  return Number(taxes[0].id);
}

async function findExistingTemplate(ad: string, barkod: string): Promise<{ id: number; reason: string } | null> {
  const byName = await execute(
    'product.template',
    'search_read',
    [[['name', '=', ad]]],
    { fields: ['id', 'name', 'barcode'], limit: 1 },
  );
  if (byName?.length) {
    return { id: Number(byName[0].id), reason: 'name' };
  }

  if (barkod) {
    const byBarcode = await execute(
      'product.template',
      'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'name', 'barcode'], limit: 1 },
    );
    if (byBarcode?.length) {
      return { id: Number(byBarcode[0].id), reason: 'barcode' };
    }
  }

  return null;
}

function buildTemplateVals(
  ad: string,
  barkod: string,
  categId: number,
  taxId: number,
): Record<string, unknown> {
  return {
    name: ad,
    type: 'product',
    categ_id: categId,
    list_price: 0,
    standard_price: 0,
    default_code: false,
    barcode: barkod || false,
    sale_ok: true,
    purchase_ok: true,
    can_be_expensed: false,
    invoice_policy: 'order',
    tracking: 'lot',
    taxes_id: [[6, 0, [taxId]]],
  };
}

async function main() {
  const executeMode = process.argv.includes('--execute');

  console.log('='.repeat(60));
  console.log('ULTRA KONTAKT LENS — product.template import');
  console.log(`Mod: ${executeMode ? 'EXECUTE (Odoo yazılacak)' : 'DRY-RUN (sadece kontrol)'}`);
  console.log(`Kayıt sayısı: ${URUNLER.length}`);
  console.log('='.repeat(60));

  const categId = await resolveKategoriId();
  const taxId = await resolveSatisVergiId();
  console.log(`Kategori: ${KATEGORI_TAM_AD} (id=${categId})`);
  console.log(`Satış vergisi: %${SATIS_KDV} (id=${taxId})\n`);

  const results: RowResult[] = [];

  for (const row of URUNLER) {
    const ad = row.ad.trim();
    const barkod = row.barkod.trim();

    try {
      const existing = await findExistingTemplate(ad, barkod);
      if (existing) {
        results.push({
          status: 'skipped-duplicate',
          tmplId: existing.id,
          ad,
          reason: existing.reason,
        });
        console.log(`[ATLA] ${ad} — mevcut #${existing.id} (${existing.reason})`);
        continue;
      }

      if (!executeMode) {
        results.push({ status: 'dry-run', ad });
        console.log(`[DRY]  ${ad}${barkod ? ` (${barkod})` : ' (barkodsuz)'}`);
        continue;
      }

      const tmplId = Number(
        await execute(
          'product.template',
          'create',
          [buildTemplateVals(ad, barkod, categId, taxId)],
        ),
      );
      results.push({ status: 'created', tmplId, ad });
      console.log(`[OK]   ${ad} → #${tmplId}${barkod ? ` (${barkod})` : ' (barkodsuz)'}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ status: 'error', ad, error });
      console.error(`[HATA] ${ad}: ${error}`);
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped-duplicate').length;
  const dryRun = results.filter((r) => r.status === 'dry-run').length;
  const errors = results.filter((r) => r.status === 'error');

  console.log('\n' + '='.repeat(60));
  console.log('ÖZET');
  console.log('='.repeat(60));
  if (executeMode) {
    console.log(`Oluşturuldu       : ${created}`);
    console.log(`Atlandı (mevcut)  : ${skipped}`);
    console.log(`Hata              : ${errors.length}`);
  } else {
    console.log(`Oluşturulacak     : ${dryRun}`);
    console.log(`Atlandı (mevcut)  : ${skipped}`);
    console.log(`Hata              : ${errors.length}`);
    console.log('\nGerçek import için: npx tsx scripts/import-ultra-kontakt-lens-sablon.ts --execute');
  }

  if (errors.length) {
    console.log('\nHatalı kayıtlar:');
    for (const e of errors) {
      console.log(`  - ${e.ad}: ${e.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
