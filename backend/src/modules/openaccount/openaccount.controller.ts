import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../database/prisma';
import { PaymentType, SaleStatus, Prisma, CashMovementType } from '@prisma/client';
import { calculateCommission } from '../payments/commission.service';
import { execute } from '../odoo/odoo.service';

const router = Router();
router.use(authenticate);

const JOURNAL_MAP: Record<string, number> = {
  CASH: 17,
  CARD: 18,
  BANK_TRANSFER: 19,
  TRANSFER: 19,
  HAVALE: 19,
};

function normalizePaymentType(raw: string): PaymentType {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'CASH') return PaymentType.CASH;
  if (t === 'CARD') return PaymentType.CARD;
  if (t === 'BANK_TRANSFER' || t === 'HAVALE' || t === 'TRANSFER') return PaymentType.TRANSFER;
  return t as PaymentType;
}

function saleBalances(
  payments: { paymentType: PaymentType; grossAmount: Prisma.Decimal; createdAt: Date }[],
) {
  // Borç: OPEN_ACCOUNT ödemeleri
  const openAccountTotal = payments
    .filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT)
    .reduce((acc, p) => acc + Number(p.grossAmount), 0);

  if (openAccountTotal === 0) return { openAccountTotal: 0, paidTotal: 0, remaining: 0 };

  // OPEN_ACCOUNT'un en erken tarihi
  const firstOpenDate = payments
    .filter((p) => p.paymentType === PaymentType.OPEN_ACCOUNT)
    .map((p) => p.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // Kapatma ödemeleri: OPEN_ACCOUNT tarihinden SONRA yapılan CASH/CARD/TRANSFER
  const closedAmount = payments
    .filter(
      (p) =>
        p.paymentType !== PaymentType.OPEN_ACCOUNT &&
        p.createdAt > firstOpenDate,
    )
    .reduce((acc, p) => acc + Number(p.grossAmount), 0);

  const remaining = Math.max(0, openAccountTotal - closedAmount);
  return { openAccountTotal, paidTotal: closedAmount, remaining };
}

type OdooInvoiceRow = { id: number; state: string; name: string; payment_state?: string };

function pickOpenInvoice(invoices: OdooInvoiceRow[]): OdooInvoiceRow | null {
  return (
    invoices.find((inv) => inv.state === 'posted' && inv.payment_state !== 'paid') ?? null
  );
}

async function syncPaymentToOdoo(
  sale: { id: string; odooSaleOrderId: number | null },
  customer: { odooPartnerId: number | null },
  amount: number,
  paymentType: PaymentType,
  saleId: string,
) {
  if (!sale.odooSaleOrderId) {
    throw new Error(`Odoo sipariş ID yok (saleId=${saleId})`);
  }

  const odooOrderId = sale.odooSaleOrderId;
  const odooPartnerId = customer.odooPartnerId ?? 1;
  const journalKey =
    paymentType === PaymentType.CASH
      ? 'CASH'
      : paymentType === PaymentType.CARD
        ? 'CARD'
        : 'TRANSFER';
  const journalId = JOURNAL_MAP[journalKey] ?? 17;

  const invoiceFields = ['id', 'state', 'name', 'payment_state'];
  const [orderData] = await execute('sale.order', 'read', [[odooOrderId]], {
    fields: ['name', 'invoice_ids'],
  });
  const orderName = orderData?.name ?? '';
  const invoiceIds: number[] = orderData?.invoice_ids ?? [];

  console.log('[Odoo] Açık hesap fatura aranıyor:', orderName, 'invoice_ids:', invoiceIds);

  let invoices: OdooInvoiceRow[] = [];
  if (invoiceIds.length > 0) {
    invoices = await execute('account.move', 'read', [invoiceIds], { fields: invoiceFields });
  } else if (orderName) {
    invoices = await execute(
      'account.move',
      'search_read',
      [
        [
          ['invoice_origin', '=', orderName],
          ['move_type', '=', 'out_invoice'],
          ['state', '=', 'posted'],
          ['payment_state', '!=', 'paid'],
        ],
      ],
      { fields: invoiceFields, limit: 1 },
    );
  }

  console.log('[Odoo] Açık hesap bulunan faturalar:', JSON.stringify(invoices), 'invoice found:', invoices.length > 0);

  const openInvoice = pickOpenInvoice(invoices ?? []);
  if (!openInvoice) {
    throw new Error(`Açık fatura bulunamadı (saleId=${saleId}, order=${orderName || odooOrderId})`);
  }

  const invoiceId = openInvoice.id;

  const paymentId = await execute('account.payment', 'create', [
    {
      payment_type: 'inbound',
      partner_type: 'customer',
      partner_id: odooPartnerId,
      amount,
      journal_id: journalId,
      ref: `POS OPEN_ACCOUNT ${paymentType} - ${saleId}`,
      date: new Date().toISOString().split('T')[0],
    },
  ]);

  await execute('account.payment', 'action_post', [[paymentId]]).catch(() => {});

  const paymentMoves = await execute('account.payment', 'read', [[paymentId]], {
    fields: ['move_id'],
  });

  if (paymentMoves?.[0]?.move_id?.[0]) {
    const paymentMoveId = paymentMoves[0].move_id[0];
    const invoiceLines = await execute(
      'account.move.line',
      'search_read',
      [
        [
          ['move_id', '=', invoiceId],
          ['account_type', 'in', ['asset_receivable']],
          ['reconciled', '=', false],
        ],
      ],
      { fields: ['id'], limit: 1 },
    );
    const paymentLines = await execute(
      'account.move.line',
      'search_read',
      [
        [
          ['move_id', '=', paymentMoveId],
          ['account_type', 'in', ['asset_receivable']],
          ['reconciled', '=', false],
        ],
      ],
      { fields: ['id'], limit: 1 },
    );
    if (invoiceLines?.[0] && paymentLines?.[0]) {
      try {
        await execute('account.move.line', 'reconcile', [
          [invoiceLines[0].id, paymentLines[0].id],
        ]);
      } catch (e: any) {
        throw new Error(`Mutabakat hatası (saleId=${saleId}): ${e?.message ?? e}`);
      }
    }
  }
}

type OpenSaleRow = {
  saleId: string;
  createdAt: Date;
  itemsCount: number;
  netTotal: number;
  openAccountTotal: number;
  paidTotal: number;
  remaining: number;
};

async function fetchCustomerOpenSales(customerId: string): Promise<OpenSaleRow[]> {
  const sales = await prisma.sale.findMany({
    where: {
      customerId,
      status: SaleStatus.PAID,
      payments: { some: { paymentType: PaymentType.OPEN_ACCOUNT } },
    },
    include: {
      payments: { select: { paymentType: true, grossAmount: true, createdAt: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return sales
    .map((sale) => {
      const { openAccountTotal, paidTotal, remaining } = saleBalances(sale.payments);
      return {
        saleId: sale.id,
        createdAt: sale.createdAt,
        itemsCount: sale._count.items,
        netTotal: Number(sale.netTotal),
        openAccountTotal,
        paidTotal,
        remaining,
      };
    })
    .filter((s) => s.openAccountTotal > 0 && s.remaining > 0);
}

function computeFifoDistribution(
  sales: OpenSaleRow[],
  tutar: number,
): Array<{ saleId: string; tutar: number; remaining: number }> {
  let left = tutar;
  const result: Array<{ saleId: string; tutar: number; remaining: number }> = [];

  for (const sale of sales) {
    if (left <= 0.001) break;
    const alloc = Math.min(left, sale.remaining);
    if (alloc <= 0.001) continue;
    result.push({ saleId: sale.saleId, tutar: Math.round(alloc * 100) / 100, remaining: sale.remaining });
    left = Math.round((left - alloc) * 100) / 100;
  }

  return result;
}

type PaymentInput = {
  customerId: string;
  saleId: string;
  amount: number;
  paymentType: string;
  note?: string | null;
  bankId?: string;
  posDeviceId?: string;
  installment?: number;
};

async function applyOpenAccountPayment(
  userId: string,
  input: PaymentInput,
): Promise<{ payment: Awaited<ReturnType<typeof prisma.payment.create>>; odooSyncError?: string }> {
  const { customerId, saleId, amount, paymentType, note, bankId, posDeviceId, installment } = input;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, payments: true },
  });

  if (!sale || sale.customerId !== customerId) {
    throw new Error('Satış bulunamadı');
  }

  if (sale.status !== SaleStatus.PAID) {
    throw new Error('Satış ödeme alınamaz durumda');
  }

  const { remaining } = saleBalances(sale.payments);
  if (remaining <= 0) {
    throw new Error('Bu satışta açık bakiye yok');
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Tutar geçersiz');
  }

  if (amt > remaining + 0.01) {
    throw new Error(`Tutar kalan bakiyeden fazla (saleId=${saleId}, kalan=${remaining})`);
  }

  const normalizedType = normalizePaymentType(paymentType);
  const now = new Date();
  const grossStr = String(amt);

  let commissionRate: Prisma.Decimal | null = null;
  let commissionAmount: Prisma.Decimal | null = null;
  let netAmount = new Prisma.Decimal(amt);

  if (normalizedType === PaymentType.CARD) {
    if (!bankId || !posDeviceId || !installment) {
      throw new Error('Kart ödemesi için banka, POS ve taksit zorunlu');
    }
    const commission = await calculateCommission(bankId, Number(installment), grossStr, now);
    commissionRate = new Prisma.Decimal(commission.commissionRate);
    commissionAmount = new Prisma.Decimal(commission.commissionAmount);
    netAmount = new Prisma.Decimal(commission.netAmount);
  }

  const payment = await prisma.payment.create({
    data: {
      saleId: sale.id,
      paymentType: normalizedType,
      grossAmount: new Prisma.Decimal(amt),
      netAmount,
      bankId: normalizedType === PaymentType.CARD ? bankId : null,
      posDeviceId: normalizedType === PaymentType.CARD ? posDeviceId : null,
      installment: normalizedType === PaymentType.CARD ? Number(installment) : null,
      commissionRate,
      commissionAmount,
    },
  });

  if (normalizedType === PaymentType.CASH) {
    await prisma.cashMovement.create({
      data: {
        branchId: sale.branchId,
        shiftId: sale.shiftId,
        userId,
        type: CashMovementType.CASH_IN,
        amount: new Prisma.Decimal(amt),
        description: `OPEN_ACCOUNT_PAYMENT:${customerId}:${saleId}:${note ?? ''}`,
      },
    });
  }

  let odooSyncError: string | undefined;
  try {
    await syncPaymentToOdoo(sale, sale.customer, amt, normalizedType, saleId);
  } catch (odooErr: any) {
    odooSyncError = odooErr?.message ?? String(odooErr);
    console.error('[Odoo] Açık hesap ödeme sync hatası:', odooSyncError);
  }

  return { payment, odooSyncError };
}

// Tüm açık hesaplı müşteriler — bakiye özeti
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search ?? '')
      .trim()
      .toLowerCase();

    const sales = await prisma.sale.findMany({
      where: {
        status: SaleStatus.PAID,
        payments: { some: { paymentType: PaymentType.OPEN_ACCOUNT } },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: { select: { paymentType: true, grossAmount: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customerMap = new Map<
      string,
      {
        customer: { id: string; name: string; phone: string };
        totalDebt: number;
        paidAmount: number;
        remainingDebt: number;
        sales: any[];
      }
    >();

    for (const sale of sales) {
      const customer = sale.customer;
      if (!customer) continue;

      const { openAccountTotal, paidTotal, remaining } = saleBalances(sale.payments);
      if (openAccountTotal <= 0 || remaining <= 0) continue;

      if (!customerMap.has(customer.id)) {
        customerMap.set(customer.id, {
          customer,
          totalDebt: 0,
          paidAmount: 0,
          remainingDebt: 0,
          sales: [],
        });
      }

      const entry = customerMap.get(customer.id)!;
      entry.totalDebt += openAccountTotal;
      entry.paidAmount += paidTotal;
      entry.remainingDebt += remaining;
      entry.sales.push({
        saleId: sale.id,
        amount: openAccountTotal,
        paid: paidTotal,
        remaining,
        date: sale.createdAt,
        saleStatus: sale.status,
      });
    }

    let result = Array.from(customerMap.values()).sort((a, b) => b.remainingDebt - a.remainingDebt);

    if (search.length >= 1) {
      result = result.filter(
        (e) =>
          e.customer.name.toLowerCase().includes(search) ||
          e.customer.phone.toLowerCase().includes(search),
      );
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Müşterinin açık satışları için FIFO dağıtım önerisi
router.get('/customer/:customerId/fifo-oneri', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const tutar = Number(req.query.tutar);

    if (!Number.isFinite(tutar) || tutar <= 0) {
      return res.status(400).json({ success: false, error: 'Tutar geçersiz' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Müşteri bulunamadı' });
    }

    const openSales = await fetchCustomerOpenSales(customerId);
    const dagitim = computeFifoDistribution(openSales, tutar);
    const dagitimToplam = dagitim.reduce((acc, d) => acc + d.tutar, 0);
    const kalanTutar = Math.max(0, Math.round((tutar - dagitimToplam) * 100) / 100);

    res.json({
      success: true,
      data: {
        customer,
        toplamTutar: tutar,
        dagitim,
        dagitimToplam,
        kalanTutar,
        acikSatislar: openSales,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Müşterinin açık hesap detayı
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, odooPartnerId: true },
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Müşteri bulunamadı' });
    }

    const saleRows = await fetchCustomerOpenSales(customerId);
    const sortedRows = [...saleRows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const totalDebt = saleRows.reduce((acc, s) => acc + s.openAccountTotal, 0);
    const paidAmount = saleRows.reduce((acc, s) => acc + s.paidTotal, 0);
    const remainingDebt = saleRows.reduce((acc, s) => acc + s.remaining, 0);

    res.json({
      success: true,
      data: {
        customer,
        totalDebt,
        paidAmount,
        remainingDebt,
        sales: sortedRows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Açık hesaba ödeme gir
router.post('/payment', async (req: Request, res: Response) => {
  try {
    const { customerId, saleId, amount, paymentType, note, bankId, posDeviceId, installment } = req.body;

    if (!customerId || !saleId || amount == null || !paymentType) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }

    const { payment } = await applyOpenAccountPayment(req.user!.userId, {
      customerId,
      saleId,
      amount: Number(amount),
      paymentType,
      note,
      bankId,
      posDeviceId,
      installment,
    });

    res.json({ success: true, data: payment });
  } catch (err: any) {
    const msg = err?.message ?? 'Ödeme kaydedilemedi';
    if (msg.includes('bulunamadı') || msg.includes('geçersiz') || msg.includes('fazla') || msg.includes('açık bakiye')) {
      return res.status(400).json({ success: false, error: msg });
    }
    res.status(500).json({ success: false, error: msg });
  }
});

// Açık hesaba toplu ödeme gir
router.post('/payment-toplu', async (req: Request, res: Response) => {
  try {
    const { customerId, toplamTutar, paymentType, dagitim, note, bankId, posDeviceId, installment } =
      req.body;

    if (!customerId || toplamTutar == null || !paymentType || !Array.isArray(dagitim)) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }

    const total = Number(toplamTutar);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ success: false, error: 'Toplam tutar geçersiz' });
    }

    if (dagitim.length === 0) {
      return res.status(400).json({ success: false, error: 'Dağıtım listesi boş olamaz' });
    }

    const normalizedType = normalizePaymentType(paymentType);
    if (normalizedType === PaymentType.CARD && (!bankId || !posDeviceId || !installment)) {
      return res.status(400).json({ success: false, error: 'Kart ödemesi için banka, POS ve taksit zorunlu' });
    }

    let dagitimToplam = 0;
    const seenSaleIds = new Set<string>();
    for (const row of dagitim) {
      const rowAmt = Number(row?.tutar);
      if (!row?.saleId || !Number.isFinite(rowAmt) || rowAmt <= 0) {
        return res.status(400).json({ success: false, error: 'Dağıtım satırı geçersiz' });
      }
      if (seenSaleIds.has(row.saleId)) {
        return res.status(400).json({ success: false, error: `Tekrarlayan satış: ${row.saleId}` });
      }
      seenSaleIds.add(row.saleId);
      dagitimToplam += rowAmt;
    }

    dagitimToplam = Math.round(dagitimToplam * 100) / 100;
    if (Math.abs(dagitimToplam - total) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `Dağıtım toplamı (${dagitimToplam}) girilen tutarla (${total}) eşleşmiyor`,
      });
    }

    const openSales = await fetchCustomerOpenSales(customerId);
    const remainingBySale = new Map(openSales.map((s) => [s.saleId, s.remaining]));

    for (const row of dagitim) {
      const remaining = remainingBySale.get(row.saleId);
      if (remaining == null) {
        return res.status(400).json({
          success: false,
          error: `Satış açık bakiyede değil: ${row.saleId}`,
        });
      }
      if (Number(row.tutar) > remaining + 0.01) {
        return res.status(400).json({
          success: false,
          error: `Tutar kalan bakiyeden fazla (saleId=${row.saleId}, kalan=${remaining})`,
        });
      }
    }

    const payments: Awaited<ReturnType<typeof prisma.payment.create>>[] = [];
    const odooErrors: Array<{ saleId: string; error: string }> = [];

    for (const row of dagitim) {
      try {
        const result = await applyOpenAccountPayment(req.user!.userId, {
          customerId,
          saleId: row.saleId,
          amount: Number(row.tutar),
          paymentType,
          note,
          bankId,
          posDeviceId,
          installment,
        });
        payments.push(result.payment);
        if (result.odooSyncError) {
          odooErrors.push({ saleId: row.saleId, error: result.odooSyncError });
        }
      } catch (rowErr: any) {
        return res.status(400).json({
          success: false,
          error: rowErr?.message ?? 'Ödeme kaydedilemedi',
          partialPayments: payments.length,
        });
      }
    }

    res.json({
      success: true,
      data: {
        payments,
        odooErrors,
        odooSyncOk: odooErrors.length === 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
