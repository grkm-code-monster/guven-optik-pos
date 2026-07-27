/**
 * Eski POS fiyat standardı (KDV üstüne ekleniyordu) nedeniyle fazla tahsil edilen tutarları raporlar.
 * Otomatik iade/mutabakat YAPMAZ — yalnızca liste üretir.
 *
 * Kullanım: npx ts-node scripts/report-pos-kdv-overcharge.ts [--limit=500] [--id=a3264f6b-...]
 */
import 'dotenv/config';
import { Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

type Row = {
  id: string;
  referansNo: string | null;
  createdAt: Date;
  status: SaleStatus;
  grossTotal: number;
  discountTotal: number;
  taxTotal: number;
  netTotalCharged: number;
  netTotalCorrect: number;
  overcharge: number;
  odooSaleOrderId: number | null;
  odooAmountTotal: number | null;
  odooVsCorrectDiff: number | null;
  branchCode: string | null;
};

function parseArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function readOdooOrderTotal(orderId: number): Promise<number | null> {
  try {
    const [row] = await execute('sale.order', 'read', [[orderId]], {
      fields: ['amount_total'],
    });
    return row?.amount_total != null ? Number(row.amount_total) : null;
  } catch {
    return null;
  }
}

async function main() {
  const limit = Math.min(5000, Math.max(1, Number(parseArg('limit') ?? 500)));
  const singleId = parseArg('id');

  const sales = await prisma.sale.findMany({
    where: {
      ...(singleId ? { id: { contains: singleId } } : {}),
      status: { in: [SaleStatus.PAID, SaleStatus.VOID] },
      taxTotal: { gt: 0 },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const branchIds = [...new Set(sales.map((s) => s.branchId))];
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, code: true },
  });
  const branchCodeById = new Map(branches.map((b) => [b.id, b.code]));

  const rows: Row[] = [];
  for (const s of sales) {
    const grossTotal = Number(s.grossTotal);
    const discountTotal = Number(s.discountTotal);
    const taxTotal = Number(s.taxTotal);
    const netTotalCharged = Number(s.netTotal);
    const netTotalCorrect = grossTotal - discountTotal;
    const overcharge = Math.round((netTotalCharged - netTotalCorrect) * 100) / 100;

    if (overcharge <= 0.009) continue;

    let odooAmountTotal: number | null = null;
    if (s.odooSaleOrderId) {
      odooAmountTotal = await readOdooOrderTotal(s.odooSaleOrderId);
    }

    rows.push({
      id: s.id,
      referansNo: s.referansNo,
      createdAt: s.createdAt,
      status: s.status,
      grossTotal,
      discountTotal,
      taxTotal,
      netTotalCharged,
      netTotalCorrect,
      overcharge,
      odooSaleOrderId: s.odooSaleOrderId,
      odooAmountTotal,
      odooVsCorrectDiff:
        odooAmountTotal != null
          ? Math.round((odooAmountTotal - netTotalCorrect) * 100) / 100
          : null,
      branchCode: branchCodeById.get(s.branchId) ?? null,
    });
  }

  const totalOvercharge = rows.reduce((a, r) => a + r.overcharge, 0);

  console.log('\n=== POS KDV-üstü fazla tahsilat raporu (Seçenek 2 öncesi) ===\n');
  console.log(`Kayıt: ${rows.length} satış | Toplam fazla tahsilat: ₺${totalOvercharge.toFixed(2)}\n`);

  const ref = rows.find((r) => r.id.startsWith('a3264f6b') || parseArg('id')?.includes(r.id.slice(0, 8)));
  if (ref) {
    console.log('--- Referans satış ---');
    console.log(JSON.stringify(ref, null, 2));
    console.log('');
  }

  console.log('id\treferans\tşube\ttarih\ttahsil\tolması_gereken\tfazla\todoo\ttaxTotal');
  for (const r of rows.slice(0, 100)) {
    const tarih = r.createdAt.toISOString().slice(0, 10);
    console.log(
      [
        r.id.slice(0, 8),
        r.referansNo ?? '-',
        r.branchCode ?? '-',
        tarih,
        r.netTotalCharged.toFixed(2),
        r.netTotalCorrect.toFixed(2),
        r.overcharge.toFixed(2),
        r.odooAmountTotal?.toFixed(2) ?? '-',
        r.taxTotal.toFixed(2),
      ].join('\t'),
    );
  }

  if (rows.length > 100) {
    console.log(`\n... ve ${rows.length - 100} satış daha (limit artır: --limit=)`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
