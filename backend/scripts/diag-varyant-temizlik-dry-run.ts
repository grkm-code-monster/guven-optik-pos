/**
 * FAZ 2 dry-run: always-modlu şablonlardaki gereksiz varyantları listele (SİLMEZ).
 * Çalıştır: npx tsx scripts/diag-varyant-temizlik-dry-run.ts [--out dosya.json]
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { execute } from '../src/modules/odoo/odoo.service';

const prisma = new PrismaClient();

type VariantRow = {
  id: number;
  display_name: string;
  default_code: string | false;
  barcode: string | false;
  product_tmpl_id: [number, string];
};

type KorumaSebep =
  | 'stok'
  | 'barkod'
  | 'icReferans'
  | 'satis'
  | 'stokHareket'
  | 'fatura'
  | 'satinalma'
  | 'optikPosSaleItem';

type VariantSinif = {
  odooId: number;
  displayName: string;
  tmplId: number;
  tmplName: string;
  sinif: 'silinebilir' | 'korunmali';
  sebepler: KorumaSebep[];
  optikPosSaleItemCount: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getAlwaysTemplateIds(): Promise<number[]> {
  const alwaysAttrs = await execute(
    'product.attribute', 'search_read',
    [[['create_variant', '=', 'always']]],
    { fields: ['id'], limit: 500 },
  ) as { id: number }[];
  const alwaysAttrIds = alwaysAttrs.map((a) => a.id);
  if (!alwaysAttrIds.length) return [];

  const lines = await execute(
    'product.template.attribute.line', 'search_read',
    [[['attribute_id', 'in', alwaysAttrIds]]],
    { fields: ['product_tmpl_id'], limit: 10000 },
  ) as { product_tmpl_id: [number, string] }[];

  return [...new Set(lines.map((l) => l.product_tmpl_id[0]))];
}

async function getStockByProduct(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const batch of chunk(ids, 200)) {
    const quants = await execute(
      'stock.quant', 'search_read',
      [[['product_id', 'in', batch], ['quantity', '>', 0]]],
      { fields: ['product_id', 'quantity'], limit: 50000 },
    ) as { product_id: [number, string]; quantity: number }[];
    for (const q of quants) {
      const pid = q.product_id[0];
      map.set(pid, (map.get(pid) ?? 0) + Number(q.quantity));
    }
  }
  return map;
}

async function getUsedProductIds(ids: number[], model: string): Promise<Set<number>> {
  const used = new Set<number>();
  for (const batch of chunk(ids, 200)) {
    const rows = await execute(
      model, 'search_read',
      [[['product_id', 'in', batch]]],
      { fields: ['product_id'], limit: 50000 },
    ) as { product_id: [number, string] }[];
    for (const r of rows) used.add(r.product_id[0]);
  }
  return used;
}

async function getOptikPosRefCounts(variantIds: Set<string>): Promise<Map<string, number>> {
  const saleItems = await prisma.saleItem.findMany({
    where: { odooProductId: { not: null } },
    select: { odooProductId: true },
  });
  const map = new Map<string, number>();
  for (const s of saleItems) {
    const id = String(s.odooProductId);
    if (!variantIds.has(id)) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

async function analyzeTemplate(
  tmplId: number,
  optikPosRefs: Map<string, number>,
): Promise<VariantSinif[]> {
  const [tmpl] = await execute(
    'product.template', 'read', [[tmplId]],
    { fields: ['id', 'name'] },
  ) as { id: number; name: string }[];

  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    { fields: ['id', 'display_name', 'default_code', 'barcode', 'product_tmpl_id'], limit: 5000 },
  ) as VariantRow[];

  const ids = variants.map((v) => v.id);
  const stockMap = await getStockByProduct(ids);
  const saleUsed = await getUsedProductIds(ids, 'sale.order.line');
  const moveUsed = await getUsedProductIds(ids, 'stock.move.line');
  const invUsed = await getUsedProductIds(ids, 'account.move.line');
  const poUsed = await getUsedProductIds(ids, 'purchase.order.line');

  return variants.map((v) => {
    const sebepler: KorumaSebep[] = [];
    const stok = stockMap.get(v.id) ?? 0;
    if (stok > 0) sebepler.push('stok');
    if (v.default_code) sebepler.push('icReferans');
    if (v.barcode) sebepler.push('barkod');
    if (saleUsed.has(v.id)) sebepler.push('satis');
    if (moveUsed.has(v.id)) sebepler.push('stokHareket');
    if (invUsed.has(v.id)) sebepler.push('fatura');
    if (poUsed.has(v.id)) sebepler.push('satinalma');

    const optikPosSaleItemCount = optikPosRefs.get(String(v.id)) ?? 0;
    if (optikPosSaleItemCount > 0) sebepler.push('optikPosSaleItem');

    const korunmali = sebepler.length > 0;
    return {
      odooId: v.id,
      displayName: v.display_name,
      tmplId: tmpl.id,
      tmplName: tmpl.name,
      sinif: korunmali ? 'korunmali' : 'silinebilir',
      sebepler,
      optikPosSaleItemCount,
    };
  });
}

async function main() {
  const outArgIdx = process.argv.indexOf('--out');
  const outPath = outArgIdx >= 0 ? resolve(process.argv[outArgIdx + 1]) : null;

  console.log('=== FAZ 2 Dry-Run: Varyant Temizlik Listesi (salt okuma) ===\n');

  const tmplIds = await getAlwaysTemplateIds();
  if (!tmplIds.length) {
    console.log('Always nitelikli şablon bulunamadı.');
    await prisma.$disconnect();
    return;
  }

  const allVariantIdStr = new Set<string>();
  for (const tmplId of tmplIds) {
    const ids = await execute('product.product', 'search', [[['product_tmpl_id', '=', tmplId]]]) as number[];
    ids.forEach((id) => allVariantIdStr.add(String(id)));
  }
  const optikPosRefs = await getOptikPosRefCounts(allVariantIdStr);

  const byTemplate: Record<number, {
    tmplId: number;
    tmplName: string;
    toplam: number;
    silinebilir: number;
    korunmali: number;
    silinebilirIds: number[];
    korunmaliDetay: VariantSinif[];
  }> = {};

  const tumKayitlar: VariantSinif[] = [];

  for (const tmplId of tmplIds) {
    process.stderr.write(`Analiz: şablon ${tmplId}...\n`);
    const rows = await analyzeTemplate(tmplId, optikPosRefs);
    tumKayitlar.push(...rows);

    const silinebilir = rows.filter((r) => r.sinif === 'silinebilir');
    const korunmali = rows.filter((r) => r.sinif === 'korunmali');
    byTemplate[tmplId] = {
      tmplId,
      tmplName: rows[0]?.tmplName ?? String(tmplId),
      toplam: rows.length,
      silinebilir: silinebilir.length,
      korunmali: korunmali.length,
      silinebilirIds: silinebilir.map((r) => r.odooId),
      korunmaliDetay: korunmali,
    };
  }

  const silinebilirToplam = tumKayitlar.filter((r) => r.sinif === 'silinebilir');
  const korunmaliToplam = tumKayitlar.filter((r) => r.sinif === 'korunmali');

  const rapor = {
    generatedAt: new Date().toISOString(),
    odooVersionHint: '17.x',
    not: 'Bu dosya dry-run çıktısıdır; hiçbir Odoo kaydı silinmedi.',
    ozet: {
      sablonSayisi: tmplIds.length,
      toplamVaryant: tumKayitlar.length,
      silinebilir: silinebilirToplam.length,
      korunmali: korunmaliToplam.length,
      optikPosReferansliVaryantSayisi: korunmaliToplam.filter((r) => r.optikPosSaleItemCount > 0).length,
    },
    sablonlar: Object.values(byTemplate).map((s) => ({
      tmplId: s.tmplId,
      tmplName: s.tmplName,
      toplam: s.toplam,
      silinebilir: s.silinebilir,
      korunmali: s.korunmali,
    })),
    korunmaliVaryantlar: korunmaliToplam.map((r) => ({
      odooId: r.odooId,
      displayName: r.displayName,
      tmplId: r.tmplId,
      tmplName: r.tmplName,
      sebepler: r.sebepler,
      optikPosSaleItemCount: r.optikPosSaleItemCount,
    })),
    silinebilirIdsByTemplate: Object.fromEntries(
      Object.values(byTemplate).map((s) => [String(s.tmplId), s.silinebilirIds]),
    ),
    silinebilirIdsFlat: silinebilirToplam.map((r) => r.odooId),
  };

  console.log('ÖZET');
  console.log(`  Şablon: ${rapor.ozet.sablonSayisi}`);
  console.log(`  Toplam varyant: ${rapor.ozet.toplamVaryant}`);
  console.log(`  Silinebilir: ${rapor.ozet.silinebilir}`);
  console.log(`  Korunmalı: ${rapor.ozet.korunmali}`);
  console.log(`  Optik-POS referanslı korunan: ${rapor.ozet.optikPosReferansliVaryantSayisi}`);
  console.log('\nŞABLON DETAY');
  for (const s of rapor.sablonlar) {
    console.log(`  [${s.tmplId}] ${s.tmplName}: ${s.silinebilir}/${s.toplam} silinebilir`);
  }
  console.log('\nKORUNMALI VARYANTLAR');
  for (const k of rapor.korunmaliVaryantlar) {
    console.log(`  #${k.odooId} ${k.displayName} — ${k.sebepler.join(', ')} (POS: ${k.optikPosSaleItemCount})`);
  }

  const defaultOut = resolve(
    process.cwd(),
    `varyant-temizlik-dry-run-${Date.now()}.json`,
  );
  const hedef = outPath ?? defaultOut;
  writeFileSync(hedef, JSON.stringify(rapor, null, 2), 'utf8');
  console.log(`\nJSON export: ${hedef}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
