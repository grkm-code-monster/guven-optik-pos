import { SyncStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';

async function createOdooCustomer(_customer: any) {
  return { odooId: 'MOCK-123' };
}

async function createOdooSaleOrder(_sale: any) {
  return { odooSaleId: 'MOCK-SO-456' };
}

async function createOdooPayment(_payments: any[]) {
  return { success: true };
}

async function moveOdooStock(_items: any[]) {
  return { success: true };
}

export async function syncSale(saleId: string) {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        items: { include: { product: true, prescription: true, frames: true } },
        payments: true,
      },
    });

    if (!sale) {
      await prisma.syncLog.create({
        data: {
          saleId,
          action: 'sync_sale',
          status: 'error',
          payload: { saleId },
          error: 'SALE_NOT_FOUND',
        },
      });
      return { status: 'error' as const };
    }

    const customerRes = await createOdooCustomer(sale.customer);
    const saleOrderRes = await createOdooSaleOrder(sale);
    await createOdooPayment(sale.payments);
    await moveOdooStock(sale.items);

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        syncStatus: SyncStatus.SYNCED,
        odooSaleId: saleOrderRes.odooSaleId,
      },
    });

    await prisma.syncLog.create({
      data: {
        saleId,
        action: 'sync_sale',
        status: 'success',
        payload: {
          saleId,
          mock: true,
        },
        response: {
          customer: customerRes,
          saleOrder: saleOrderRes,
        },
      },
    });

    console.log(`[odoo-mock] synced sale ${saleId}`);
    return { status: 'synced' as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.sale.update({
      where: { id: saleId },
      data: { syncStatus: SyncStatus.ERROR, syncError: msg },
    }).catch(() => {});

    await prisma.syncLog.create({
      data: {
        saleId,
        action: 'sync_sale',
        status: 'error',
        payload: { saleId },
        error: msg,
      },
    }).catch(() => {});

    return { status: 'error' as const };
  }
}

