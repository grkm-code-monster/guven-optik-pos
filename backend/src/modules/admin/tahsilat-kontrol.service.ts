/**
 * 19.11.2026 — Muhasebe > Tahsilat Kontrol: faturasıyla tam eşleşmeyen POS tahsilatları.
 *  BAGLI_DEGIL  : faturaya hiç bağlanmamış
 *  KURUS        : bağlı, üstünde ≤ 1 TL kalmış (KDV yuvarlama farkı)
 *  KALAN        : bağlı, üstünde > 1 TL kalmış
 *  YANLIS_SIRKET: tahsilat faturanın şirketinden farklı şirkette
 *  FATURA_YOK   : satışın Odoo faturası yok
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { odooTahsilatiFaturayaBagla } from '../odoo/odoo-tahsilat';

const TUM = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS, active_test: false } };
export type TahsilatKontrolDurum = 'BAGLI_DEGIL' | 'KURUS' | 'KALAN' | 'YANLIS_SIRKET' | 'FATURA_YOK';
export type TahsilatKontrolSatir = {
  paymentId: number; belge: string; tarih: string; tutar: number; kalan: number;
  yevmiye: string; sirketId: number; sirketAdi: string;
  satisId: string | null; satisNo: string | null; sube: string | null; musteri: string | null;
  faturaId: number | null; faturaNo: string | null; faturaSirketi: string | null; faturaKalan: number | null;
  durum: TahsilatKontrolDurum;
};

async function faturaBilgisi(odooSaleOrderIds: number[]) {
  const map = new Map<number, { id: number; name: string; company: [number, string]; kalan: number }>();
  if (!odooSaleOrderIds.length) return map;
  const so = (await execute('sale.order', 'read', [odooSaleOrderIds], { fields: ['id', 'invoice_ids'], ...TUM })) as Array<{ id: number; invoice_ids: number[] }>;
  const invIds = [...new Set(so.flatMap((s) => s.invoice_ids))];
  const inv = invIds.length ? ((await execute('account.move', 'search_read', [[['id', 'in', invIds], ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']]], { fields: ['id', 'name', 'company_id', 'amount_residual'], ...TUM })) as any[]) : [];
  const im = new Map(inv.map((i) => [i.id, i]));
  for (const s of so) {
    const f = s.invoice_ids.map((i) => im.get(i)).find(Boolean);
    if (f) map.set(s.id, { id: f.id, name: f.name, company: f.company_id, kalan: Number(f.amount_residual) || 0 });
  }
  return map;
}

export async function tahsilatKontrol(f: { sirketId?: number; baslangic?: string; bitis?: string; hepsi?: boolean }) {
  const dom: unknown[] = [['ref', '=like', 'POS %'], ['state', '=', 'posted'], ['payment_type', '=', 'inbound']];
  if (!f.hepsi) dom.push(['is_reconciled', '=', false]);
  if (f.sirketId) dom.push(['company_id', '=', f.sirketId]);
  if (f.baslangic) dom.push(['date', '>=', f.baslangic]);
  if (f.bitis) dom.push(['date', '<=', f.bitis]);
  const od = (await execute('account.payment', 'search_read', [dom], { fields: ['id', 'name', 'ref', 'amount', 'date', 'journal_id', 'company_id', 'move_id', 'is_reconciled'], order: 'date desc, id desc', limit: 2000, ...TUM })) as any[];
  // tahsilatın alacak satırı: kalan + eşleşme
  const ml = od.length ? ((await execute('account.move.line', 'search_read', [[['move_id', 'in', od.map((o) => o.move_id[0])], ['account_id.account_type', '=', 'asset_receivable']]], { fields: ['move_id', 'amount_residual', 'matched_debit_ids'], ...TUM })) as any[]) : [];
  const mlMap = new Map(ml.map((l) => [l.move_id[0], l]));
  const saleIdOf = (r: string) => String(r).split(' - ').pop()!.trim();
  const sales = await prisma.sale.findMany({
    where: { id: { in: [...new Set(od.map((o) => saleIdOf(o.ref)))] } },
    select: { id: true, referansNo: true, odooSaleOrderId: true, branchId: true, customer: { select: { name: true } } },
  });
  const sMap = new Map(sales.map((s) => [s.id, s]));
  const subeler = new Map((await prisma.branch.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const fMap = await faturaBilgisi([...new Set(sales.map((s) => s.odooSaleOrderId).filter((x): x is number => !!x))]);

  const satirlar: TahsilatKontrolSatir[] = [];
  for (const o of od) {
    const l = mlMap.get(o.move_id[0]);
    const kalan = Math.abs(Number(l?.amount_residual ?? o.amount));
    const bagli = (l?.matched_debit_ids ?? []).length > 0;
    const s = sMap.get(saleIdOf(o.ref));
    const fat = s?.odooSaleOrderId ? fMap.get(s.odooSaleOrderId) : undefined;
    let durum: TahsilatKontrolDurum | null = null;
    if (o.is_reconciled) durum = null;
    else if (fat && fat.company[0] !== o.company_id[0]) durum = 'YANLIS_SIRKET';
    else if (!bagli && !fat) durum = 'FATURA_YOK';
    else if (!bagli) durum = 'BAGLI_DEGIL';
    else durum = kalan <= 1 ? 'KURUS' : 'KALAN';
    if (!durum && !f.hepsi) continue;
    satirlar.push({
      paymentId: o.id, belge: o.name, tarih: o.date, tutar: Number(o.amount) || 0, kalan: o.is_reconciled ? 0 : kalan,
      yevmiye: o.journal_id?.[1] ?? '', sirketId: o.company_id[0], sirketAdi: o.company_id[1],
      satisId: s?.id ?? null, satisNo: s?.referansNo ?? null, sube: s ? subeler.get(s.branchId) ?? null : null, musteri: s?.customer?.name ?? null,
      faturaId: fat?.id ?? null, faturaNo: fat?.name ?? null, faturaSirketi: fat?.company?.[1] ?? null, faturaKalan: fat ? fat.kalan : null,
      durum: (durum ?? 'KURUS') as TahsilatKontrolDurum,
    });
  }
  const ozet: Record<string, { adet: number; tutar: number }> = {};
  for (const r of satirlar) {
    const k = ozet[r.durum] ?? (ozet[r.durum] = { adet: 0, tutar: 0 });
    k.adet++;
    k.tutar += r.durum === 'KURUS' || r.durum === 'KALAN' ? r.kalan : r.tutar;
  }
  return { satirlar, ozet };
}

/** Faturaya bağlanmamış tahsilatı satışın faturasına bağla (aynı şirketteyse). */
export async function tahsilatiBagla(paymentId: number) {
  const [o] = (await execute('account.payment', 'read', [[paymentId]], { fields: ['id', 'ref', 'company_id', 'is_reconciled', 'state'], ...TUM })) as any[];
  if (!o) throw new Error('Tahsilat bulunamadı');
  if (o.state !== 'posted') throw new Error('Tahsilat onaylı değil');
  if (o.is_reconciled) return { ok: true, mesaj: 'Zaten bağlı' };
  const saleId = String(o.ref).split(' - ').pop()!.trim();
  const s = await prisma.sale.findUnique({ where: { id: saleId }, select: { odooSaleOrderId: true, referansNo: true } });
  if (!s?.odooSaleOrderId) throw new Error('Satışın Odoo siparişi yok');
  const fat = (await faturaBilgisi([s.odooSaleOrderId])).get(s.odooSaleOrderId);
  if (!fat) throw new Error('Satışın onaylı faturası yok');
  if (fat.company[0] !== o.company_id[0]) throw new Error(`Fatura ${fat.company[1]} şirketinde, tahsilat ${o.company_id[1]} şirketinde — bağlanamaz`);
  if (fat.kalan <= 0.01) throw new Error(`Fatura ${fat.name} zaten kapalı`);
  const r = await odooTahsilatiFaturayaBagla(paymentId, fat.id, fat.company[0]);
  if (!r.ok) throw new Error(r.hata ?? 'Bağlanamadı');
  return { ok: true, mesaj: `${s.referansNo} — ${fat.name} faturasına bağlandı` };
}
