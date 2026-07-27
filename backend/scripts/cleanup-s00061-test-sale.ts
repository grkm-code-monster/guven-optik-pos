/**
 * Test satışı temizliği — S00061 / SFAT/2026/00043
 * Sale.id = c8517adb-2e6e-48d3-8eae-89c8cd1d656f
 *
 *   npx tsx scripts/cleanup-s00061-test-sale.ts
 */
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

const SALE_ID = 'c8517adb-2e6e-48d3-8eae-89c8cd1d656f';
const ODOO_SO_ID = 59;
const ODOO_INVOICE_ID = 194;
const ODOO_PICKING_ID = 189;
const PAYMENT_IDS = [57, 58];
const PARTIAL_RECONCILE_IDS = [49, 50];

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function odooStep(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`[odoo] OK: ${label}`);
    return true;
  } catch (err) {
    console.warn(`[odoo] ATLA/HATA: ${label} — ${errMsg(err).slice(0, 300)}`);
    return false;
  }
}

async function cleanupOdoo(): Promise<void> {
  console.log('\n=== ODOO TEMİZLİK ===');

  for (const prId of PARTIAL_RECONCILE_IDS) {
    await odooStep(`partial.reconcile unlink #${prId}`, async () => {
      await execute('account.partial.reconcile', 'unlink', [[prId]]);
    });
  }

  for (const payId of PAYMENT_IDS) {
    const [pay] = await execute('account.payment', 'read', [[payId]], {
      fields: ['id', 'name', 'state'],
    });
    if (!pay) {
      console.log(`[odoo] payment #${payId} bulunamadı, atlanıyor`);
      continue;
    }
    if (pay.state === 'posted') {
      await odooStep(`payment #${payId} action_draft`, async () => {
        await execute('account.payment', 'action_draft', [[payId]]);
      });
    }
    await odooStep(`payment #${payId} action_cancel`, async () => {
      await execute('account.payment', 'action_cancel', [[payId]]);
    });
  }

  const [inv] = await execute('account.move', 'read', [[ODOO_INVOICE_ID]], {
    fields: ['id', 'name', 'state'],
  });
  if (inv?.state === 'posted') {
    await odooStep(`invoice ${inv.name} button_draft`, async () => {
      await execute('account.move', 'button_draft', [[ODOO_INVOICE_ID]]);
    });
  }
  if (inv) {
    await odooStep(`invoice ${inv.name} button_cancel`, async () => {
      await execute('account.move', 'button_cancel', [[ODOO_INVOICE_ID]]);
    });
  }

  const [pick] = await execute('stock.picking', 'read', [[ODOO_PICKING_ID]], {
    fields: ['id', 'name', 'state'],
  });
  if (pick && pick.state !== 'cancel') {
    await odooStep(`picking ${pick.name} action_cancel`, async () => {
      await execute('stock.picking', 'action_cancel', [[ODOO_PICKING_ID]]);
    });
  }

  const [so] = await execute('sale.order', 'read', [[ODOO_SO_ID]], {
    fields: ['id', 'name', 'state'],
  });
  if (so && so.state !== 'cancel') {
    await odooStep(`SO ${so.name} action_cancel`, async () => {
      await execute('sale.order', 'action_cancel', [[ODOO_SO_ID]], {
        context: { disable_cancel_warning: true },
      });
    });
  }
}

async function cleanupPostgres(): Promise<void> {
  console.log('\n=== POSTGRES TEMİZLİK ===');

  const fkDeleted = await prisma.faturaKuyruk.deleteMany({ where: { satisId: SALE_ID } });
  console.log(`[pg] FaturaKuyruk silindi: ${fkDeleted.count}`);

  const cmDeleted = await prisma.cashMovement.deleteMany({
    where: { description: { contains: SALE_ID } },
  });
  console.log(`[pg] CashMovement silindi: ${cmDeleted.count}`);

  const sale = await prisma.sale.findUnique({
    where: { id: SALE_ID },
    include: { items: { include: { prescription: true, frames: true } }, payments: true },
  });
  if (!sale) {
    console.log('[pg] Sale zaten yok');
    return;
  }

  const itemIds = sale.items.map((i) => i.id);

  await prisma.$transaction(async (tx) => {
    for (const item of sale.items) {
      if (item.prescription) {
        await tx.prescription.delete({ where: { id: item.prescription.id } });
      }
      if (item.frames.length) {
        await tx.frame.deleteMany({ where: { saleItemId: item.id } });
      }
    }
    await tx.payment.deleteMany({ where: { saleId: SALE_ID } });
    await tx.saleItem.deleteMany({ where: { saleId: SALE_ID } });
    await tx.sale.delete({ where: { id: SALE_ID } });
  });

  console.log(`[pg] Sale silindi: ${SALE_ID} (${itemIds.length} kalem, ${sale.payments.length} ödeme)`);
}

async function verify(): Promise<void> {
  console.log('\n=== DOĞRULAMA ===');

  const so = await execute('sale.order', 'read', [[ODOO_SO_ID]], {
    fields: ['name', 'state', 'invoice_ids', 'picking_ids'],
  });
  console.log('SO59:', so[0] ? `${so[0].name} state=${so[0].state}` : 'YOK');

  const inv = await execute('account.move', 'read', [[ODOO_INVOICE_ID]], {
    fields: ['name', 'state', 'payment_state'],
  });
  console.log('SFAT/2026/00043:', inv[0] ? `state=${inv[0].state} payment=${inv[0].payment_state}` : 'YOK');

  const pick = await execute('stock.picking', 'read', [[ODOO_PICKING_ID]], { fields: ['name', 'state'] });
  console.log('WH/OUT/00049:', pick[0] ? `state=${pick[0].state}` : 'YOK');

  for (const pid of PAYMENT_IDS) {
    const p = await execute('account.payment', 'read', [[pid]], { fields: ['name', 'state'] });
    console.log(`Payment #${pid}:`, p[0] ? p[0].state : 'YOK');
  }

  const pgSale = await prisma.sale.findUnique({ where: { id: SALE_ID } });
  console.log('Postgres Sale:', pgSale ? 'HALA VAR' : 'silindi');

  const fk = await prisma.faturaKuyruk.count({ where: { satisId: SALE_ID } });
  console.log('FaturaKuyruk:', fk === 0 ? 'temiz' : `${fk} kayıt kaldı`);
}

async function main() {
  console.log('S00061 test satış temizliği başlıyor…');
  await cleanupOdoo();
  await cleanupPostgres();
  await verify();
  console.log('\nBitti.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
