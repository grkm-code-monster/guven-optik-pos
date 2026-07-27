/**
 * OPA2026000289158 — fatura toplam farkı + PO/Bill iskonto teşhisi
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { getInboxInvoice, getInboxInvoiceList } from '../src/modules/uyumsoft/uyumsoft.service';

const FATURA_NO = 'OPA2026000289158';
const PO_NAME = 'P00039';
const BILL_NAME = 'BILL/2026/07/0004';

function satirToplamHesapla(
  lines: Array<{ miktar?: number; birimFiyat?: number; iskonto?: number; quantity?: number; price_unit?: number; discount?: number }>,
  opts: { qtyKey: 'miktar' | 'quantity'; priceKey: 'birimFiyat' | 'price_unit'; discKey: 'iskonto' | 'discount' },
) {
  return lines.reduce((acc, l) => {
    const qty = Number(l[opts.qtyKey] ?? 1);
    const price = Number(l[opts.priceKey] ?? 0);
    const disc = Number(l[opts.discKey] ?? 0);
    return acc + qty * price * (1 - disc / 100);
  }, 0);
}

async function odooTeşhis() {
  console.log('\n=== ODOO TEŞHİS ===');
  for (const cid of [2, 3, 4] as const) {
    const pos = await execute(
      'purchase.order',
      'search_read',
      [[['name', '=', PO_NAME]]],
      { fields: ['id', 'name', 'origin', 'invoice_ids', 'amount_untaxed'], limit: 1 },
      cid,
    ).catch(() => []);
    if (!pos[0]) continue;

    const po = pos[0] as { id: number; name: string; origin: string; invoice_ids: number[]; amount_untaxed: number };
    console.log(`\n[cid=${cid}] PO ${po.name} origin=${po.origin} amount_untaxed=${po.amount_untaxed}`);

    const poLines = await execute(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      { fields: ['id', 'product_id', 'product_qty', 'price_unit', 'discount', 'price_subtotal'], order: 'id asc' },
      cid,
    );
    console.log(`  PO satır sayısı: ${poLines.length}`);
    const poDiscSample = poLines.slice(0, 3).map((l: any) => ({
      price_unit: l.price_unit,
      discount: l.discount,
      subtotal: l.price_subtotal,
    }));
    console.log('  PO ilk 3 satır:', JSON.stringify(poDiscSample, null, 2));
    const poDiscCounts = poLines.reduce(
      (m: Record<string, number>, l: any) => {
        const k = String(l.discount ?? 0);
        m[k] = (m[k] ?? 0) + 1;
        return m;
      },
      {},
    );
    console.log('  PO discount dağılımı:', poDiscCounts);

    const bills = await execute(
      'account.move',
      'search_read',
      [[['name', '=', BILL_NAME]]],
      { fields: ['id', 'name', 'state', 'ref', 'invoice_origin', 'amount_untaxed'], limit: 1 },
      cid,
    ).catch(() => []);
    if (bills[0]) {
      const bill = bills[0] as { id: number; name: string; ref: string; invoice_origin: string; amount_untaxed: number };
      console.log(`  Bill ${bill.name} ref=${bill.ref} origin=${bill.invoice_origin} amount_untaxed=${bill.amount_untaxed}`);

      const invLines = await execute(
        'account.move.line',
        'search_read',
        [[['move_id', '=', bill.id], ['display_type', '=', false], ['product_id', '!=', false]]],
        { fields: ['id', 'name', 'quantity', 'price_unit', 'discount', 'price_subtotal'], order: 'id asc', limit: 5 },
        cid,
      );
      console.log(`  Bill ürün satırı (ilk 5):`, JSON.stringify(invLines, null, 2));

      const invLineCount = await execute(
        'account.move.line',
        'search_count',
        [[['move_id', '=', bill.id], ['display_type', '=', false], ['product_id', '!=', false]]],
        {},
        cid,
      );
      console.log(`  Bill ürün satır sayısı: ${invLineCount}`);

      const allInvLines = await execute(
        'account.move.line',
        'search_read',
        [[['move_id', '=', bill.id], ['display_type', '=', false], ['product_id', '!=', false]]],
        { fields: ['quantity', 'price_unit', 'discount'], order: 'id asc' },
        cid,
      );
      const billDiscCounts = (allInvLines as any[]).reduce(
        (m: Record<string, number>, l) => {
          const k = String(l.discount ?? 0);
          m[k] = (m[k] ?? 0) + 1;
          return m;
        },
        {},
      );
      console.log('  Bill discount dağılımı:', billDiscCounts);
    } else {
      console.log(`  Bill ${BILL_NAME} bulunamadı (cid=${cid})`);
    }
    break;
  }
}

async function uyumsoftTeşhis() {
  console.log('\n=== UYUMSOFT TEŞHİS ===');
  for (const sirketId of ['ng', 'adese', 'potential']) {
    let documentId: string | null = null;
    for (let page = 0; page < 20; page++) {
      const list = await getInboxInvoiceList(sirketId, {
        pageIndex: page,
        pageSize: 50,
        onlyUnread: false,
        createStartDate: new Date(Date.now() - 180 * 86400000),
      }).catch(() => null);
      if (!list) continue;
      const hit = list.items.find((i) => i.invoiceId.includes(FATURA_NO) || i.documentId.includes(FATURA_NO));
      if (hit) {
        documentId = hit.documentId || hit.invoiceId;
        console.log(`[${sirketId}] listede bulundu documentId=${documentId} listTaxExclusive=${hit.taxExclusiveAmount}`);
        break;
      }
      if (list.items.length < list.pageSize) break;
    }

    if (!documentId) {
      // doğrudan arama — fatura no ile listeyi tara
      const list = await getInboxInvoiceList(sirketId, {
        pageIndex: 0,
        pageSize: 200,
        onlyUnread: false,
        createStartDate: new Date(Date.now() - 365 * 86400000),
      }).catch(() => null);
      const hit = list?.items.find((i) => String(i.invoiceId).includes('9158'));
      if (hit) documentId = hit.documentId || hit.invoiceId;
    }

    if (!documentId) {
      console.log(`[${sirketId}] fatura listede bulunamadı`);
      continue;
    }

    const detay = await getInboxInvoice(sirketId, documentId);
    if (!detay) {
      console.log(`[${sirketId}] detay alınamadı`);
      continue;
    }

    const satirToplam = satirToplamHesapla(detay.lines, {
      qtyKey: 'miktar',
      priceKey: 'birimFiyat',
      discKey: 'iskonto',
    });
    const satirToplamIskontosuz = detay.lines.reduce(
      (acc, l) => acc + l.miktar * l.birimFiyat,
      0,
    );
    const toplamMiktar = detay.lines.reduce((acc, l) => acc + l.miktar, 0);

    console.log(`\n[${sirketId}] invoiceNo=${detay.invoiceNo}`);
    console.log(`  XML InvoiceLine sayısı: ${detay.lines.length}`);
    console.log(`  Toplam miktar (sum InvoicedQuantity): ${toplamMiktar}`);
    console.log(`  LegalMonetaryTotal/TaxExclusiveAmount: ${detay.taxExclusiveAmount}`);
    console.log(`  PayableAmount: ${detay.payableAmount}`);
    console.log(`  Parse satır toplamı (iskontolu): ${Math.round(satirToplam * 100) / 100}`);
    console.log(`  Parse satır toplamı (iskontosuz): ${Math.round(satirToplamIskontosuz * 100) / 100}`);
    console.log(`  taxExclusive − satirToplam(iskontolu): ${Math.round((detay.taxExclusiveAmount - satirToplam) * 100) / 100}`);
    console.log(`  İlk satır:`, JSON.stringify(detay.lines[0], null, 2));
    break;
  }
}

async function main() {
  console.log('Teşhis:', FATURA_NO, PO_NAME, BILL_NAME);
  await odooTeşhis();
  await uyumsoftTeşhis();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
