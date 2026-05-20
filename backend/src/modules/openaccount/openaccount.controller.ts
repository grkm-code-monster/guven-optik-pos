import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../database/prisma';
import { PaymentType, SaleStatus, Prisma } from '@prisma/client';

const router = Router();
router.use(authenticate);

// Tüm açık hesaplı müşteriler — bakiye özeti
router.get('/', async (req: Request, res: Response) => {
  try {
    // OPEN_ACCOUNT ödemesi olan satışları bul
    const openPayments = await prisma.payment.findMany({
      where: { paymentType: PaymentType.OPEN_ACCOUNT },
      include: {
        sale: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Müşteri bazında grupla
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

    for (const payment of openPayments) {
      const customer = payment.sale?.customer;
      if (!customer) continue;

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
      entry.totalDebt += Number(payment.grossAmount);
      entry.sales.push({
        saleId: payment.saleId,
        amount: Number(payment.grossAmount),
        date: payment.createdAt,
        saleStatus: payment.sale?.status,
      });
    }

    // Ödeme girişlerini de hesapla (OpenAccountPayment tablosu yoksa Payment'tan)
    // Şimdilik remainingDebt = totalDebt
    for (const entry of customerMap.values()) {
      entry.remainingDebt = entry.totalDebt - entry.paidAmount;
    }

    const result = Array.from(customerMap.values())
      .filter((e) => e.remainingDebt > 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt);

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Müşterinin açık hesap detayı
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const payments = await prisma.payment.findMany({
      where: {
        paymentType: PaymentType.OPEN_ACCOUNT,
        sale: { customerId },
      },
      include: {
        sale: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            items: { include: { product: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customer = payments[0]?.sale?.customer;
    const totalDebt = payments.reduce((acc, p) => acc + Number(p.grossAmount), 0);

    res.json({
      success: true,
      data: { customer, totalDebt, remainingDebt: totalDebt, payments },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Açık hesaba ödeme gir
router.post('/payment', async (req: Request, res: Response) => {
  try {
    const { customerId, amount, paymentType, note, bankId, posDeviceId, installment } = req.body;
    if (!customerId || !amount || !paymentType) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }

    // Müşterinin en eski ödenmemiş OPEN_ACCOUNT satışını bul
    const openPayments = await prisma.payment.findMany({
      where: {
        paymentType: PaymentType.OPEN_ACCOUNT,
        sale: { customerId, status: SaleStatus.PAID },
      },
      include: { sale: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!openPayments.length) {
      return res.status(404).json({ success: false, error: 'Açık hesap bulunamadı' });
    }

    // İlk satışın shift ve branch bilgisini al
    const firstSale = openPayments[0].sale;

    // Ödemeyi kaydet — yeni bir payment olarak
    const payment = await prisma.payment.create({
      data: {
        saleId: firstSale.id,
        paymentType: paymentType as PaymentType,
        grossAmount: new Prisma.Decimal(amount),
        netAmount: new Prisma.Decimal(amount),
        bankId: bankId ?? null,
        posDeviceId: posDeviceId ?? null,
        installment: installment ?? null,
        commissionRate: null,
        commissionAmount: null,
      },
    });

    // Kasa hareketi oluştur
    if (paymentType === 'CASH') {
      await prisma.cashMovement.create({
        data: {
          branchId: firstSale.branchId,
          shiftId: firstSale.shiftId,
          userId: (req as any).user?.id ?? firstSale.userId,
          type: 'CASH_IN',
          amount: new Prisma.Decimal(amount),
          description: `OPEN_ACCOUNT_PAYMENT:${customerId}:${note ?? ''}`,
        },
      });
    }

    res.json({ success: true, data: payment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

