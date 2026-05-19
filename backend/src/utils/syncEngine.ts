import { SyncStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import * as odooService from '../modules/odooConnector/odoo.service';

export async function runSyncEngine() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const sales = await prisma.sale.findMany({
    where: {
      syncStatus: { in: [SyncStatus.PENDING, SyncStatus.ERROR] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true },
  });

  const tasks = sales.map((s) => odooService.syncSale(s.id));
  await Promise.allSettled(tasks);
}

