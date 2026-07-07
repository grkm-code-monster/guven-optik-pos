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

async function syncPaymentToOdoo(
  sale: { id: string; odooSaleOrderId: number | null },
  customer: { odooPartnerId: number | null },
  amount: number,
  paymentType: PaymentType,
  saleId: string,
) {
  if (!sale.odooSaleOrderId) return;

  const odooOrderId = sale.odooSaleOrderId;
  const odooPartnerId = customer.odooPartnerId ?? 1;
  const journalKey =
    paymentType === PaymentType.CASH
      ? 'CASH'
      : paymentType === PaymentType.CARD
        ? 'CARD'
        : 'TRANSFER';
  const journalId = JOURNAL_MAP[journalKey] ?? 17;

  const invoiceFields = ['id', 'state', 'name'];
  const [orderData] = await execute('sale.order', 'read', [[odooOrderId]], {
    fields: ['name', 'invoice_ids'],
  });
  const orderName = orderData?.name ?? '';
  const invoiceIds: number[] = orderData?.invoice_ids ?? [];

  console.log('[Odoo] Açık hesap fatura aranıyor:', orderName, 'invoice_ids:', invoiceIds);

  let invoices: Array<{ id: number; state: string; name: string }> = [];
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
        ],
      ],
      { fields: invoiceFields, limit: 1 },
    );
  }

  console.log('[Odoo] Açık hesap bulunan faturalar:', JSON.stringify(invoices), 'invoice found:', invoices.length > 0);

  if (!invoices?.length) return;

  const invoiceId = invoices[0].id;

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
      await execute('account.move.line', 'reconcile', [
        [invoiceLines[0].id, paymentLines[0].id],
      ]).catch((e) => console.error('[Odoo] Açık hesap mutabakat hatası:', e));
    }
  }
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
      orderBy: { createdAt: 'desc' },
    });

    const saleRows = sales
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
        sales: saleRows,
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

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        payments: true,
      },
    });

    if (!sale || sale.customerId !== customerId) {
      return res.status(404).json({ success: false, error: 'Satış bulunamadı' });
    }

    if (sale.status !== SaleStatus.PAID) {
      return res.status(400).json({ success: false, error: 'Satış ödeme alınamaz durumda' });
    }

    const { remaining } = saleBalances(sale.payments);
    if (remaining <= 0) {
      return res.status(400).json({ success: false, error: 'Bu satışta açık bakiye yok' });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Tutar geçersiz' });
    }

    if (amt > remaining + 0.01) {
      return res.status(400).json({ success: false, error: 'Tutar kalan bakiyeden fazla' });
    }

    const normalizedType = normalizePaymentType(paymentType);
    const now = new Date();
    const grossStr = String(amt);

    let commissionRate: Prisma.Decimal | null = null;
    let commissionAmount: Prisma.Decimal | null = null;
    let netAmount = new Prisma.Decimal(amt);

    if (normalizedType === PaymentType.CARD) {
      if (!bankId || !posDeviceId || !installment) {
        return res.status(400).json({ success: false, error: 'Kart ödemesi için banka, POS ve taksit zorunlu' });
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
          userId: req.user!.userId,
          type: CashMovementType.CASH_IN,
          amount: new Prisma.Decimal(amt),
          description: `OPEN_ACCOUNT_PAYMENT:${customerId}:${saleId}:${note ?? ''}`,
        },
      });
    }

    try {
      await syncPaymentToOdoo(sale, sale.customer, amt, normalizedType, saleId);
    } catch (odooErr) {
      console.error('[Odoo] Açık hesap ödeme sync hatası:', odooErr);
    }

    res.json({ success: true, data: payment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
