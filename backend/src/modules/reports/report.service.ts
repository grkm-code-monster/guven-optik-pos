import {
  CashMovementType,
  ItemStatus,
  PaymentType,
  Prisma,
  ProductCategory,
  SaleStatus,
  ShiftStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { kategoriTespit, kategoriAltKirilimTespit } from '../../utils/kategoriTespit';

type DashboardKategori =
  | 'GUNES_GOZLUGU'
  | 'CAM'
  | 'LENS'
  | 'OPTIK_CERCEVE'
  | 'AKSESUAR'
  | 'SOLUSYON'
  | 'DIGER';

const EMPTY_KATEGORI: Record<DashboardKategori, number> = {
  GUNES_GOZLUGU: 0,
  CAM: 0,
  LENS: 0,
  OPTIK_CERCEVE: 0,
  AKSESUAR: 0,
  SOLUSYON: 0,
  DIGER: 0,
};

const KATEGORI_ETIKET_TO_DASHBOARD: Record<string, DashboardKategori> = {
  CAM: 'CAM',
  'ÇERÇEVE': 'OPTIK_CERCEVE',
  LENS: 'LENS',
  'SOLÜSYON': 'SOLUSYON',
  'GÜNEŞ GÖZLÜĞÜ': 'GUNES_GOZLUGU',
  AKSESUAR: 'AKSESUAR',
  'DİĞER': 'DIGER',
};

const PRODUCT_CATEGORY_MAP: Partial<Record<ProductCategory, DashboardKategori>> = {
  [ProductCategory.SUNGLASSES_READY]: 'GUNES_GOZLUGU',
  [ProductCategory.SUNGLASSES_RX]: 'GUNES_GOZLUGU',
  [ProductCategory.LENS_RX]: 'CAM',
  [ProductCategory.OPTICAL_FRAME_READY]: 'OPTIK_CERCEVE',
  [ProductCategory.OPTICAL_FRAME_RX]: 'OPTIK_CERCEVE',
  [ProductCategory.CONTACT_LENS_READY]: 'LENS',
  [ProductCategory.CONTACT_LENS_RX]: 'LENS',
  [ProductCategory.SOLUTION]: 'SOLUSYON',
  [ProductCategory.ACCESSORY]: 'AKSESUAR',
};

function zeroExtras() {
  return {
    netCiro: '0',
    kasaNakit: '0',
    toplamBanka: '0',
    toplamSgkHakki: '0',
    toplamVakifOdemesi: '0',
    satisAdedi: 0,
    ortalamaSepet: '0',
    kategoriBreakdown: { ...EMPTY_KATEGORI },
    kampanyaBreakdown: [] as Array<{ type: string; count: number }>,
    temsilciBreakdown: [] as Array<{ repName: string; saleCount: number; ciro: string; aylikHedef: number }>,
    labIncidents: emptyLabIncidents(),
  };
}

export type LabIncidentReportKayit = {
  id: string;
  saat: string;
  saleId: string | null;
  musteriAdi: string;
  incidentType: string;
  resolutionType: string | null;
  transferRef: string | null;
  ozelSiparisId: string | null;
};

export type LabIncidentsReport = {
  toplam: number;
  lensBroken: number;
  frameBroken: number;
  measurementShift: number;
  kayitlar: LabIncidentReportKayit[];
};

function emptyLabIncidents(): LabIncidentsReport {
  return {
    toplam: 0,
    lensBroken: 0,
    frameBroken: 0,
    measurementShift: 0,
    kayitlar: [],
  };
}

async function buildLabIncidentsSummary(
  branchId: string,
  start: Date,
  end: Date,
): Promise<LabIncidentsReport> {
  const incidents = await prisma.labIncident.findMany({
    where: {
      atolyeBranchId: branchId,
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!incidents.length) return emptyLabIncidents();

  const saleItemIds = [...new Set(incidents.map((i) => i.saleItemId))];
  const items = await prisma.saleItem.findMany({
    where: { id: { in: saleItemIds } },
    include: {
      sale: {
        select: {
          id: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  let lensBroken = 0;
  let frameBroken = 0;
  let measurementShift = 0;

  const kayitlar: LabIncidentReportKayit[] = incidents.map((inc) => {
    if (inc.incidentType === 'LENS_BROKEN') lensBroken += 1;
    else if (inc.incidentType === 'FRAME_BROKEN') frameBroken += 1;
    else if (inc.incidentType === 'MEASUREMENT_SHIFT') measurementShift += 1;

    const item = itemMap.get(inc.saleItemId);
    return {
      id: inc.id,
      saat: inc.createdAt.toISOString(),
      saleId: item?.sale?.id ?? null,
      musteriAdi: item?.sale?.customer?.name ?? '—',
      incidentType: inc.incidentType,
      resolutionType: inc.resolutionType,
      transferRef: inc.transferRef,
      ozelSiparisId: inc.ozelSiparisId,
    };
  });

  return {
    toplam: incidents.length,
    lensBroken,
    frameBroken,
    measurementShift,
    kayitlar,
  };
}

function resolveItemKategori(
  item: {
    odooCategoryId: number | null;
    odooProductName: string | null;
    product: { category: ProductCategory; name: string } | null;
  },
  categoryPathById: Map<number, string>,
): DashboardKategori {
  const catId = item.odooCategoryId;
  if (catId != null) {
    const path = categoryPathById.get(catId);
    if (path) {
      const etiket = kategoriTespit(path);
      return KATEGORI_ETIKET_TO_DASHBOARD[etiket] ?? 'DIGER';
    }
  }

  const pc = item.product?.category;
  if (pc && PRODUCT_CATEGORY_MAP[pc]) {
    return PRODUCT_CATEGORY_MAP[pc]!;
  }

  return 'DIGER';
}

async function loadOdooCategoryPaths(categoryIds: Array<number | null | undefined>): Promise<Map<number, string>> {
  const unique = [...new Set(categoryIds.filter((id): id is number => id != null))];
  if (unique.length === 0) return new Map();

  try {
    const rows = (await execute(
      'product.category',
      'search_read',
      [[['id', 'in', unique]]],
      { fields: ['id', 'complete_name', 'name'], limit: unique.length },
    )) as Array<{ id: number; complete_name?: string; name?: string }>;

    return new Map(
      rows.map((row) => [row.id, (row.complete_name ?? row.name ?? '').trim()]),
    );
  } catch (err) {
    console.error('[report] Odoo kategori path yüklenemedi:', err);
    return new Map();
  }
}

async function buildKategoriBreakdown(
  items: Array<{
    qty: number;
    odooCategoryId: number | null;
    odooProductName: string | null;
    product: { category: ProductCategory; name: string } | null;
  }>,
): Promise<Record<DashboardKategori, number>> {
  const pathMap = await loadOdooCategoryPaths(items.map((item) => item.odooCategoryId));
  const kategoriBreakdown: Record<DashboardKategori, number> = { ...EMPTY_KATEGORI };
  for (const item of items) {
    const key = resolveItemKategori(item, pathMap);
    kategoriBreakdown[key] += item.qty ?? 1;
  }
  return kategoriBreakdown;
}

function buildDerivedMetrics(params: {
  totalSales: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  totalCommission: Prisma.Decimal;
  cashTotal: Prisma.Decimal;
  cashOut: Prisma.Decimal;
  cardNet: Prisma.Decimal;
  transferTotal: Prisma.Decimal;
  totalNet: Prisma.Decimal;
  saleCount: number;
  toplamSgkHakki: Prisma.Decimal;
  toplamVakifOdemesi: Prisma.Decimal;
  kategoriBreakdown: Record<DashboardKategori, number>;
  kampanyaBreakdown: Array<{ type: string; count: number }>;
  temsilciBreakdown: Array<{ repName: string; saleCount: number; ciro: string; aylikHedef: number }>;
}) {
  const netCiro = params.totalSales.minus(params.taxTotal).minus(params.totalCommission);
  const kasaNakit = params.cashTotal.minus(params.cashOut);
  const toplamBanka = params.cardNet.plus(params.transferTotal).minus(params.totalCommission);
  const ortalamaSepet =
    params.saleCount > 0 ? params.totalNet.div(params.saleCount) : new Prisma.Decimal(0);

  return {
    netCiro: netCiro.toString(),
    kasaNakit: kasaNakit.toString(),
    toplamBanka: toplamBanka.toString(),
    toplamSgkHakki: params.toplamSgkHakki.toString(),
    toplamVakifOdemesi: params.toplamVakifOdemesi.toString(),
    satisAdedi: params.saleCount,
    ortalamaSepet: ortalamaSepet.toString(),
    kategoriBreakdown: params.kategoriBreakdown,
    kampanyaBreakdown: params.kampanyaBreakdown,
    temsilciBreakdown: params.temsilciBreakdown,
  };
}

async function buildPersonelHedefMap() {
  const personeller = await prisma.personel.findMany({
    where: { aktif: true },
    select: { ad: true, soyad: true, aylikHedef: true, subeId: true },
  });
  return new Map(
    personeller.map((p) => [
      `${p.ad} ${p.soyad}`.toLowerCase().trim(),
      { aylikHedef: p.aylikHedef, subeId: p.subeId },
    ]),
  );
}

function mapTemsilciBreakdown(
  repMap: Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>,
  personelMap: Map<string, { aylikHedef: number; subeId: string | null }>,
) {
  return Array.from(repMap.values())
    .map((r) => {
      const personelInfo = personelMap.get(r.repName?.toLowerCase().trim() ?? '');
      return {
        repName: r.repName,
        saleCount: r.saleCount,
        ciro: r.ciro.toString(),
        aylikHedef: personelInfo?.aylikHedef ?? 0,
      };
    })
    .sort((a, b) => Number(b.ciro) - Number(a.ciro));
}

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

function dayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateRangeBounds(startDate: Date, endDate: Date) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function saleWhereForCalendarRange(branchId: string, start: Date, end: Date) {
  return {
    branchId,
    status: SaleStatus.PAID,
    createdAt: { gte: start, lte: end },
  } as const;
}

const paidSalesSelect = {
  id: true,
  netTotal: true,
  grossTotal: true,
  taxTotal: true,
  discountTotal: true,
  sgkAmount: true,
  createdAt: true,
  userId: true,
  user: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  items: {
    select: {
      qty: true,
      odooCategoryId: true,
      odooProductName: true,
      unitPrice: true,
      deliveryDate: true,
      product: { select: { category: true, name: true } },
    },
  },
  payments: {
    select: {
      paymentType: true,
      grossAmount: true,
      netAmount: true,
      commissionAmount: true,
      installment: true,
      bankId: true,
    },
  },
} as const;

type PaidSaleForDetail = Prisma.SaleGetPayload<{ select: typeof paidSalesSelect }>;

async function buildSalesDetail(paidSales: PaidSaleForDetail[]) {
  const bankIds = Array.from(
    new Set(
      paidSales
        .flatMap((s) => s.payments.map((p) => p.bankId))
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const banks = bankIds.length
    ? await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } })
    : [];
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const sorted = [...paidSales].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted.map((sale) => ({
    saleId: sale.id,
    createdAt: sale.createdAt.toISOString(),
    deliveryDate: sale.items[0]?.deliveryDate?.toISOString() ?? null,
    customerName: sale.customer?.name ?? '—',
    grossTotal: sale.grossTotal.toString(),
    netTotal: sale.netTotal.toString(),
    taxExcluded: sale.taxTotal
      ? (Number(sale.netTotal) - Number(sale.taxTotal)).toFixed(2)
      : sale.netTotal.toString(),
    discountPct: sale.grossTotal.greaterThan(0)
      ? ((Number(sale.discountTotal) / Number(sale.grossTotal)) * 100).toFixed(1)
      : '0',
    sgkAmount: sale.sgkAmount?.toString() ?? '0',
    repName: sale.user?.name ?? '—',
    cashAmount: sale.payments
      .filter((p) => p.paymentType === PaymentType.CASH)
      .reduce((s, p) => s + Number(p.grossAmount), 0)
      .toFixed(2),
    cardPayments: sale.payments
      .filter((p) => p.paymentType === PaymentType.CARD)
      .map((p) => ({
        bankName: p.bankId ? (bankNameById.get(p.bankId) ?? '—') : '—',
        installment: p.installment ?? 1,
        grossAmount: p.grossAmount.toString(),
        commissionAmount: p.commissionAmount?.toString() ?? '0',
      })),
    transferAmount: sale.payments
      .filter((p) => p.paymentType === PaymentType.TRANSFER)
      .reduce((s, p) => s + Number(p.grossAmount), 0)
      .toFixed(2),
    itemSummary: sale.items.map((i) => i.odooProductName ?? i.product?.name ?? '—').join(', '),
  }));
}

function formatMasrafItemSummary(description: string): string {
  const trimmed = description.trim();
  if (/^MASRAF:\s/.test(trimmed)) return trimmed;
  const body = trimmed.replace(/^Masraf:\s*/i, '');
  return `MASRAF: ${body}`;
}

async function buildMasrafDetailRows(shiftId: string) {
  const movements = await prisma.cashMovement.findMany({
    where: { shiftId, type: CashMovementType.CASH_OUT },
    orderBy: { createdAt: 'asc' },
  });
  if (movements.length === 0) return [];

  const userIds = Array.from(new Set(movements.map((m) => m.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return movements.map((movement) => ({
    tip: 'MASRAF' as const,
    saleId: movement.id,
    createdAt: movement.createdAt.toISOString(),
    deliveryDate: null,
    customerName: '—',
    grossTotal: '0',
    netTotal: '0',
    taxExcluded: '0',
    discountPct: '0',
    sgkAmount: '0',
    repName: userNameById.get(movement.userId) ?? '—',
    cashAmount: movement.amount.negated().toString(),
    cardPayments: [] as Array<{
      bankName: string;
      installment: number;
      grossAmount: string;
      commissionAmount: string;
    }>,
    transferAmount: '0',
    itemSummary: formatMasrafItemSummary(movement.description),
  }));
}

async function buildSalesDetailWithMasraflar(paidSales: PaidSaleForDetail[], shiftId: string) {
  const [salesDetail, masrafRows] = await Promise.all([
    buildSalesDetail(paidSales),
    buildMasrafDetailRows(shiftId),
  ]);
  return [...salesDetail, ...masrafRows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * "Kasa Nakit" ve "SGK Hakları" artık vardiya/gün bazlı sıfırlanmıyor — mağaza müdürünün
 * kasada fiilen birikmiş nakti ve aya ait SGK alacağını sürekli görebilmesi için:
 *  - Kasa Nakit: şubenin TÜM ZAMANLAR nakit satış toplamı - TÜM ZAMANLAR nakit çıkışı (masraf).
 *    Akşam banka yatırımı yapılmadığı için bu bakiye gün gün devreder, sadece bir "nakit çıkışı"
 *    kaydı girildiğinde azalır.
 *  - SGK Hakları: şubenin İÇİNDE BULUNULAN AY toplamı — ay başından itibaren toplanır, yeni ay
 *    başlayınca (tarih filtresi sayesinde otomatik olarak) sıfırdan başlar.
 * Not: Vardiya açma/kapama akışındaki (openShift/closeShift/expectedCash/physicalCash/diff)
 * fiziki kasa sayım mutabakatı bundan tamamen ayrı ve değişmeden kalır — bu sadece dashboard'daki
 * "Mağaza Özeti" kartları için kullanılan, kümülatif bir görünüm.
 */
async function computeRunningKasaBakiye(branchId: string, date: Date) {
  const monthStart = new Date(date);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [cashInAllAgg, cashOutAllAgg, sgkMonthAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        paymentType: PaymentType.CASH,
        sale: { branchId, status: SaleStatus.PAID },
      },
      _sum: { grossAmount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { branchId, type: CashMovementType.CASH_OUT },
      _sum: { amount: true },
    }),
    prisma.sale.aggregate({
      where: { branchId, status: SaleStatus.PAID, createdAt: { gte: monthStart } },
      _sum: { sgkAmount: true },
    }),
  ]);

  const cashInAll = cashInAllAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cashOutAll = cashOutAllAgg._sum.amount ?? new Prisma.Decimal(0);
  const kasaNakit = cashInAll.minus(cashOutAll);
  const toplamSgkHakki = sgkMonthAgg._sum.sgkAmount ?? new Prisma.Decimal(0);

  return { kasaNakit: kasaNakit.toString(), toplamSgkHakki: toplamSgkHakki.toString() };
}

export async function getDailyReport(branchId: string, date: Date) {
  const { start, end } = dayRange(date);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  let shift = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });

  if (!shift) {
    shift = await prisma.shift.findFirst({
      where: {
        branchId,
        openedAt: { gte: start },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  if (!shift) {
    const labIncidents = await buildLabIncidentsSummary(branchId, start, end);
    const runningKasaBakiye = await computeRunningKasaBakiye(branchId, date);
    return {
      date: date.toISOString(),
      branchId,
      branchName: branch?.name ?? '',
      shiftId: null,
      shiftOpenedAt: null,
      openCash: '0',
      totalSales: '0',
      totalDiscount: '0',
      totalNet: '0',
      cashTotal: '0',
      cardGross: '0',
      cardNet: '0',
      totalCommission: '0',
      transferTotal: '0',
      openAccountTotal: '0',
      taxTotal: '0',
      cashIn: '0',
      cashOut: '0',
      advanceTotal: '0',
      expectedCash: '0',
      physicalCash: null,
      diff: null,
      saleCount: 0,
      bankBreakdown: [],
      salesDetail: [],
      ...zeroExtras(),
      ...runningKasaBakiye,
      labIncidents,
    };
  }

  const paidSaleWhere = {
    branchId,
    shiftId: shift.id,
    status: SaleStatus.PAID,
  };

  const paidSales = await prisma.sale.findMany({
    where: paidSaleWhere,
    select: paidSalesSelect,
    orderBy: { createdAt: 'asc' },
  });

  const salesAgg = await prisma.sale.aggregate({
    where: paidSaleWhere,
    _sum: {
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
      taxTotal: true,
    },
    _count: { _all: true },
  });

  const cashAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.CASH },
    _sum: { grossAmount: true },
  });
  const cardAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.CARD },
    _sum: { grossAmount: true, netAmount: true, commissionAmount: true },
  });
  const transferAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.TRANSFER },
    _sum: { grossAmount: true },
  });
  const openAccountAgg = await prisma.payment.aggregate({
    where: { sale: { shiftId: shift.id, status: SaleStatus.PAID }, paymentType: PaymentType.OPEN_ACCOUNT },
    _sum: { grossAmount: true },
  });

  const cashInAgg = await prisma.cashMovement.aggregate({
    where: {
      shiftId: shift.id,
      type: CashMovementType.CASH_IN,
      NOT: { description: { startsWith: 'SALE_CASH_PAYMENT:' } },
    },
    _sum: { amount: true },
  });
  const cashOutAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.CASH_OUT },
    _sum: { amount: true },
  });
  const advanceAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.ADVANCE },
    _sum: { amount: true },
  });

  const openCash = shift.openCash ?? new Prisma.Decimal(0);
  const totalSales = salesAgg._sum.grossTotal ?? new Prisma.Decimal(0);
  const totalDiscount = salesAgg._sum.discountTotal ?? new Prisma.Decimal(0);
  const totalNet = salesAgg._sum.netTotal ?? new Prisma.Decimal(0);
  const taxTotal = salesAgg._sum.taxTotal ?? new Prisma.Decimal(0);

  const cashTotal = cashAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardGross = cardAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardNet = cardAgg._sum.netAmount ?? new Prisma.Decimal(0);
  const totalCommission = cardAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const transferTotal = transferAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const openAccountTotal = openAccountAgg._sum.grossAmount ?? new Prisma.Decimal(0);

  const cashIn = cashInAgg._sum.amount ?? new Prisma.Decimal(0);
  const cashOut = cashOutAgg._sum.amount ?? new Prisma.Decimal(0);
  const advanceTotal = advanceAgg._sum.amount ?? new Prisma.Decimal(0);

  const expectedCash = openCash.plus(cashTotal).plus(cashIn).minus(cashOut).minus(advanceTotal);

  const bankGrouped = await prisma.payment.groupBy({
    by: ['bankId', 'installment'],
    where: {
      paymentType: PaymentType.CARD,
      bankId: { not: null },
      sale: { shiftId: shift.id, status: SaleStatus.PAID },
    },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });

  const bankIds = Array.from(new Set(bankGrouped.map((b) => b.bankId).filter((x): x is string => Boolean(x))));
  const banks = await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } });
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const bankBreakdown = bankGrouped.map((b) => ({
    bankName: bankNameById.get(b.bankId as string) ?? '',
    installment: b.installment ?? 1,
    gross: (b._sum.grossAmount ?? new Prisma.Decimal(0)).toString(),
    commission: (b._sum.commissionAmount ?? new Prisma.Decimal(0)).toString(),
    net: (b._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
  }));

  const saleCount = salesAgg._count._all;

  const allItems = paidSales.flatMap((sale) => sale.items);
  const kategoriBreakdown = await buildKategoriBreakdown(allItems);

  let toplamSgkHakki = new Prisma.Decimal(0);
  let toplamVakifOdemesi = new Prisma.Decimal(0);
  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();

  for (const sale of paidSales) {
    if (sale.sgkAmount) {
      toplamSgkHakki = toplamSgkHakki.plus(sale.sgkAmount);
    }
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const kampanyaBreakdown: Array<{ type: string; count: number }> = [];
  const personelMap = await buildPersonelHedefMap();
  const temsilciBreakdown = mapTemsilciBreakdown(repMap, personelMap);

  const derived = buildDerivedMetrics({
    totalSales,
    taxTotal,
    totalCommission,
    cashTotal,
    cashOut,
    cardNet,
    transferTotal,
    totalNet,
    saleCount,
    toplamSgkHakki,
    toplamVakifOdemesi,
    kategoriBreakdown,
    kampanyaBreakdown,
    temsilciBreakdown,
  });

  const labIncidents = await buildLabIncidentsSummary(branchId, start, end);
  const runningKasaBakiye = await computeRunningKasaBakiye(branchId, date);

  return {
    date,
    branchId,
    branchName: branch.name,
    shiftId: shift.id,
    shiftOpenedAt: shift.openedAt,
    openCash: openCash.toString(),
    totalSales: totalSales.toString(),
    totalDiscount: totalDiscount.toString(),
    totalNet: totalNet.toString(),
    cashTotal: cashTotal.toString(),
    cardGross: cardGross.toString(),
    cardNet: cardNet.toString(),
    totalCommission: totalCommission.toString(),
    transferTotal: transferTotal.toString(),
    openAccountTotal: openAccountTotal.toString(),
    taxTotal: taxTotal.toString(),
    cashIn: cashIn.toString(),
    cashOut: cashOut.toString(),
    advanceTotal: advanceTotal.toString(),
    expectedCash: expectedCash.toString(),
    physicalCash: shift.physicalCash ? shift.physicalCash.toString() : null,
    diff: shift.diff ? shift.diff.toString() : null,
    saleCount,
    bankBreakdown,
    salesDetail: await buildSalesDetailWithMasraflar(paidSales, shift.id),
    labIncidents,
    ...derived,
    ...runningKasaBakiye,
  };
}

export async function getPersonalDailyReport(
  userId: string,
  branchId: string,
  date: Date,
) {
  const { start, end } = dayRange(date);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  let shift = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });

  if (!shift) {
    shift = await prisma.shift.findFirst({
      where: {
        branchId,
        openedAt: { gte: start },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  if (!shift) {
    return {
      date: date.toISOString(),
      branchId,
      branchName: branch?.name ?? '',
      shiftId: null,
      shiftOpenedAt: null,
      openCash: '0',
      totalSales: '0',
      totalDiscount: '0',
      totalNet: '0',
      cashTotal: '0',
      cardGross: '0',
      cardNet: '0',
      totalCommission: '0',
      transferTotal: '0',
      openAccountTotal: '0',
      taxTotal: '0',
      cashIn: '0',
      cashOut: '0',
      advanceTotal: '0',
      expectedCash: '0',
      physicalCash: null,
      diff: null,
      saleCount: 0,
      bankBreakdown: [],
      salesDetail: [],
      ...zeroExtras(),
    };
  }

  const paidSaleWhere = {
    branchId,
    shiftId: shift.id,
    status: SaleStatus.PAID,
    userId,
  };

  const paidSales = await prisma.sale.findMany({
    where: paidSaleWhere,
    select: paidSalesSelect,
    orderBy: { createdAt: 'asc' },
  });

  const salesAgg = await prisma.sale.aggregate({
    where: paidSaleWhere,
    _sum: {
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
      taxTotal: true,
    },
    _count: { _all: true },
  });

  const personalPaymentSaleWhere = {
    shiftId: shift.id,
    status: SaleStatus.PAID,
    userId,
  };

  const cashAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.CASH,
    },
    _sum: { grossAmount: true },
  });
  const cardAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.CARD,
    },
    _sum: { grossAmount: true, netAmount: true, commissionAmount: true },
  });
  const transferAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.TRANSFER,
    },
    _sum: { grossAmount: true },
  });
  const openAccountAgg = await prisma.payment.aggregate({
    where: {
      sale: personalPaymentSaleWhere,
      paymentType: PaymentType.OPEN_ACCOUNT,
    },
    _sum: { grossAmount: true },
  });

  const cashInAgg = await prisma.cashMovement.aggregate({
    where: {
      shiftId: shift.id,
      type: CashMovementType.CASH_IN,
      NOT: { description: { startsWith: 'SALE_CASH_PAYMENT:' } },
    },
    _sum: { amount: true },
  });
  const cashOutAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.CASH_OUT },
    _sum: { amount: true },
  });
  const advanceAgg = await prisma.cashMovement.aggregate({
    where: { shiftId: shift.id, type: CashMovementType.ADVANCE },
    _sum: { amount: true },
  });

  const openCash = shift.openCash ?? new Prisma.Decimal(0);
  const totalSales = salesAgg._sum.grossTotal ?? new Prisma.Decimal(0);
  const totalDiscount = salesAgg._sum.discountTotal ?? new Prisma.Decimal(0);
  const totalNet = salesAgg._sum.netTotal ?? new Prisma.Decimal(0);
  const taxTotal = salesAgg._sum.taxTotal ?? new Prisma.Decimal(0);

  const cashTotal = cashAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardGross = cardAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardNet = cardAgg._sum.netAmount ?? new Prisma.Decimal(0);
  const totalCommission = cardAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const transferTotal = transferAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const openAccountTotal = openAccountAgg._sum.grossAmount ?? new Prisma.Decimal(0);

  const cashIn = cashInAgg._sum.amount ?? new Prisma.Decimal(0);
  const cashOut = cashOutAgg._sum.amount ?? new Prisma.Decimal(0);
  const advanceTotal = advanceAgg._sum.amount ?? new Prisma.Decimal(0);

  const expectedCash = openCash.plus(cashTotal).plus(cashIn).minus(cashOut).minus(advanceTotal);

  const bankGrouped = await prisma.payment.groupBy({
    by: ['bankId', 'installment'],
    where: {
      paymentType: PaymentType.CARD,
      bankId: { not: null },
      sale: personalPaymentSaleWhere,
    },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });

  const bankIds = Array.from(new Set(bankGrouped.map((b) => b.bankId).filter((x): x is string => Boolean(x))));
  const banks = await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } });
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const bankBreakdown = bankGrouped.map((b) => ({
    bankName: bankNameById.get(b.bankId as string) ?? '',
    installment: b.installment ?? 1,
    gross: (b._sum.grossAmount ?? new Prisma.Decimal(0)).toString(),
    commission: (b._sum.commissionAmount ?? new Prisma.Decimal(0)).toString(),
    net: (b._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
  }));

  const saleCount = salesAgg._count._all;

  const allItems = paidSales.flatMap((sale) => sale.items);
  const kategoriBreakdown = await buildKategoriBreakdown(allItems);

  let toplamSgkHakki = new Prisma.Decimal(0);
  const toplamVakifOdemesi = new Prisma.Decimal(0);
  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();

  for (const sale of paidSales) {
    if (sale.sgkAmount) {
      toplamSgkHakki = toplamSgkHakki.plus(sale.sgkAmount);
    }
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const kampanyaBreakdown: Array<{ type: string; count: number }> = [];
  const personelMap = await buildPersonelHedefMap();
  const temsilciBreakdown = mapTemsilciBreakdown(repMap, personelMap);

  const derived = buildDerivedMetrics({
    totalSales,
    taxTotal,
    totalCommission,
    cashTotal,
    cashOut,
    cardNet,
    transferTotal,
    totalNet,
    saleCount,
    toplamSgkHakki,
    toplamVakifOdemesi,
    kategoriBreakdown,
    kampanyaBreakdown,
    temsilciBreakdown,
  });

  return {
    date,
    branchId,
    branchName: branch.name,
    shiftId: shift.id,
    shiftOpenedAt: shift.openedAt,
    openCash: openCash.toString(),
    totalSales: totalSales.toString(),
    totalDiscount: totalDiscount.toString(),
    totalNet: totalNet.toString(),
    cashTotal: cashTotal.toString(),
    cardGross: cardGross.toString(),
    cardNet: cardNet.toString(),
    totalCommission: totalCommission.toString(),
    transferTotal: transferTotal.toString(),
    openAccountTotal: openAccountTotal.toString(),
    taxTotal: taxTotal.toString(),
    cashIn: cashIn.toString(),
    cashOut: cashOut.toString(),
    advanceTotal: advanceTotal.toString(),
    expectedCash: expectedCash.toString(),
    physicalCash: shift.physicalCash ? shift.physicalCash.toString() : null,
    diff: shift.diff ? shift.diff.toString() : null,
    saleCount,
    bankBreakdown,
    salesDetail: await buildSalesDetail(paidSales),
    ...derived,
  };
}

export async function getRangeReport(branchId: string, startDate: Date, endDate: Date) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw codeError('BRANCH_NOT_FOUND', 'Şube bulunamadı.');
  }

  const { start, end } = dateRangeBounds(startDate, endDate);
  const paidSaleWhere = saleWhereForCalendarRange(branchId, start, end);

  const paidSales = await prisma.sale.findMany({
    where: paidSaleWhere,
    select: paidSalesSelect,
    orderBy: { createdAt: 'asc' },
  });

  const salesAgg = await prisma.sale.aggregate({
    where: paidSaleWhere,
    _sum: {
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
      taxTotal: true,
    },
    _count: { _all: true },
  });

  const paymentSaleWhere = { sale: paidSaleWhere };

  const cashAgg = await prisma.payment.aggregate({
    where: { ...paymentSaleWhere, paymentType: PaymentType.CASH },
    _sum: { grossAmount: true },
  });
  const cardAgg = await prisma.payment.aggregate({
    where: { ...paymentSaleWhere, paymentType: PaymentType.CARD },
    _sum: { grossAmount: true, netAmount: true, commissionAmount: true },
  });
  const transferAgg = await prisma.payment.aggregate({
    where: { ...paymentSaleWhere, paymentType: PaymentType.TRANSFER },
    _sum: { grossAmount: true },
  });
  const openAccountAgg = await prisma.payment.aggregate({
    where: { ...paymentSaleWhere, paymentType: PaymentType.OPEN_ACCOUNT },
    _sum: { grossAmount: true },
  });

  const totalSales = salesAgg._sum.grossTotal ?? new Prisma.Decimal(0);
  const totalDiscount = salesAgg._sum.discountTotal ?? new Prisma.Decimal(0);
  const totalNet = salesAgg._sum.netTotal ?? new Prisma.Decimal(0);
  const taxTotal = salesAgg._sum.taxTotal ?? new Prisma.Decimal(0);
  const cashTotal = cashAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardGross = cardAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cardNet = cardAgg._sum.netAmount ?? new Prisma.Decimal(0);
  const totalCommission = cardAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const transferTotal = transferAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const openAccountTotal = openAccountAgg._sum.grossAmount ?? new Prisma.Decimal(0);
  const cashOut = new Prisma.Decimal(0);
  const saleCount = salesAgg._count._all;

  const bankGrouped = await prisma.payment.groupBy({
    by: ['bankId', 'installment'],
    where: {
      paymentType: PaymentType.CARD,
      bankId: { not: null },
      sale: paidSaleWhere,
    },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
      netAmount: true,
    },
  });

  const bankIds = Array.from(new Set(bankGrouped.map((b) => b.bankId).filter((x): x is string => Boolean(x))));
  const banks = bankIds.length
    ? await prisma.bank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } })
    : [];
  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

  const bankBreakdown = bankGrouped.map((b) => ({
    bankName: bankNameById.get(b.bankId as string) ?? '',
    installment: b.installment ?? 1,
    gross: (b._sum.grossAmount ?? new Prisma.Decimal(0)).toString(),
    commission: (b._sum.commissionAmount ?? new Prisma.Decimal(0)).toString(),
    net: (b._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
  }));

  const allItems = paidSales.flatMap((sale) => sale.items);
  const kategoriBreakdown = await buildKategoriBreakdown(allItems);

  let toplamSgkHakki = new Prisma.Decimal(0);
  const toplamVakifOdemesi = new Prisma.Decimal(0);
  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();

  for (const sale of paidSales) {
    if (sale.sgkAmount) {
      toplamSgkHakki = toplamSgkHakki.plus(sale.sgkAmount);
    }
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const kampanyaBreakdown: Array<{ type: string; count: number }> = [];
  const personelMap = await buildPersonelHedefMap();
  const temsilciBreakdown = mapTemsilciBreakdown(repMap, personelMap);

  const derived = buildDerivedMetrics({
    totalSales,
    taxTotal,
    totalCommission,
    cashTotal,
    cashOut,
    cardNet,
    transferTotal,
    totalNet,
    saleCount,
    toplamSgkHakki,
    toplamVakifOdemesi,
    kategoriBreakdown,
    kampanyaBreakdown,
    temsilciBreakdown,
  });

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    date: start.toISOString(),
    branchId,
    branchName: branch.name,
    shiftId: null,
    shiftOpenedAt: null,
    openCash: '0',
    totalSales: totalSales.toString(),
    totalDiscount: totalDiscount.toString(),
    totalNet: totalNet.toString(),
    cashTotal: cashTotal.toString(),
    cardGross: cardGross.toString(),
    cardNet: cardNet.toString(),
    totalCommission: totalCommission.toString(),
    transferTotal: transferTotal.toString(),
    openAccountTotal: openAccountTotal.toString(),
    taxTotal: taxTotal.toString(),
    cashIn: '0',
    cashOut: '0',
    advanceTotal: '0',
    expectedCash: '0',
    physicalCash: null,
    diff: null,
    saleCount,
    bankBreakdown,
    salesDetail: await buildSalesDetail(paidSales),
    ...derived,
  };
}

export async function getMonthlyPersonelBreakdown(branchId: string, ay: number, yil: number) {
  if (ay < 1 || ay > 12 || yil < 2000 || yil > 2100) {
    throw codeError('VALIDATION_ERROR', 'Geçersiz ay veya yıl.');
  }

  const start = new Date(yil, ay - 1, 1, 0, 0, 0, 0);
  const end = new Date(yil, ay, 0, 23, 59, 59, 999);

  const paidSales = await prisma.sale.findMany({
    where: saleWhereForCalendarRange(branchId, start, end),
    select: {
      userId: true,
      netTotal: true,
      user: { select: { name: true } },
    },
  });

  const repMap = new Map<string, { repName: string; saleCount: number; ciro: Prisma.Decimal }>();
  for (const sale of paidSales) {
    const repKey = sale.userId;
    const prev = repMap.get(repKey) ?? {
      repName: sale.user?.name ?? '—',
      saleCount: 0,
      ciro: new Prisma.Decimal(0),
    };
    prev.saleCount += 1;
    prev.ciro = prev.ciro.plus(sale.netTotal);
    repMap.set(repKey, prev);
  }

  const personelMap = await buildPersonelHedefMap();
  return mapTemsilciBreakdown(repMap, personelMap);
}

export async function generateDailyExcel(branchId: string, date: Date) {
  const report = await getDailyReport(branchId, date);

  const wb = new ExcelJS.Workbook();
  const sheetName = `Günlük Kasa - ${date.toISOString().slice(0, 10)}`;
  const ws = wb.addWorksheet(sheetName.slice(0, 31));

  const shiftOpenedAtText = report.shiftOpenedAt
    ? (() => {
        const shiftOpenedAt = new Date(report.shiftOpenedAt);
        const dd = String(shiftOpenedAt.getDate()).padStart(2, '0');
        const mm = String(shiftOpenedAt.getMonth() + 1).padStart(2, '0');
        const yyyy = String(shiftOpenedAt.getFullYear());
        const hh = String(shiftOpenedAt.getHours()).padStart(2, '0');
        const min = String(shiftOpenedAt.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yyyy} ${hh}:${min}'de açıldı`;
      })()
    : '';

  ws.addRow(['GÜVEN OPTİK - Günlük Kasa Raporu']);
  ws.addRow([]);
  ws.addRow(['Tarih', date.toISOString().slice(0, 10)]);
  ws.addRow(['Şube', report.branchName]);
  ws.addRow(['Vardiya', shiftOpenedAtText]);
  ws.addRow([]);

  ws.addRow(['── SATIŞ ──']);
  ws.addRow(['Toplam Satış (brüt)', report.totalSales]);
  ws.addRow(['Toplam İndirim', report.totalDiscount]);
  ws.addRow(['Toplam KDV', report.taxTotal]);
  ws.addRow(['Net Satış', report.totalNet]);
  ws.addRow([]);

  ws.addRow(['── ÖDEME DAĞILIMI ──']);
  ws.addRow(['Nakit', report.cashTotal]);
  ws.addRow(['Kart (Brüt)', report.cardGross]);
  ws.addRow(['Kart (Net)', report.cardNet]);
  ws.addRow(['Komisyon', report.totalCommission]);
  ws.addRow(['Havale', report.transferTotal]);
  ws.addRow(['Açık Hesap', report.openAccountTotal]);
  ws.addRow([]);

  ws.addRow(['── BANKA KIRILIMLARI ──']);
  ws.addRow(['Banka', 'Taksit', 'Brüt', 'Komisyon', 'Net']);
  for (const b of report.bankBreakdown) {
    ws.addRow([b.bankName, b.installment, b.gross, b.commission, b.net]);
  }
  ws.addRow([]);

  ws.addRow(['── KASA ──']);
  ws.addRow(['Açılış Kasası', report.openCash]);
  ws.addRow(['Nakit Giriş', report.cashIn]);
  ws.addRow(['Nakit Çıkış', report.cashOut]);
  ws.addRow(['Avans', report.advanceTotal]);
  ws.addRow(['Beklenen Kasa', report.expectedCash]);
  ws.addRow(['Fiziki Kasa', report.physicalCash ?? '']);
  ws.addRow(['Fark', report.diff ?? '']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function getPatronOzet({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    status: SaleStatus.PAID,
    createdAt: { gte: baslangic, lte: bitis },
  };
  if (subeId) where.branchId = subeId;

  const sales = await prisma.sale.findMany({
    where,
    include: {
      payments: true,
      items: { include: { product: true } },
      customer: true,
    },
  });

  const netTotal = sales.reduce((s, sale) => s + Number(sale.netTotal), 0);
  const satisAdedi = sales.length;
  const ortalamaSepet = satisAdedi > 0 ? netTotal / satisAdedi : 0;

  const nakit = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.CASH).reduce((s, p) => s + Number(p.netAmount), 0);
  const kart = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.CARD).reduce((s, p) => s + Number(p.netAmount), 0);
  const acikHesap = sales.flatMap((s) => s.payments).filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT).reduce((s, p) => s + Number(p.netAmount), 0);
  const sgk = sales.reduce((s, sale) => s + Number(sale.sgkAmount ?? 0), 0);

  const yeniMusteriIds = new Set<string>();
  for (const sale of sales) {
    if (sale.customerId) {
      const prev = await prisma.sale.count({ where: { customerId: sale.customerId, status: SaleStatus.PAID, createdAt: { lt: baslangic } } });
      if (prev === 0) yeniMusteriIds.add(sale.customerId);
    }
  }

  const kdvToplam = sales.reduce((s, sale) => s + (Number(sale.netTotal) - Number(sale.grossTotal)), 0);

  const branchIds = Array.from(new Set(sales.map((s) => s.branchId).filter((x): x is string => Boolean(x))));
  const branches = branchIds.length
    ? await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
    : [];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const subeBreakdown: Record<string, { ciro: number; satisAdedi: number }> = {};
  for (const sale of sales) {
    if (!sale.branchId) continue;
    if (!subeBreakdown[sale.branchId]) subeBreakdown[sale.branchId] = { ciro: 0, satisAdedi: 0 };
    subeBreakdown[sale.branchId].ciro += Number(sale.netTotal);
    subeBreakdown[sale.branchId].satisAdedi++;
  }

  return {
    netTotal,
    satisAdedi,
    ortalamaSepet,
    nakit,
    kart,
    acikHesap,
    sgk,
    kdvToplam,
    yeniMusteriSayisi: yeniMusteriIds.size,
    subeBreakdown: Object.entries(subeBreakdown).map(([branchId, v]) => ({
      branchId,
      subeAdi: branchNameById.get(branchId) ?? branchId,
      ciro: v.ciro,
      satisAdedi: v.satisAdedi,
    })),
  };
}

export async function getPersonelPerformans({
  baslangic,
  bitis,
  subeId,
}: {
  baslangic: Date;
  bitis: Date;
  subeId?: string;
}) {
  const where: any = { status: SaleStatus.PAID, createdAt: { gte: baslangic, lte: bitis } };
  if (subeId) where.branchId = subeId;

  const sales = await prisma.sale.findMany({
    where,
    include: { user: true, payments: true },
  });

  const personelMap = await buildPersonelHedefMap();

  const byUser: Record<string, { ad: string; satisAdedi: number; ciro: number }> = {};
  for (const sale of sales) {
    const uid = sale.userId ?? 'bilinmiyor';
    const ad = sale.user?.name ?? sale.user?.username ?? 'Bilinmiyor';
    if (!byUser[uid]) byUser[uid] = { ad, satisAdedi: 0, ciro: 0 };
    byUser[uid].satisAdedi++;
    byUser[uid].ciro += Number(sale.netTotal);
  }

  return Object.values(byUser)
    .map((r) => {
      const personelInfo = personelMap.get(r.ad?.toLowerCase().trim() ?? '');
      return {
        ad: r.ad,
        satisAdedi: r.satisAdedi,
        ciro: r.ciro,
        aylikHedef: personelInfo?.aylikHedef ?? 0,
      };
    })
    .sort((a, b) => b.ciro - a.ciro);
}

export async function getKategoriBreakdown({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    sale: { status: SaleStatus.PAID, createdAt: { gte: baslangic, lte: bitis } },
    status: { not: ItemStatus.VOID },
  };
  if (subeId) where.sale.branchId = subeId;

  const items = await prisma.saleItem.findMany({
    where,
    include: { product: true },
  });

  const pathMap = await loadOdooCategoryPaths(items.map((item) => item.odooCategoryId));
  const breakdown: Record<string, { ciro: number; adet: number }> = {};
  for (const item of items) {
    const kat = resolveItemKategori(item as any, pathMap);
    if (!breakdown[kat]) breakdown[kat] = { ciro: 0, adet: 0 };
    breakdown[kat].ciro += Number(item.lineTotal);
    breakdown[kat].adet += Number(item.qty);
  }

  return breakdown;
}

export type KategoriAltKirilimSatir = { ad: string; ciro: number; adet: number; yuzde: number };

/**
 * Bir ana kategorinin (Güneş, Cam, Lens, Çerçeve, Aksesuar, Solüsyon) Odoo'daki
 * gerçek alt kategori kırılımını (Güneş/Çerçeve → Alt/Orta/Orta Üst/Üst,
 * Lens/Aksesuar/Solüsyon → ürün tipi, Cam → ürün grubu) döner.
 * Patron paneli "Kategori dağılımı" grafiğinde bir dilime tıklanınca çağrılır.
 */
export async function getKategoriAltKirilim({
  baslangic,
  bitis,
  subeId,
  anaKategori,
}: {
  baslangic: Date;
  bitis: Date;
  subeId?: string;
  anaKategori: string;
}): Promise<KategoriAltKirilimSatir[]> {
  const where: any = {
    sale: { status: SaleStatus.PAID, createdAt: { gte: baslangic, lte: bitis } },
    status: { not: ItemStatus.VOID },
  };
  if (subeId) where.sale.branchId = subeId;

  const items = await prisma.saleItem.findMany({
    where,
    include: { product: true },
  });

  const pathMap = await loadOdooCategoryPaths(items.map((item) => item.odooCategoryId));
  const altBreakdown: Record<string, { ciro: number; adet: number }> = {};
  let toplamCiro = 0;

  for (const item of items) {
    const kat = resolveItemKategori(item as any, pathMap);
    if (kat !== anaKategori) continue;

    let altAd = 'Diğer';
    const catId = item.odooCategoryId;
    if (catId != null) {
      const path = pathMap.get(catId);
      if (path) {
        const { altKategori } = kategoriAltKirilimTespit(path);
        if (altKategori) altAd = altKategori;
      }
    }

    if (!altBreakdown[altAd]) altBreakdown[altAd] = { ciro: 0, adet: 0 };
    altBreakdown[altAd].ciro += Number(item.lineTotal);
    altBreakdown[altAd].adet += Number(item.qty);
    toplamCiro += Number(item.lineTotal);
  }

  return Object.entries(altBreakdown)
    .map(([ad, val]) => ({
      ad,
      ciro: val.ciro,
      adet: val.adet,
      yuzde: toplamCiro > 0 ? (val.ciro / toplamCiro) * 100 : 0,
    }))
    .sort((a, b) => b.ciro - a.ciro);
}

export async function getGunlukSeri({ baslangic, bitis, subeId }: { baslangic: Date; bitis: Date; subeId?: string }) {
  const where: any = {
    status: SaleStatus.PAID,
    createdAt: { gte: baslangic, lte: bitis },
  };
  if (subeId) where.branchId = subeId;

  const sales = await prisma.sale.findMany({ where, select: { createdAt: true, netTotal: true } });

  const byDay: Record<string, number> = {};
  for (const sale of sales) {
    const gun = sale.createdAt.toISOString().split('T')[0];
    byDay[gun] = (byDay[gun] ?? 0) + Number(sale.netTotal);
  }

  return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([tarih, ciro]) => ({ tarih, ciro }));
}

