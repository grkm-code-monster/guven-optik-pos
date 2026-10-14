/**
 * Manuel / Kağıt Üstü Eski Borç Tahsilatı (14.10.2026) — bkz. schema.prisma
 * ManuelTahsilat modeli. Müşterinin sistemde HİÇ satış kaydı olmadığı, borcun
 * sadece elde kağıt üzerinde tutulduğu durumlar için: sadece müşteri kaydı
 * seçilerek/girilerek yapılan, herhangi bir Sale/Payment'a bağlı OLMAYAN
 * serbest tahsilat kaydı. Açık Hesap sayfasındaki yeni sekmeden girilir.
 *
 * ÖNEMLİ: Sandbox'ta `prisma generate` çalışamadığı için (binaries.prisma.sh'a
 * 403) üretilen Prisma Client'ta henüz `prisma.manuelTahsilat` erişimcisi yok.
 * Bu yüzden bu model için $queryRaw/$executeRaw kullanılıyor — bu, şema/migration
 * değişikliğinin canlıda çalışabilmesi için `prisma generate`'e bağımlı DEĞİL.
 */
import { randomUUID } from 'crypto';
import { CashMovementType, Prisma, ShiftStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export type ManuelTahsilatRow = {
  id: string;
  branchId: string;
  userId: string;
  customerId: string;
  customerAdi: string;
  tutar: string;
  odemeTuru: string;
  aciklama: string | null;
  shiftId: string | null;
  createdAt: Date;
};

const ODEME_TURU_LABEL: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kart',
  TRANSFER: 'Havale',
};

export type CreateManuelTahsilatInput = {
  customerId: string;
  tutar: number;
  odemeTuru: 'CASH' | 'CARD' | 'TRANSFER';
  aciklama?: string | null;
};

export async function createManuelTahsilat(
  actingUser: { userId: string; branchId: string | null },
  input: CreateManuelTahsilatInput,
): Promise<{ kayit: ManuelTahsilatRow; cashMovementUyari?: string }> {
  const branchId = actingUser.branchId;
  if (!branchId) {
    throw codeError('BRANCH_REQUIRED', 'Şube belirlenemedi.');
  }

  const tutar = Number(input.tutar);
  if (!Number.isFinite(tutar) || tutar <= 0) {
    throw codeError('INVALID_AMOUNT', 'Tutar geçersiz.');
  }

  const odemeTuru = String(input.odemeTuru ?? '').toUpperCase();
  if (!['CASH', 'CARD', 'TRANSFER'].includes(odemeTuru)) {
    throw codeError('INVALID_PAYMENT_TYPE', 'Ödeme türü geçersiz.');
  }

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true },
  });
  if (!customer) {
    throw codeError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  }

  const aktifVardiya = await prisma.shift.findFirst({
    where: { branchId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });

  const id = randomUUID();
  const aciklama = input.aciklama?.trim() || null;

  await prisma.$executeRaw`
    INSERT INTO "ManuelTahsilat"
      ("id", "branchId", "userId", "customerId", "customerAdi", "tutar", "odemeTuru", "aciklama", "shiftId", "createdAt")
    VALUES
      (${id}, ${branchId}, ${actingUser.userId}, ${customer.id}, ${customer.name}, ${tutar}, ${odemeTuru}, ${aciklama}, ${aktifVardiya?.id ?? null}, now())
  `;

  let cashMovementUyari: string | undefined;
  if (odemeTuru === 'CASH') {
    if (!aktifVardiya) {
      cashMovementUyari =
        'Açık vardiya bulunamadı — bu nakit tahsilat kasa sayımına (vardiya kapanışı beklenen nakit) işlenemedi. Vardiya açıldıktan sonra tutarı kasa düzeltme ekranından girin.';
      console.warn(`[manuelTahsilat] Açık vardiya yok (branchId=${branchId}) — CashMovement oluşturulamadı.`);
    } else {
      await prisma.cashMovement.create({
        data: {
          branchId,
          shiftId: aktifVardiya.id,
          userId: actingUser.userId,
          type: CashMovementType.CASH_IN,
          amount: new Prisma.Decimal(tutar),
          description: `MANUEL_TAHSILAT:${customer.id}:${customer.name}:${aciklama ?? ''}`,
        },
      });
    }
  }

  const kayit: ManuelTahsilatRow = {
    id,
    branchId,
    userId: actingUser.userId,
    customerId: customer.id,
    customerAdi: customer.name,
    tutar: String(tutar),
    odemeTuru,
    aciklama,
    shiftId: aktifVardiya?.id ?? null,
    createdAt: new Date(),
  };

  return { kayit, cashMovementUyari };
}

export async function listManuelTahsilat(branchId: string, limit = 50): Promise<Array<ManuelTahsilatRow & { odemeTuruLabel: string }>> {
  const rows = await prisma.$queryRaw<ManuelTahsilatRow[]>`
    SELECT "id", "branchId", "userId", "customerId", "customerAdi", "tutar", "odemeTuru", "aciklama", "shiftId", "createdAt"
    FROM "ManuelTahsilat"
    WHERE "branchId" = ${branchId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, odemeTuruLabel: ODEME_TURU_LABEL[r.odemeTuru] ?? r.odemeTuru }));
}

/**
 * Bu vardiyanın açık olduğu zaman aralığında girilmiş manuel tahsilatlar —
 * getDailyReport'un "Manuel / Kağıt Üstü Borç Tahsilatları" bölümünde gösterilir.
 */
export async function buildManuelTahsilatRows(
  branchId: string,
  shift: { openedAt: Date; closedAt: Date | null },
): Promise<Array<{ id: string; customerName: string; amount: string; paymentTypeLabel: string; aciklama: string | null; createdAt: string }>> {
  const rows = shift.closedAt
    ? await prisma.$queryRaw<ManuelTahsilatRow[]>`
        SELECT "id", "branchId", "userId", "customerId", "customerAdi", "tutar", "odemeTuru", "aciklama", "shiftId", "createdAt"
        FROM "ManuelTahsilat"
        WHERE "branchId" = ${branchId} AND "createdAt" >= ${shift.openedAt} AND "createdAt" <= ${shift.closedAt}
        ORDER BY "createdAt" ASC
      `
    : await prisma.$queryRaw<ManuelTahsilatRow[]>`
        SELECT "id", "branchId", "userId", "customerId", "customerAdi", "tutar", "odemeTuru", "aciklama", "shiftId", "createdAt"
        FROM "ManuelTahsilat"
        WHERE "branchId" = ${branchId} AND "createdAt" >= ${shift.openedAt}
        ORDER BY "createdAt" ASC
      `;

  return rows.map((r) => ({
    id: r.id,
    customerName: r.customerAdi,
    amount: r.tutar.toString(),
    paymentTypeLabel: ODEME_TURU_LABEL[r.odemeTuru] ?? r.odemeTuru,
    aciklama: r.aciklama,
    createdAt: r.createdAt.toISOString(),
  }));
}
