import { Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';

export const DIMENSIONS: Record<string, { label: string; sql: Prisma.Sql }> = {
  tarih_gun: { label: 'Gün', sql: Prisma.sql`DATE("Sale"."createdAt")` },
  tarih_ay: { label: 'Ay', sql: Prisma.sql`DATE_TRUNC('month', "Sale"."createdAt")` },
  sube: { label: 'Şube', sql: Prisma.sql`"Branch"."code"` },
  personel: { label: 'Personel', sql: Prisma.sql`"User"."name"` },
  odeme_tipi: { label: 'Ödeme Tipi', sql: Prisma.sql`"Payment"."paymentType"` },
};

export const MEASURES: Record<string, { label: string; sql: Prisma.Sql }> = {
  toplam_tutar: { label: 'Toplam Tutar', sql: Prisma.sql`SUM("Sale"."netTotal")` },
  satis_adedi: { label: 'Satış Adedi', sql: Prisma.sql`COUNT(DISTINCT "Sale"."id")` },
  ortalama_sepet: { label: 'Ortalama Sepet', sql: Prisma.sql`AVG("Sale"."netTotal")` },
  sgk_katki: { label: 'SGK Katkısı', sql: Prisma.sql`SUM("Sale"."sgkAmount")` },
  vakif_katki: { label: 'Vakıf Katkısı', sql: Prisma.sql`SUM("Sale"."prescriptionAmount")` },
};

function reportValidationError(message: string) {
  const err = new Error(message) as Error & { code: string };
  err.code = 'REPORT_VALIDATION_ERROR';
  return err;
}

function assertWhitelistKeys(keys: string[], dict: Record<string, unknown>, max: number, label: string) {
  if (keys.length === 0) {
    throw reportValidationError(`En az bir ${label} seçilmelidir.`);
  }
  if (keys.length > max) {
    throw reportValidationError(`En fazla ${max} ${label} seçilebilir.`);
  }
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    throw reportValidationError(`${label} listesinde tekrar eden anahtar var.`);
  }
  for (const key of keys) {
    if (!(key in dict)) {
      throw reportValidationError(`Geçersiz ${label} anahtarı: ${key}`);
    }
  }
}

function endOfDayUtc(date: Date) {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export function getAvailableFields() {
  return {
    dimensions: Object.entries(DIMENSIONS).map(([key, value]) => ({ key, label: value.label })),
    measures: Object.entries(MEASURES).map(([key, value]) => ({ key, label: value.label })),
  };
}

export async function runReportQuery(input: {
  dimensions: string[];
  measures: string[];
  filters?: { tarihBaslangic?: Date; tarihBitis?: Date; subeId?: string };
}) {
  const { dimensions, measures, filters = {} } = input;

  assertWhitelistKeys(dimensions, DIMENSIONS, 3, 'boyut');
  assertWhitelistKeys(measures, MEASURES, 5, 'ölçü');

  const needsBranch = dimensions.includes('sube') || Boolean(filters.subeId);
  const needsUser = dimensions.includes('personel');
  const needsPayment = dimensions.includes('odeme_tipi');

  const selectParts: Prisma.Sql[] = [
    ...dimensions.map(
      (key) => Prisma.sql`${DIMENSIONS[key].sql} AS ${Prisma.raw(`"${key}"`)}`,
    ),
    ...measures.map(
      (key) => Prisma.sql`${MEASURES[key].sql} AS ${Prisma.raw(`"${key}"`)}`,
    ),
  ];

  const joins: Prisma.Sql[] = [];
  if (needsBranch) {
    joins.push(Prisma.sql`INNER JOIN "Branch" ON "Branch"."id" = "Sale"."branchId"`);
  }
  if (needsUser) {
    joins.push(Prisma.sql`INNER JOIN "User" ON "User"."id" = "Sale"."userId"`);
  }
  if (needsPayment) {
    joins.push(Prisma.sql`LEFT JOIN "Payment" ON "Payment"."saleId" = "Sale"."id"`);
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"Sale"."status" = ${SaleStatus.PAID}::"SaleStatus"`,
  ];

  if (filters.tarihBaslangic) {
    conditions.push(Prisma.sql`"Sale"."createdAt" >= ${filters.tarihBaslangic}`);
  }
  if (filters.tarihBitis) {
    conditions.push(Prisma.sql`"Sale"."createdAt" <= ${endOfDayUtc(filters.tarihBitis)}`);
  }
  if (filters.subeId) {
    conditions.push(Prisma.sql`"Sale"."branchId" = ${filters.subeId}`);
  }

  const groupByParts = dimensions.map((key) => DIMENSIONS[key].sql);

  const query = Prisma.sql`
    SELECT ${Prisma.join(selectParts, ', ')}
    FROM "Sale"
    ${joins.length ? Prisma.join(joins, ' ') : Prisma.empty}
    WHERE ${Prisma.join(conditions, ' AND ')}
    ${groupByParts.length ? Prisma.sql`GROUP BY ${Prisma.join(groupByParts, ', ')}` : Prisma.empty}
    ORDER BY ${groupByParts.length ? Prisma.join(groupByParts, ', ') : Prisma.sql`1`}
  `;

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(query);
  return rows;
}
