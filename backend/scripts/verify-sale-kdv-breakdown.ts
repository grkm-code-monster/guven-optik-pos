/**
 * Satış KDV kırılımını doğrular (DB'ye yazmaz).
 * Kullanım: npx ts-node scripts/verify-sale-kdv-breakdown.ts a3264f6b
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { readProductSaleTaxRate } from '../src/modules/odoo/odoo-tax.util';
import { calcInclusiveLineAmounts, resolveSaleItemTaxRate, splitInclusiveVat } from '../src/modules/sales/sale-tax.util';

const SALE_PREFIX = process.argv[2] ?? 'a3264f6b';

async function main() {
  const sale = await prisma.sale.findFirst({
    where: { id: { startsWith: SALE_PREFIX } },
    include: {
      items: {
        where: { status: { not: 'VOID' } },
        include: { product: { select: { taxRate: true, name: true } } },
      },
    },
  });
  if (!sale) {
    console.error('Satış bulunamadı:', SALE_PREFIX);
    process.exit(1);
  }

  console.log(`\n=== KDV kırılımı: ${sale.id} (${sale.referansNo ?? '-'}) ===\n`);
  console.log('DB (eski kayıt): gross=%s net=%s taxTotal=%s\n', sale.grossTotal, sale.netTotal, sale.taxTotal);

  const lines: Array<{
    urun: string;
    odooProductId: string | null;
    odooCanliOran: number;
    qty: number;
    birimFiyat: number;
    kdvOrani: number;
    lineTotal: number;
    kdvDahil: number;
    matrah: number;
    kdvTutar: number;
  }> = [];

  for (const item of sale.items) {
    const odooCanli =
      item.odooProductId != null
        ? await readProductSaleTaxRate(parseInt(item.odooProductId, 10))
        : null;
    const kdvOrani = await resolveSaleItemTaxRate({
      odooProductId: item.odooProductId,
      productTaxRate: item.product.taxRate,
    });
    const { taxAmount, lineTotal } = calcInclusiveLineAmounts({
      unitPrice: item.unitPrice,
      qty: item.qty,
      discount: item.discount,
      taxRate: kdvOrani,
    });
    const inclusive = Number(lineTotal);
    const { matrah, kdvTutar } = splitInclusiveVat(inclusive, kdvOrani);

    lines.push({
      urun: item.odooProductName ?? item.product.name,
      odooProductId: item.odooProductId,
      odooCanliOran: odooCanli ?? kdvOrani,
      qty: item.qty,
      birimFiyat: Number(item.unitPrice),
      kdvOrani,
      lineTotal: inclusive,
      kdvDahil: inclusive,
      matrah: Math.round(matrah * 100) / 100,
      kdvTutar: Math.round(Number(taxAmount) * 100) / 100,
    });
  }

  const toplamKdvDahil = lines.reduce((s, l) => s + l.kdvDahil, 0);
  const toplamMatrah = lines.reduce((s, l) => s + l.matrah, 0);
  const toplamKdv = lines.reduce((s, l) => s + l.kdvTutar, 0);
  const eskiYanlisKdv = Number(sale.grossTotal) * 0.1;

  console.log('Kalem\tOdoo ID\tOran%\tAdet\tBirim\tKDV dahil\tMatrah\tKDV (içinde)');
  for (const l of lines) {
    console.log(
      [
        l.urun.slice(0, 40),
        l.odooProductId ?? '-',
        l.kdvOrani,
        l.qty,
        l.birimFiyat.toFixed(2),
        l.kdvDahil.toFixed(2),
        l.matrah.toFixed(2),
        l.kdvTutar.toFixed(2),
      ].join('\t'),
    );
  }

  console.log('\n--- Özet (yeni KDV-dahil standard + Odoo canlı oran) ---');
  console.log('Toplam KDV dahil (netTotal olması gereken):', toplamKdvDahil.toFixed(2), 'TL');
  console.log('Toplam matrah:', toplamMatrah.toFixed(2), 'TL');
  console.log('Toplam KDV (içinde, gerçek %10):', toplamKdv.toFixed(2), 'TL');
  console.log('Efektif KDV oranı:', ((toplamKdv / toplamMatrah) * 100).toFixed(2), '%');
  console.log('\nKarşılaştırma:');
  console.log('  Eski yanlış KDV (matrah×%10 üstüne):', eskiYanlisKdv.toFixed(2), 'TL  ← taxTotal=', Number(sale.taxTotal));
  console.log('  Doğru KDV (KDV dahil fiyattan %10 ayırma):', toplamKdv.toFixed(2), 'TL');
  console.log('  Fark:', (eskiYanlisKdv - toplamKdv).toFixed(2), 'TL');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
