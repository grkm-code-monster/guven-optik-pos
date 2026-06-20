/**
 * P00015 tedarikçi faturasını action_post ile onayla (tek başına test)
 */
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';

const PO_NAME = process.argv[2] || 'P00015';
const COMPANY_ID = 2;

function odooErr(e: unknown): string {
  const err = e as { faultString?: string; message?: string };
  return String(err?.faultString ?? err?.message ?? e);
}

async function postVendorBill(invoiceId: number, companyId: number): Promise<{ ok: boolean; state?: string; error?: string }> {
  const invBefore = await execute('account.move', 'read', [[invoiceId]], {
    fields: ['id', 'name', 'state', 'ref', 'move_type'],
  }, companyId);
  const inv = invBefore?.[0];
  if (!inv) return { ok: false, error: 'Fatura bulunamadı' };
  if (inv.state === 'posted') return { ok: true, state: 'posted' };
  if (inv.state === 'cancel') return { ok: false, error: 'Fatura iptal edilmiş' };

  const postKwargs = {
    context: {
      allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
      force_company: companyId,
      // Odoo duplicate ref uyarısını atla (varsa)
      skip_invoice_sync: true,
    },
  };

  try {
    await execute('account.move', 'action_post', [[invoiceId]], postKwargs, companyId);
  } catch (e) {
    const msg = odooErr(e);
    // Duplicate uyarısı — alternatif context dene
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('kopya')) {
      console.log('Duplicate uyarısı, alternatif context deneniyor...');
      try {
        await execute('account.move', 'action_post', [[invoiceId]], {
          context: {
            ...postKwargs.context,
            disable_duplicate_check: true,
            no_new_invoice: true,
          },
        }, companyId);
      } catch (e2) {
        return { ok: false, error: odooErr(e2) };
      }
    } else {
      return { ok: false, error: msg };
    }
  }

  const invAfter = await execute('account.move', 'read', [[invoiceId]], { fields: ['state', 'name', 'payment_state'] }, companyId);
  const state = invAfter?.[0]?.state;
  return { ok: state === 'posted', state, error: state !== 'posted' ? `state=${state}` : undefined };
}

async function main() {
  const pos = await execute('purchase.order', 'search_read', [[['name', '=', PO_NAME]]], {
    fields: ['id', 'name', 'invoice_ids', 'origin'],
    limit: 1,
  }, COMPANY_ID);
  if (!pos?.[0]) {
    console.log('PO bulunamadı:', PO_NAME);
    return;
  }
  const po = pos[0];
  console.log('PO', po.name, 'invoice_ids=', po.invoice_ids, 'origin=', po.origin);

  let invoiceId: number | null = po.invoice_ids?.[0] ?? null;

  if (!invoiceId && po.origin) {
    const found = await execute('account.move', 'search_read', [[
      ['move_type', '=', 'in_invoice'],
      ['ref', '=', po.origin],
      ['state', '=', 'draft'],
    ]], { fields: ['id', 'name'], order: 'id desc', limit: 1 }, COMPANY_ID);
    invoiceId = found?.[0]?.id ?? null;
    if (invoiceId) console.log('PO invoice_ids boş, ref ile bulundu:', found[0].name, invoiceId);
  }

  if (!invoiceId) {
    console.log('Onaylanacak taslak fatura bulunamadı');
    return;
  }

  const before = await execute('account.move', 'read', [[invoiceId]], {
    fields: ['name', 'state', 'ref', 'amount_total'],
  }, COMPANY_ID);
  console.log('Önce:', before[0]);

  const result = await postVendorBill(invoiceId, COMPANY_ID);
  console.log('Sonuç:', result);

  const after = await execute('account.move', 'read', [[invoiceId]], {
    fields: ['name', 'state', 'payment_state'],
  }, COMPANY_ID);
  console.log('Sonra:', after[0]);
}

main().catch(console.error);
