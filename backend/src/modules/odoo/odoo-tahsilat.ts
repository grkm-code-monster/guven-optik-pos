/**
 * 19.11.2026 — POS tahsilatları Odoo'da FATURANIN ŞİRKETİNDE açılır.
 *
 * Sorun: satış faturası mağazanın şirketinde (GVN2 → NG, GVN1/3/6/9 → ADESE) kesiliyordu ama
 * tahsilatlar (nakit/kart/havale/SGK/Vakıf) hep GÜVEN OPTİK 1959'un yevmiyelerine (17–21)
 * yazılıyordu. Odoo şirketler arası mutabakat yapmadığından ödeme faturaya bağlanmıyor, hata da
 * yutuluyordu → NG'nin faturaları "ödenmedi" görünüyordu (19.11.2026: 398 tahsilat ≈ 2,7 milyon TL).
 *
 * Şimdi: yevmiye, faturanın şirketinde ADI ile bulunur (scripts/odoo-sirket-pos-yevmiye-kur.ts
 * NG/ADESE/POTENTIAL'a 1959'dakilerin aynı adlı kopyalarını açar). Bulunamazsa eski davranış
 * (1959 yevmiyesi) — satış hiçbir durumda durmaz. Faturaya bağlanamazsa hata döner (yutulmaz).
 */
import { execute, ODOO_ALL_COMPANY_IDS } from './odoo.service';

/** POS ödeme türü → yevmiye adı (her şirkette aynı ad) */
const YEVMIYE_ADI: Record<string, string> = {
  CASH: 'POS Nakit',
  CARD: 'POS Kart',
  TRANSFER: 'POS Havale',
  BANK_TRANSFER: 'POS Havale',
  HAVALE: 'POS Havale',
  SGK: 'SGK',
  VAKIF: 'Vakıf',
};

/** Eski (GÜVEN OPTİK 1959) yevmiyeler — yedek */
export const ESKI_YEVMIYE: Record<string, number> = {
  CASH: 17,
  CARD: 18,
  BANK_TRANSFER: 19,
  TRANSFER: 19,
  HAVALE: 19,
  SGK: 20,
  VAKIF: 21,
  OPEN_ACCOUNT: 15,
};

const TUM = { allowed_company_ids: ODOO_ALL_COMPANY_IDS };
const sirketCtx = (companyId: number) => ({ allowed_company_ids: [companyId], company_id: companyId });

const yevmiyeCache = new Map<string, { id: number | null; zaman: number }>();

/** Faturanın şirketi (okunamazsa null) */
export async function faturaSirketi(invoiceId: number): Promise<number | null> {
  try {
    const [f] = (await execute('account.move', 'read', [[invoiceId]], { fields: ['company_id'], context: TUM })) as Array<{ company_id: [number, string] | false }>;
    return f?.company_id ? f.company_id[0] : null;
  } catch (e) {
    console.error('[Odoo tahsilat] fatura şirketi okunamadı:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Faturanın alacak satırının hesabı (ör. NG "120 Alıcılar"). Tahsilata açıkça verilir: NG/ADESE'de
 *  carilerin şirket varsayılan alacak hesabı boş olabildiği için Odoo hesabı kendisi bulamıyordu. */
export async function faturaAlacakHesabi(invoiceId: number): Promise<number | null> {
  try {
    const r = (await execute('account.move.line', 'search_read', [[['move_id', '=', invoiceId], ['account_type', '=', 'asset_receivable']]], { fields: ['account_id'], limit: 1, context: TUM })) as Array<{ account_id: [number, string] | false }>;
    return r[0]?.account_id ? r[0].account_id[0] : null;
  } catch {
    return null;
  }
}

/** Şirketteki POS yevmiyesi; yoksa eski 1959 yevmiyesi. */
export async function tahsilatYevmiyesi(companyId: number | null, paymentType: string): Promise<{ journalId: number; companyId: number; yedek: boolean }> {
  const ad = YEVMIYE_ADI[paymentType];
  const eski = ESKI_YEVMIYE[paymentType] ?? 17;
  if (!companyId || !ad) return { journalId: eski, companyId: 1, yedek: true };
  const key = `${companyId}|${ad}`;
  const c = yevmiyeCache.get(key);
  let id: number | null | undefined = c && Date.now() - c.zaman < 10 * 60 * 1000 ? c.id : undefined;
  if (id === undefined) {
    try {
      const r = (await execute('account.journal', 'search_read', [[['name', '=', ad], ['company_id', '=', companyId], ['type', 'in', ['cash', 'bank']]]], {
        fields: ['id'],
        limit: 1,
        context: TUM,
      })) as Array<{ id: number }>;
      id = r[0]?.id ?? null;
      yevmiyeCache.set(key, { id, zaman: Date.now() });
    } catch (e) {
      console.error('[Odoo tahsilat] yevmiye aranamadı:', e instanceof Error ? e.message : e);
      id = null;
    }
  }
  return id ? { journalId: id, companyId, yedek: false } : { journalId: eski, companyId: 1, yedek: true };
}

/** Tahsilatı oluştur + onayla (şirket bağlamında). Dönen: payment id */
export async function odooTahsilatOlustur(p: {
  companyId: number;
  journalId: number;
  partnerId: number;
  amount: number;
  ref: string;
  date?: string;
  /** faturanın alacak hesabı — verilirse ödemenin karşı hesabı bu olur (faturayla aynı hesap) */
  alacakHesapId?: number | null;
}): Promise<number> {
  const ctx = { context: sirketCtx(p.companyId) };
  const paymentId = (await execute(
    'account.payment',
    'create',
    [
      {
        payment_type: 'inbound',
        partner_type: 'customer',
        partner_id: p.partnerId,
        amount: p.amount,
        journal_id: p.journalId,
        company_id: p.companyId,
        ref: p.ref,
        date: p.date ?? new Date().toISOString().split('T')[0],
        ...(p.alacakHesapId ? { destination_account_id: p.alacakHesapId } : {}),
      },
    ],
    ctx,
  )) as number;
  try {
    await execute('account.payment', 'action_post', [[paymentId]], ctx);
  } catch (e) {
    // action_post None döner → XML-RPC "cannot marshal None" işlem yapıldıktan sonra gelir
    const m = e instanceof Error ? e.message : String(e);
    if (!/marshal None/i.test(m)) {
      // onaylanamadıysa taslak bırakma
      await execute('account.payment', 'unlink', [[paymentId]], ctx).catch(() => {});
      throw e;
    }
  }
  return paymentId;
}

/** Ödemeyi faturanın açık alacak satırıyla eşleştir. Hata yutulmaz: { ok:false, hata } döner. */
export async function odooTahsilatiFaturayaBagla(paymentId: number, invoiceId: number, companyId: number): Promise<{ ok: boolean; hata?: string }> {
  const ctx = { context: sirketCtx(companyId) };
  try {
    const [pm] = (await execute('account.payment', 'read', [[paymentId]], { fields: ['move_id'], context: TUM })) as Array<{ move_id: [number, string] | false }>;
    if (!pm?.move_id) return { ok: false, hata: 'ödeme kaydı (move) yok' };
    const fl = (await execute('account.move.line', 'search_read', [[['move_id', '=', invoiceId], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, context: TUM })) as Array<{ id: number }>;
    const pl = (await execute('account.move.line', 'search_read', [[['move_id', '=', pm.move_id[0]], ['account_type', '=', 'asset_receivable'], ['reconciled', '=', false]]], { fields: ['id'], limit: 1, context: TUM })) as Array<{ id: number }>;
    if (!fl[0]) return { ok: false, hata: 'faturada açık alacak satırı yok (zaten ödenmiş olabilir)' };
    if (!pl[0]) return { ok: false, hata: 'ödemede alacak satırı yok' };
    try {
      await execute('account.move.line', 'reconcile', [[fl[0].id, pl[0].id]], ctx);
    } catch (e) {
      if (!/marshal None/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, hata: m.replace(/^.*fault:\s*/i, '').slice(0, 200) };
  }
}
