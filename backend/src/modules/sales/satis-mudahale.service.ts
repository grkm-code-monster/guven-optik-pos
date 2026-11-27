/**
 * 27.11.2026 — Müdahale Paneli Faz 1 (sadece ADMIN): onaylanmış satışta ÖDEME ve TARİH düzeltme.
 *
 * Her işlem iki adımlıdır:
 *   1) plan (önizleme) — hiçbir şey yazmaz; ne değişeceğini, uyarıları ve ENGELLERİ döner.
 *   2) uygula — planı YENİDEN hesaplar, engel varsa durur. Önce Odoo, sonra POS (tek DB işlemi).
 *      Odoo adımlarından biri ya da POS işlemi hata verirse yapılan Odoo adımları geri alınır.
 *
 * Kurallar:
 *   - Ekim ve öncesi (2026-11-01 öncesi) tarihlere dokunulmaz (eski ya da yeni tarih).
 *   - İleri tarih yazılmaz.
 *   - Satışın toplamı DEĞİŞMEZ: bir ödeme, tutarları toplamı aynı olan 1–4 yeni ödemeye çevrilir (bölme).
 *   - Nakit: kasa beklentisi Payment(CASH).createdAt'in düştüğü vardiyadan hesaplanır. Kapanmış vardiyada
 *     OTOMATİK kapatma ise sayım/kapanış tutarı farkla birlikte kaydırılır (fark 0 kalır); elle sayılmış
 *     vardiyada sayım korunur, FARK değişir (uyarı verilir).
 *   - Odoo: eski tahsilat SİLİNMEZ, İPTAL edilir; yenisi faturanın şirketinde açılıp faturaya bağlanır.
 *   - Tarih: e-fatura gönderilmişse Odoo fatura tarihi DEĞİŞMEZ (resmi belge). Yıl değiştirilemez.
 *   - Her uygulama AuditLog'a (entity Sale) eski/yeni hâlleriyle yazılır.
 */
import { CashMovementType, PaymentType, Prisma, ShiftStatus, SaleStatus, type Shift } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { faturaAlacakHesabi, faturaSirketi, odooTahsilatOlustur, odooTahsilatiFaturayaBagla, tahsilatYevmiyesi } from '../odoo/odoo-tahsilat';
import { calculateCommission } from '../payments/commission.service';
import { parseGs1DataMatrix } from '../odoo/gs1-parser.util';

// ───────────────────────── yardımcılar ─────────────────────────

export const KILIT_GUN = '2026-11-01';
const DUZELTILEBILIR: PaymentType[] = [PaymentType.CASH, PaymentType.CARD, PaymentType.TRANSFER, PaymentType.OPEN_ACCOUNT, PaymentType.SGK, PaymentType.VAKIF];
export const TUR_AD: Record<string, string> = {
  CASH: 'Nakit', CARD: 'Kart', TRANSFER: 'Havale', OPEN_ACCOUNT: 'Açık hesap', SGK: 'SGK', VAKIF: 'Vakıf/Kurum', ETICARET: 'E-ticaret', CIRO_DUZELTME: 'Ciro düzeltme',
};
const TUR_RE: Record<string, RegExp> = {
  CASH: /POS (OPEN_ACCOUNT )?CASH\b/i,
  CARD: /POS (OPEN_ACCOUNT )?CARD\b/i,
  TRANSFER: /POS (OPEN_ACCOUNT )?(TRANSFER|HAVALE)\b/i,
  SGK: /POS SGK\b/i,
  VAKIF: /POS VAKIF\b/i,
};
const TUM = { context: { allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const sirketCtx = (cid: number) => ({ context: { allowed_company_ids: [cid], company_id: cid } });

const gunTR = (d: Date) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
const saatTR = (d: Date) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 19);
const trAn = (gun: string, saat: string) => new Date(`${gun}T${saat.length === 5 ? saat + ':00' : saat}+03:00`);
const trYaz = (d: Date) => `${gunTR(d).split('-').reverse().join('.')} ${saatTR(d).slice(0, 5)}`;
const tl = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} TL`;
const yuvarla = (n: number) => Math.round(n * 100) / 100;
const bugunTR = () => gunTR(new Date());

export function mudahaleHatasi(message: string) {
  const err = new Error(message) as Error & { code: string };
  err.code = 'MUDAHALE_HATASI';
  return err;
}

/** XML-RPC: Odoo bazı metotlarda None döner → "cannot marshal None" işlem yapıldıktan SONRA gelir. */
async function cagir(model: string, method: string, args: unknown[], kw: Record<string, unknown>) {
  try {
    return await execute(model, method, args as any[], kw);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/marshal None/i.test(m)) return null;
    throw new Error(`Odoo ${model}.${method}: ${m.replace(/^.*fault:\s*/i, '').slice(0, 200)}`);
  }
}

type OdooTahsilat = { id: number; name: string; date: string; amount: number; ref: string; company_id: [number, string]; journal_id: [number, string] | false };
type OdooFatura = { id: number; name: string; state: string; payment_state: string; amount_residual: number; move_type: string; invoice_date: string | false; company_id: [number, string] };

async function odooBilgi(sale: { id: string; odooSaleOrderId: number | null }) {
  if (!sale.odooSaleOrderId) return { so: null, fatura: null as OdooFatura | null, tahsilatlar: [] as OdooTahsilat[] };
  const [so] = (await execute('sale.order', 'read', [[sale.odooSaleOrderId], ['name', 'invoice_ids', 'partner_id', 'date_order', 'company_id']], TUM)) as any[];
  let fatura: OdooFatura | null = null;
  if (so?.invoice_ids?.length) {
    const fl = (await execute('account.move', 'read', [so.invoice_ids, ['name', 'state', 'payment_state', 'amount_residual', 'move_type', 'invoice_date', 'company_id']], TUM)) as OdooFatura[];
    fatura = fl.find((i) => i.move_type === 'out_invoice' && i.state === 'posted') ?? null;
  }
  const tahsilatlar = (await execute('account.payment', 'search_read', [[['ref', 'ilike', sale.id], ['state', '=', 'posted']]], {
    fields: ['id', 'name', 'date', 'amount', 'journal_id', 'ref', 'company_id'],
    ...TUM,
  })) as OdooTahsilat[];
  return { so: so ?? null, fatura, tahsilatlar };
}

/** POS ödemesine karşılık gelen Odoo tahsilatı: tür + tutar eşleşir, tarihi en yakın olan. */
function tahsilatEslestir(list: OdooTahsilat[], tur: string, tutar: number, gun: string, kullanilan: Set<number>) {
  const re = TUR_RE[tur];
  if (!re) return null;
  const aday = list
    .filter((p) => !kullanilan.has(p.id) && re.test(String(p.ref)) && Math.abs(Number(p.amount) - tutar) < 0.005)
    .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(gun)) - Math.abs(Date.parse(b.date) - Date.parse(gun)));
  return aday[0] ?? null;
}

/** Şubede o anı kapsayan (aynı gün açılmış) vardiya; yoksa o gün açılmış ilk vardiya ve saati pencereye çekilmiş an. */
async function vardiyaBul(branchId: string, an: Date): Promise<{ shift: Shift; an: Date } | null> {
  const gun = gunTR(an);
  const bas = trAn(gun, '00:00:00');
  const son = new Date(bas.getTime() + 24 * 3600e3);
  const kapsayan = await prisma.shift.findFirst({
    where: { branchId, openedAt: { gte: bas, lte: an }, OR: [{ closedAt: null }, { closedAt: { gte: an } }] },
    orderBy: { openedAt: 'desc' },
  });
  if (kapsayan) return { shift: kapsayan, an };
  const gunun = await prisma.shift.findFirst({ where: { branchId, openedAt: { gte: bas, lt: son } }, orderBy: { openedAt: 'asc' } });
  if (!gunun) return null;
  let t = an;
  if (t <= gunun.openedAt) t = new Date(gunun.openedAt.getTime() + 60e3);
  if (gunun.closedAt && t >= gunun.closedAt) t = new Date(Math.max(gunun.openedAt.getTime() + 1e3, gunun.closedAt.getTime() - 60e3));
  return { shift: gunun, an: t };
}

const otomatikMi = (s: Shift) => String(s.diffReason ?? '').startsWith('OTOMATİK KAPATMA');

type VardiyaEtki = { shift: Shift; delta: number };

function vardiyaEtkiEkle(m: Map<string, VardiyaEtki>, shift: Shift, delta: number) {
  const e = m.get(shift.id) ?? { shift, delta: 0 };
  e.delta = yuvarla(e.delta + delta);
  m.set(shift.id, e);
}

function vardiyaSatirlari(m: Map<string, VardiyaEtki>, uyarilar: string[]): string[] {
  const out: string[] = [];
  for (const { shift, delta } of m.values()) {
    if (!delta) continue;
    const ad = `${trYaz(shift.openedAt).slice(0, 10)} kasası`;
    if (shift.status !== ShiftStatus.CLOSED) {
      out.push(`${ad} (açık): beklenen nakit ${delta > 0 ? '+' : ''}${tl(delta)}`);
    } else if (otomatikMi(shift)) {
      out.push(`${ad} (otomatik kapanmış): sayım ${tl(Number(shift.physicalCash ?? 0))} → ${tl(yuvarla(Number(shift.physicalCash ?? 0) + delta))}, fark 0 kalır`);
    } else {
      const yeniFark = yuvarla(Number(shift.diff ?? 0) - delta);
      out.push(`${ad} (elle sayılmış): sayım ${tl(Number(shift.physicalCash ?? 0))} aynı kalır, fark ${tl(Number(shift.diff ?? 0))} → ${tl(yeniFark)}`);
      uyarilar.push(`${ad} elle sayılarak kapatılmış: sayım değişmez, kasa farkı ${tl(Number(shift.diff ?? 0))} → ${tl(yeniFark)} olur.`);
    }
  }
  return out;
}

async function vardiyalariUygula(tx: Prisma.TransactionClient, m: Map<string, VardiyaEtki>) {
  for (const { shift, delta } of m.values()) {
    if (!delta || shift.status !== ShiftStatus.CLOSED) continue;
    const g = await tx.shift.findUniqueOrThrow({ where: { id: shift.id } });
    if (otomatikMi(g)) {
      await tx.shift.update({
        where: { id: g.id },
        data: {
          physicalCash: g.physicalCash != null ? new Prisma.Decimal(yuvarla(Number(g.physicalCash) + delta)) : g.physicalCash,
          closeCash: g.closeCash != null ? new Prisma.Decimal(yuvarla(Number(g.closeCash) + delta)) : g.closeCash,
        },
      });
    } else {
      await tx.shift.update({ where: { id: g.id }, data: { diff: new Prisma.Decimal(yuvarla(Number(g.diff ?? 0) - delta)) } });
    }
  }
}

async function satisGetir(saleId: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { payments: true, customer: true } });
  if (!sale) throw mudahaleHatasi('Satış bulunamadı.');
  return sale;
}

function durumKontrol(status: SaleStatus, engeller: string[]) {
  if (status === SaleStatus.DRAFT) engeller.push('Satış taslak — onaylanmış satış değil (taslak, satış ekranından düzenlenir).');
  if (status === SaleStatus.VOID) engeller.push('Satış iptal edilmiş.');
}

export type PlanSonuc = { satirlar: string[]; uyarilar: string[]; engeller: string[] };

// ───────────────────────── ÖDEME DÜZELT ─────────────────────────

export type YeniOdemeGirdi = {
  tur: PaymentType;
  tutar: number;
  tarih: string; // YYYY-MM-DD
  bankId?: string | null;
  posDeviceId?: string | null;
  taksit?: number | null;
};

type OdemeIc = {
  tur: PaymentType; tutar: number; an: Date; bankId: string | null; bankAd: string | null; posDeviceId: string | null; taksit: number | null;
  komisyonOran: number | null; komisyonTutar: number | null; net: number; shift: Shift | null;
};

async function odemePlanla(saleId: string, paymentId: string, yeniler: YeniOdemeGirdi[]) {
  const satirlar: string[] = [];
  const uyarilar: string[] = [];
  const engeller: string[] = [];
  const sale = await satisGetir(saleId);
  durumKontrol(sale.status, engeller);
  const pay = sale.payments.find((p) => p.id === paymentId);
  if (!pay) throw mudahaleHatasi('Ödeme bu satışta bulunamadı.');
  if (!DUZELTILEBILIR.includes(pay.paymentType)) engeller.push(`${TUR_AD[pay.paymentType] ?? pay.paymentType} ödemesi buradan düzeltilemez.`);
  const eskiTutar = Number(pay.grossAmount);
  const eskiGun = gunTR(pay.createdAt);
  if (eskiGun < KILIT_GUN) engeller.push(`Ödeme ${trYaz(pay.createdAt)} tarihli — Ekim ve öncesine dokunulmaz.`);

  if (!yeniler.length || yeniler.length > 4) engeller.push('1 ile 4 arasında yeni ödeme satırı girin.');
  const toplam = yuvarla(yeniler.reduce((s, y) => s + Number(y.tutar), 0));
  if (Math.abs(toplam - eskiTutar) > 0.005) engeller.push(`Yeni ödemelerin toplamı (${tl(toplam)}) eski ödemeye (${tl(eskiTutar)}) eşit olmalı — satış toplamı değişmez.`);

  if (pay.paymentType === PaymentType.OPEN_ACCOUNT) {
    const sonradan = sale.payments.filter((x) => x.id !== pay.id && x.paymentType !== PaymentType.OPEN_ACCOUNT && x.createdAt.getTime() > pay.createdAt.getTime());
    if (sonradan.length) engeller.push(`Bu açık hesaba sonradan ${sonradan.length} tahsilat girilmiş (${sonradan.map((x) => `${TUR_AD[x.paymentType]} ${tl(Number(x.grossAmount))}`).join(', ')}) — çift ödeme olmaması için önce o tahsilatları düzeltin.`);
  }
  const tahsilatSube = pay.tahsilatBranchId ?? sale.branchId;
  const bankalar = await prisma.bank.findMany({ include: { posDevices: true } });
  const ic: OdemeIc[] = [];
  const bugun = bugunTR();
  for (const [i, y] of yeniler.entries()) {
    const no = yeniler.length > 1 ? `${i + 1}. satır: ` : '';
    const tutar = yuvarla(Number(y.tutar));
    if (!(tutar > 0)) { engeller.push(`${no}tutar 0'dan büyük olmalı.`); continue; }
    if (!DUZELTILEBILIR.includes(y.tur)) { engeller.push(`${no}geçersiz ödeme türü.`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y.tarih)) { engeller.push(`${no}tarih geçersiz.`); continue; }
    if (y.tarih < KILIT_GUN) engeller.push(`${no}Ekim ve öncesine tarih yazılamaz.`);
    if (y.tarih > bugun) engeller.push(`${no}ileri tarih yazılamaz.`);
    let an = trAn(y.tarih, saatTR(pay.createdAt));
    let bankId: string | null = null; let bankAd: string | null = null; let posDeviceId: string | null = null; let taksit: number | null = null;
    let komisyonOran: number | null = null; let komisyonTutar: number | null = null; let net = tutar;
    if (y.tur === PaymentType.CARD || y.tur === PaymentType.TRANSFER) {
      const b = bankalar.find((x) => x.id === y.bankId);
      if (!b) { engeller.push(`${no}banka seçin.`); continue; }
      bankId = b.id; bankAd = b.name;
    }
    if (y.tur === PaymentType.CARD) {
      const b = bankalar.find((x) => x.id === bankId)!;
      const cihaz = b.posDevices.find((d) => d.id === y.posDeviceId);
      if (!cihaz) { engeller.push(`${no}${b.name} için POS cihazı seçin.`); continue; }
      posDeviceId = cihaz.id;
      taksit = Math.max(1, Math.floor(Number(y.taksit ?? 1)));
      try {
        const c = await calculateCommission(b.id, taksit, String(tutar), an);
        komisyonOran = Number(c.commissionRate); komisyonTutar = Number(c.commissionAmount); net = Number(c.netAmount);
      } catch {
        engeller.push(`${no}${b.name} ${taksit} taksit için ${y.tarih} tarihinde geçerli komisyon oranı tanımlı değil.`);
        continue;
      }
    }
    let shift: Shift | null = null;
    if (y.tur === PaymentType.CASH) {
      const v = await vardiyaBul(tahsilatSube, an);
      if (!v) { engeller.push(`${no}${y.tarih.split('-').reverse().join('.')} günü bu şubede kasa (vardiya) açılmamış — nakit yazılamaz.`); continue; }
      shift = v.shift;
      if (v.an.getTime() !== an.getTime()) uyarilar.push(`${no}nakit saati o günün kasa saatlerine çekildi: ${trYaz(v.an)}.`);
      an = v.an;
    }
    ic.push({ tur: y.tur, tutar, an, bankId, bankAd, posDeviceId, taksit, komisyonOran, komisyonTutar, net, shift });
  }

  // Kasa etkisi
  const vardiya = new Map<string, VardiyaEtki>();
  let silinecekHareket: { id: string; description: string } | null = null;
  if (pay.paymentType === PaymentType.CASH) {
    const v = await vardiyaBul(tahsilatSube, pay.createdAt);
    if (v && v.an.getTime() === pay.createdAt.getTime()) vardiyaEtkiEkle(vardiya, v.shift, -eskiTutar);
    else uyarilar.push('Eski nakit ödemenin düştüğü kasa bulunamadı — eski kasa rakamlarına dokunulmayacak.');
    const hareketler = await prisma.cashMovement.findMany({
      where: {
        type: CashMovementType.CASH_IN,
        OR: [
          { description: `SALE_CASH_PAYMENT:${saleId}` },
          { AND: [{ description: { startsWith: 'OPEN_ACCOUNT_PAYMENT:' } }, { description: { contains: `:${saleId}:` } }] },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const h = hareketler.find((x) => Math.abs(Number(x.amount) - eskiTutar) < 0.005);
    if (h) silinecekHareket = { id: h.id, description: h.description };
  }
  for (const y of ic) if (y.tur === PaymentType.CASH && y.shift) vardiyaEtkiEkle(vardiya, y.shift, y.tutar);

  // Odoo
  const odoo = await odooBilgi(sale);
  let eskiOdoo: OdooTahsilat | null = null;
  const yeniOdooTutar = yuvarla(ic.filter((y) => y.tur !== PaymentType.OPEN_ACCOUNT).reduce((s, y) => s + y.tutar, 0));
  if (pay.paymentType !== PaymentType.OPEN_ACCOUNT) eskiOdoo = tahsilatEslestir(odoo.tahsilatlar, pay.paymentType, eskiTutar, eskiGun, new Set());

  // ── özet satırları
  satirlar.push(`Satış ${sale.referansNo ?? sale.id} — ${sale.customer.name} — ${trYaz(sale.createdAt)} — toplam ${tl(Number(sale.netTotal))}`);
  satirlar.push(`ESKİ: ${TUR_AD[pay.paymentType]} ${tl(eskiTutar)} — ${trYaz(pay.createdAt)}${pay.installment ? ` — ${pay.installment} taksit` : ''}`);
  for (const y of ic) {
    satirlar.push(`YENİ: ${TUR_AD[y.tur]} ${tl(y.tutar)} — ${trYaz(y.an)}${y.bankAd ? ` — ${y.bankAd}` : ''}${y.taksit ? ` — ${y.taksit} taksit` : ''}${y.komisyonOran != null ? ` — komisyon %${(y.komisyonOran * 100).toFixed(2)} = ${tl(y.komisyonTutar ?? 0)}, net ${tl(y.net)}` : ''}`);
  }
  if (silinecekHareket) satirlar.push(`Kasa hareketi: ${tl(eskiTutar)} nakit girişi silinir.`);
  const yeniNakitSay = ic.filter((y) => y.tur === PaymentType.CASH).length;
  if (yeniNakitSay) satirlar.push(`Kasa hareketi: ${yeniNakitSay} nakit girişi eklenir.`);
  satirlar.push(...vardiyaSatirlari(vardiya, uyarilar));

  if (!odoo.so) {
    uyarilar.push("Satış Odoo'ya gönderilmemiş — sadece POS kaydı düzeltilir.");
  } else if (!odoo.fatura) {
    uyarilar.push("Odoo'da onaylı fatura yok — Odoo tahsilatlarına dokunulmaz, sadece POS kaydı düzeltilir.");
  } else {
    satirlar.push(`Odoo fatura: ${odoo.fatura.name} (${odoo.fatura.payment_state}, kalan ${tl(Number(odoo.fatura.amount_residual))})`);
    if (eskiOdoo) satirlar.push(`Odoo: ${eskiOdoo.name} (${eskiOdoo.date}, ${tl(Number(eskiOdoo.amount))}) İPTAL edilir (silinmez).`);
    else if (pay.paymentType !== PaymentType.OPEN_ACCOUNT) {
      if (Number(odoo.fatura.amount_residual) + 0.005 < yeniOdooTutar) engeller.push(`Odoo'da bu ödemenin tahsilatı bulunamadı ve fatura açık bakiyesi (${tl(Number(odoo.fatura.amount_residual))}) yeni tahsilatlara yetmiyor — çift tahsilat olmasın diye durduruldu.`);
      else uyarilar.push("Odoo'da bu ödemenin tahsilatı bulunamadı — sadece yeni tahsilat açılacak.");
    }
    if (pay.paymentType === PaymentType.OPEN_ACCOUNT && Number(odoo.fatura.amount_residual) + 0.005 < yeniOdooTutar) {
      engeller.push(`Fatura açık bakiyesi (${tl(Number(odoo.fatura.amount_residual))}) yeni tahsilatlara (${tl(yeniOdooTutar)}) yetmiyor.`);
    }
    for (const y of ic) {
      if (y.tur === PaymentType.OPEN_ACCOUNT) satirlar.push(`Odoo: açık hesap ${tl(y.tutar)} faturada açık bakiye olarak kalır.`);
      else satirlar.push(`Odoo: yeni ${TUR_AD[y.tur]} tahsilatı ${tl(y.tutar)} (${gunTR(y.an)}) açılır ve faturaya bağlanır.`);
    }
  }
  if (sale.eFaturaDurum === 'GONDERILDI') uyarilar.push('E-fatura gönderilmiş — ödeme düzeltmesi e-faturayı etkilemez.');

  return { satirlar, uyarilar, engeller, sale, pay, ic, vardiya, silinecekHareket, odoo, eskiOdoo };
}

export async function odemeDuzeltPlan(saleId: string, paymentId: string, yeniler: YeniOdemeGirdi[]): Promise<PlanSonuc> {
  const p = await odemePlanla(saleId, paymentId, yeniler);
  return { satirlar: p.satirlar, uyarilar: p.uyarilar, engeller: p.engeller };
}

async function odooEskiyiGeriAl(eski: OdooTahsilat, faturaId: number | null) {
  const ctx = sirketCtx(eski.company_id[0]);
  await cagir('account.payment', 'action_draft', [[eski.id]], ctx);
  await cagir('account.payment', 'action_post', [[eski.id]], ctx);
  if (faturaId) await odooTahsilatiFaturayaBagla(eski.id, faturaId, eski.company_id[0]);
}

async function odooTahsilatIptal(id: number, cid: number) {
  const ctx = sirketCtx(cid);
  await cagir('account.payment', 'action_draft', [[id]], ctx);
  await cagir('account.payment', 'action_cancel', [[id]], ctx);
}

export async function odemeDuzeltUygula(saleId: string, paymentId: string, yeniler: YeniOdemeGirdi[], sebep: string, userId: string) {
  const p = await odemePlanla(saleId, paymentId, yeniler);
  if (p.engeller.length) throw mudahaleHatasi(`Uygulanamaz: ${p.engeller.join(' | ')}`);
  const { sale, pay, ic, odoo, eskiOdoo } = p;
  const odooYapilan: string[] = [];
  const yeniOdoo: Array<{ id: number; cid: number }> = [];
  let eskiIptal = false;

  const odooGeriAl = async () => {
    const notlar: string[] = [];
    for (const y of yeniOdoo) {
      try { await odooTahsilatIptal(y.id, y.cid); notlar.push(`yeni tahsilat #${y.id} iptal edildi`); }
      catch (e) { notlar.push(`yeni tahsilat #${y.id} İPTAL EDİLEMEDİ: ${(e as Error).message}`); }
    }
    if (eskiIptal && eskiOdoo) {
      try { await odooEskiyiGeriAl(eskiOdoo, odoo.fatura?.id ?? null); notlar.push(`${eskiOdoo.name} geri onaylandı`); }
      catch (e) { notlar.push(`${eskiOdoo.name} GERİ ALINAMADI: ${(e as Error).message}`); }
    }
    return notlar.join('; ');
  };

  // 1) Odoo
  if (odoo.fatura) {
    try {
      if (eskiOdoo) {
        await odooTahsilatIptal(eskiOdoo.id, eskiOdoo.company_id[0]);
        eskiIptal = true;
        odooYapilan.push(`${eskiOdoo.name} iptal edildi`);
      }
      const sirket = await faturaSirketi(odoo.fatura.id);
      const alacak = await faturaAlacakHesabi(odoo.fatura.id);
      for (const y of ic) {
        if (y.tur === PaymentType.OPEN_ACCOUNT) continue;
        const yev = await tahsilatYevmiyesi(sirket, y.tur);
        const refTur = y.tur === PaymentType.TRANSFER ? 'HAVALE' : y.tur;
        const id = await odooTahsilatOlustur({
          companyId: yev.companyId, journalId: yev.journalId, partnerId: odoo.so.partner_id[0], amount: y.tutar, date: gunTR(y.an),
          alacakHesapId: yev.yedek ? null : alacak,
          ref: `POS ${refTur}${y.bankAd ? ' ' + y.bankAd : ''} - ${saleId} (düzeltme ${pay.paymentType}→${y.tur})`,
        });
        yeniOdoo.push({ id, cid: yev.companyId });
        const b = await odooTahsilatiFaturayaBagla(id, odoo.fatura.id, yev.companyId);
        if (!b.ok) throw new Error(`yeni tahsilat #${id} faturaya bağlanamadı: ${b.hata}`);
        odooYapilan.push(`yeni ${TUR_AD[y.tur]} tahsilatı #${id} faturaya bağlandı`);
      }
    } catch (e) {
      const geri = await odooGeriAl();
      throw mudahaleHatasi(`Odoo adımı başarısız, hiçbir şey değiştirilmedi: ${(e as Error).message}${geri ? ` (geri alma: ${geri})` : ''}`);
    }
  }

  // 2) POS — tek işlem
  try {
    await prisma.$transaction(async (tx) => {
      const [ilk, ...diger] = ic;
      const veri = (y: OdemeIc) => ({
        paymentType: y.tur,
        bankId: y.bankId,
        posDeviceId: y.posDeviceId,
        installment: y.taksit,
        grossAmount: new Prisma.Decimal(y.tutar),
        commissionRate: y.komisyonOran != null ? new Prisma.Decimal(y.komisyonOran) : null,
        commissionAmount: y.komisyonTutar != null ? new Prisma.Decimal(y.komisyonTutar) : null,
        netAmount: new Prisma.Decimal(y.net),
        createdAt: y.an,
      });
      const not = `${gunTR(new Date())} düzeltme: ${TUR_AD[pay.paymentType]} ${tl(Number(pay.grossAmount))} ${trYaz(pay.createdAt)} → ${ic.map((y) => `${TUR_AD[y.tur]} ${tl(y.tutar)}`).join(' + ')} (${sebep})`.slice(0, 500);
      await tx.payment.update({ where: { id: pay.id }, data: { ...veri(ilk), aciklama: `${pay.aciklama ? pay.aciklama + ' | ' : ''}${not}`.slice(0, 1000) } });
      const yeniIdler: string[] = [pay.id];
      for (const y of diger) {
        const r = await tx.payment.create({
          data: { saleId, ...veri(y), aciklama: not, createdByUserId: userId, tahsilatBranchId: pay.tahsilatBranchId },
        });
        yeniIdler.push(r.id);
      }
      if (p.silinecekHareket) await tx.cashMovement.delete({ where: { id: p.silinecekHareket.id } });
      const onek = p.silinecekHareket?.description.startsWith('OPEN_ACCOUNT_PAYMENT:') ? p.silinecekHareket.description : `SALE_CASH_PAYMENT:${saleId}`;
      for (const y of ic) {
        if (y.tur !== PaymentType.CASH || !y.shift) continue;
        await tx.cashMovement.create({
          data: { branchId: y.shift.branchId, shiftId: y.shift.id, userId: sale.userId, type: CashMovementType.CASH_IN, amount: new Prisma.Decimal(y.tutar), description: onek, createdAt: y.an },
        });
      }
      await vardiyalariUygula(tx, p.vardiya);
      // SGK / Vakıf toplamları satış başlığında da tutuluyor
      const sonOdemeler = await tx.payment.findMany({ where: { saleId } });
      const sgk = yuvarla(sonOdemeler.filter((x) => x.paymentType === PaymentType.SGK).reduce((s, x) => s + Number(x.grossAmount), 0));
      const vakif = yuvarla(sonOdemeler.filter((x) => x.paymentType === PaymentType.VAKIF).reduce((s, x) => s + Number(x.grossAmount), 0));
      await tx.sale.update({
        where: { id: saleId },
        data: { sgkAmount: sgk > 0 ? new Prisma.Decimal(sgk) : null, prescriptionAmount: vakif > 0 ? new Prisma.Decimal(vakif) : null },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'MUDAHALE_ODEME',
          entity: 'Sale',
          entityId: saleId,
          payload: {
            saleId, sebep,
            eski: JSON.parse(JSON.stringify(pay)),
            eskiSatis: { sgkAmount: sale.sgkAmount?.toString() ?? null, prescriptionAmount: sale.prescriptionAmount?.toString() ?? null },
            yeni: ic.map((y, i) => ({ paymentId: yeniIdler[i], tur: y.tur, tutar: y.tutar, tarih: y.an.toISOString(), bankId: y.bankId, posDeviceId: y.posDeviceId, taksit: y.taksit })),
            silinenKasaHareketi: p.silinecekHareket,
            vardiya: [...p.vardiya.values()].map((v) => ({ shiftId: v.shift.id, delta: v.delta, otomatik: otomatikMi(v.shift), eskiSayim: v.shift.physicalCash?.toString() ?? null, eskiFark: v.shift.diff?.toString() ?? null })),
            odoo: { eskiIptal: eskiOdoo?.id ?? null, yeni: yeniOdoo.map((y) => y.id) },
            ozet: p.satirlar,
          },
        },
      });
    });
  } catch (e) {
    const geri = await odooGeriAl();
    throw mudahaleHatasi(`POS kaydı yazılamadı, hiçbir şey değiştirilmedi: ${(e as Error).message}${geri ? ` (Odoo geri alma: ${geri})` : ''}`);
  }
  return { ok: true, satirlar: p.satirlar, uyarilar: p.uyarilar, odoo: odooYapilan };
}

// ───────────────────────── TARİH DÜZELT ─────────────────────────

export type TarihGirdi = { tarih: string; saat?: string | null; odemeIdler: string[] };

async function tarihPlanla(saleId: string, g: TarihGirdi) {
  const satirlar: string[] = [];
  const uyarilar: string[] = [];
  const engeller: string[] = [];
  const sale = await satisGetir(saleId);
  durumKontrol(sale.status, engeller);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.tarih)) throw mudahaleHatasi('Tarih geçersiz.');
  if (g.saat && !/^\d{2}:\d{2}$/.test(g.saat)) throw mudahaleHatasi('Saat SS:DD biçiminde olmalı.');
  const eskiGun = gunTR(sale.createdAt);
  if (eskiGun < KILIT_GUN) engeller.push(`Satış ${trYaz(sale.createdAt)} tarihli — Ekim ve öncesine dokunulmaz.`);
  if (g.tarih < KILIT_GUN) engeller.push('Ekim ve öncesine tarih yazılamaz.');
  if (g.tarih > bugunTR()) engeller.push('İleri tarih yazılamaz.');
  if (g.tarih.slice(0, 4) !== eskiGun.slice(0, 4)) engeller.push('Yıl değiştirilemez (Odoo belge numaraları yıllık).');
  const yeniAn = trAn(g.tarih, g.saat ?? saatTR(sale.createdAt));
  if (yeniAn.getTime() === sale.createdAt.getTime()) engeller.push('Yeni tarih/saat eskisiyle aynı.');

  // taşınacak ödemeler
  const tasinan = sale.payments.filter((p) => g.odemeIdler.includes(p.id));
  if (tasinan.length !== g.odemeIdler.length) throw mudahaleHatasi('Seçilen ödemelerden biri bu satışa ait değil.');
  for (const p of tasinan) if (gunTR(p.createdAt) < KILIT_GUN) engeller.push(`${TUR_AD[p.paymentType]} ${tl(Number(p.grossAmount))} ödemesi Ekim ve öncesinde — taşınamaz.`);

  // vardiya: satışın yeni gününde şubede açılmış kasa
  const v = await vardiyaBul(sale.branchId, yeniAn);
  const nakitVar = tasinan.some((p) => p.paymentType === PaymentType.CASH);
  if (!v && nakitVar) engeller.push(`${g.tarih.split('-').reverse().join('.')} günü bu şubede kasa açılmamış — nakit ödeme o güne taşınamaz.`);
  if (!v && !nakitVar) uyarilar.push('Yeni günde bu şubede kasa açılmamış — satış eski kasada (vardiyada) kalır, sadece tarih değişir.');

  const vardiya = new Map<string, VardiyaEtki>();
  const odemeler: Array<{ pay: (typeof tasinan)[number]; an: Date; shift: Shift | null; eskiShift: Shift | null }> = [];
  for (const p of tasinan) {
    let an = trAn(g.tarih, saatTR(p.createdAt));
    let shift: Shift | null = null; let eskiShift: Shift | null = null;
    if (p.paymentType === PaymentType.CASH) {
      const sube = p.tahsilatBranchId ?? sale.branchId;
      const ev = await vardiyaBul(sube, p.createdAt);
      if (ev && ev.an.getTime() === p.createdAt.getTime()) { eskiShift = ev.shift; vardiyaEtkiEkle(vardiya, ev.shift, -Number(p.grossAmount)); }
      const yv = await vardiyaBul(sube, an);
      if (yv) { shift = yv.shift; an = yv.an; vardiyaEtkiEkle(vardiya, yv.shift, Number(p.grossAmount)); }
      else engeller.push(`Nakit ${tl(Number(p.grossAmount))} ödemesinin şubesinde ${g.tarih.split('-').reverse().join('.')} günü kasa açılmamış — taşınamaz.`);
    }
    odemeler.push({ pay: p, an, shift, eskiShift });
  }
  const hareketler = nakitVar
    ? await prisma.cashMovement.findMany({ where: { description: `SALE_CASH_PAYMENT:${saleId}`, type: CashMovementType.CASH_IN } })
    : [];

  // Odoo
  const odoo = await odooBilgi(sale);
  const kullanilan = new Set<number>();
  const odooTasinan: Array<{ t: OdooTahsilat; yeniGun: string }> = [];
  for (const o of odemeler) {
    if (o.pay.paymentType === PaymentType.OPEN_ACCOUNT) continue;
    const t = tahsilatEslestir(odoo.tahsilatlar, o.pay.paymentType, Number(o.pay.grossAmount), gunTR(o.pay.createdAt), kullanilan);
    if (!t) { if (odoo.fatura) uyarilar.push(`${TUR_AD[o.pay.paymentType]} ${tl(Number(o.pay.grossAmount))} için Odoo tahsilatı bulunamadı — Odoo'da tarihi değişmez.`); continue; }
    kullanilan.add(t.id);
    if (t.date !== gunTR(o.an)) odooTasinan.push({ t, yeniGun: gunTR(o.an) });
  }
  const efaturaGitti = sale.eFaturaDurum === 'GONDERILDI';
  const faturaDegisir = !!odoo.fatura && !efaturaGitti && odoo.fatura.invoice_date !== g.tarih;

  satirlar.push(`Satış ${sale.referansNo ?? sale.id} — ${sale.customer.name}`);
  satirlar.push(`Satış tarihi: ${trYaz(sale.createdAt)} → ${trYaz(yeniAn)}`);
  if (v && v.shift.id !== sale.shiftId) satirlar.push(`Satış ${trYaz(v.shift.openedAt).slice(0, 10)} kasasına (vardiyasına) taşınır.`);
  for (const o of odemeler) satirlar.push(`Ödeme: ${TUR_AD[o.pay.paymentType]} ${tl(Number(o.pay.grossAmount))} ${trYaz(o.pay.createdAt)} → ${trYaz(o.an)}`);
  const kalan = sale.payments.filter((p) => !g.odemeIdler.includes(p.id));
  for (const p of kalan) satirlar.push(`Değişmez: ${TUR_AD[p.paymentType]} ${tl(Number(p.grossAmount))} ${trYaz(p.createdAt)}`);
  satirlar.push(...vardiyaSatirlari(vardiya, uyarilar));
  if (odoo.so) satirlar.push(`Odoo sipariş ${odoo.so.name}: tarih ${String(odoo.so.date_order).slice(0, 10)} → ${g.tarih}`);
  if (odoo.fatura) {
    if (efaturaGitti) uyarilar.push(`E-fatura gönderilmiş — Odoo fatura tarihi (${odoo.fatura.invoice_date || '-'}) resmi belge olduğu için DEĞİŞMEZ.`);
    else if (faturaDegisir) satirlar.push(`Odoo fatura ${odoo.fatura.name}: tarih ${odoo.fatura.invoice_date || '-'} → ${g.tarih} (taslağa alınıp yeniden onaylanır, tahsilatlar yeniden bağlanır)`);
  }
  for (const o of odooTasinan) satirlar.push(`Odoo tahsilat ${o.t.name}: tarih ${o.t.date} → ${o.yeniGun}`);
  if (!odoo.so) uyarilar.push("Satış Odoo'ya gönderilmemiş — sadece POS kaydı değişir.");
  uyarilar.push('Satışın referans numarası (GVNS-…) ve stok çıkış tarihi değişmez.');

  return { satirlar, uyarilar, engeller, sale, yeniAn, v, odemeler, hareketler, vardiya, odoo, odooTasinan, faturaDegisir };
}

export async function tarihDuzeltPlan(saleId: string, g: TarihGirdi): Promise<PlanSonuc> {
  const p = await tarihPlanla(saleId, g);
  return { satirlar: p.satirlar, uyarilar: p.uyarilar, engeller: p.engeller };
}

async function odooTahsilatTarihi(t: OdooTahsilat, gun: string) {
  const ctx = sirketCtx(t.company_id[0]);
  await cagir('account.payment', 'action_draft', [[t.id]], ctx);
  await cagir('account.payment', 'write', [[t.id], { date: gun }], ctx);
  await cagir('account.payment', 'action_post', [[t.id]], ctx);
}

async function odooFaturaTarihi(f: OdooFatura, gun: string) {
  const ctx = sirketCtx(f.company_id[0]);
  await cagir('account.move', 'button_draft', [[f.id]], ctx);
  await cagir('account.move', 'write', [[f.id], { invoice_date: gun, date: gun }], ctx);
  await cagir('account.move', 'action_post', [[f.id]], ctx);
}

async function tumTahsilatlariBagla(saleId: string, f: OdooFatura) {
  const list = (await execute('account.payment', 'search_read', [[['ref', 'ilike', saleId], ['state', '=', 'posted']]], { fields: ['id', 'company_id'], ...TUM })) as Array<{ id: number; company_id: [number, string] }>;
  const hatalar: string[] = [];
  for (const t of list) {
    const b = await odooTahsilatiFaturayaBagla(t.id, f.id, t.company_id[0]);
    if (!b.ok && !/zaten ödenmiş|alacak satırı yok/i.test(String(b.hata))) hatalar.push(`#${t.id}: ${b.hata}`);
  }
  return hatalar;
}

export async function tarihDuzeltUygula(saleId: string, g: TarihGirdi, sebep: string, userId: string) {
  const p = await tarihPlanla(saleId, g);
  if (p.engeller.length) throw mudahaleHatasi(`Uygulanamaz: ${p.engeller.join(' | ')}`);
  const { sale, odoo } = p;
  const yapilan: string[] = [];
  const geriAdim: Array<() => Promise<void>> = [];
  const odooGeriAl = async () => {
    const notlar: string[] = [];
    for (const f of geriAdim.reverse()) {
      try { await f(); } catch (e) { notlar.push((e as Error).message); }
    }
    if (odoo.fatura && (p.faturaDegisir || p.odooTasinan.length)) {
      try { const h = await tumTahsilatlariBagla(saleId, odoo.fatura); notlar.push(...h); } catch (e) { notlar.push((e as Error).message); }
    }
    return notlar.length ? `geri alma notları: ${notlar.join('; ')}` : 'Odoo eski hâline döndürüldü';
  };

  // 1) Odoo
  if (odoo.so) {
    try {
      const soCid = odoo.so.company_id?.[0] ?? 1;
      const eskiDate = String(odoo.so.date_order);
      const yeniDate = p.yeniAn.toISOString().slice(0, 19).replace('T', ' ');
      await cagir('sale.order', 'write', [[odoo.so.id], { date_order: yeniDate }], sirketCtx(soCid));
      geriAdim.push(async () => { await cagir('sale.order', 'write', [[odoo.so.id], { date_order: eskiDate }], sirketCtx(soCid)); });
      yapilan.push(`sipariş ${odoo.so.name} tarihi güncellendi`);
      for (const o of p.odooTasinan) {
        await odooTahsilatTarihi(o.t, o.yeniGun);
        geriAdim.push(async () => { await odooTahsilatTarihi(o.t, o.t.date); });
        yapilan.push(`tahsilat ${o.t.name} tarihi ${o.yeniGun}`);
      }
      if (p.faturaDegisir && odoo.fatura) {
        const eskiF = odoo.fatura.invoice_date || gunTR(sale.createdAt);
        await odooFaturaTarihi(odoo.fatura, g.tarih);
        geriAdim.push(async () => { await odooFaturaTarihi(odoo.fatura!, eskiF); });
        yapilan.push(`fatura ${odoo.fatura.name} tarihi ${g.tarih}`);
      }
      if (odoo.fatura && (p.faturaDegisir || p.odooTasinan.length)) {
        const h = await tumTahsilatlariBagla(saleId, odoo.fatura);
        if (h.length) throw new Error(`tahsilatlar faturaya yeniden bağlanamadı: ${h.join('; ')}`);
        yapilan.push('tahsilatlar faturaya yeniden bağlandı');
      }
    } catch (e) {
      const geri = await odooGeriAl();
      throw mudahaleHatasi(`Odoo adımı başarısız, POS'a dokunulmadı: ${(e as Error).message} (${geri})`);
    }
  }

  // 2) POS
  try {
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: saleId }, data: { createdAt: p.yeniAn, ...(p.v ? { shiftId: p.v.shift.id } : {}) } });
      const kullanilanHareket = new Set<string>();
      for (const o of p.odemeler) {
        await tx.payment.update({ where: { id: o.pay.id }, data: { createdAt: o.an } });
        if (o.pay.paymentType === PaymentType.CASH && o.shift) {
          const h = p.hareketler.find((x) => !kullanilanHareket.has(x.id) && Math.abs(Number(x.amount) - Number(o.pay.grossAmount)) < 0.005);
          if (h) {
            kullanilanHareket.add(h.id);
            await tx.cashMovement.update({ where: { id: h.id }, data: { shiftId: o.shift.id, branchId: o.shift.branchId, createdAt: o.an } });
          }
        }
      }
      await vardiyalariUygula(tx, p.vardiya);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'MUDAHALE_TARIH',
          entity: 'Sale',
          entityId: saleId,
          payload: {
            saleId, sebep,
            eski: { createdAt: sale.createdAt.toISOString(), shiftId: sale.shiftId, odemeler: p.odemeler.map((o) => ({ id: o.pay.id, createdAt: o.pay.createdAt.toISOString() })) },
            yeni: { createdAt: p.yeniAn.toISOString(), shiftId: p.v?.shift.id ?? sale.shiftId, odemeler: p.odemeler.map((o) => ({ id: o.pay.id, createdAt: o.an.toISOString() })) },
            vardiya: [...p.vardiya.values()].map((v) => ({ shiftId: v.shift.id, delta: v.delta, otomatik: otomatikMi(v.shift), eskiSayim: v.shift.physicalCash?.toString() ?? null, eskiFark: v.shift.diff?.toString() ?? null })),
            odoo: { so: odoo.so?.id ?? null, eskiSoTarih: odoo.so?.date_order ?? null, fatura: p.faturaDegisir ? { id: odoo.fatura?.id, eski: odoo.fatura?.invoice_date } : null, tahsilatlar: p.odooTasinan.map((o) => ({ id: o.t.id, eski: o.t.date, yeni: o.yeniGun })) },
            ozet: p.satirlar,
          },
        },
      });
    });
  } catch (e) {
    const geri = odoo.so ? await odooGeriAl() : '';
    throw mudahaleHatasi(`POS kaydı yazılamadı, hiçbir şey değiştirilmedi: ${(e as Error).message}${geri ? ` (${geri})` : ''}`);
  }
  return { ok: true, satirlar: p.satirlar, uyarilar: p.uyarilar, odoo: yapilan };
}

// ───────────────────────── DÜZELTME GEÇMİŞİ ─────────────────────────

const GECMIS_AD: Record<string, string> = {
  MUDAHALE_ODEME: 'Ödeme düzeltme',
  MUDAHALE_TARIH: 'Tarih düzeltme',
  ODEME_DUZELT: 'Ödeme düzeltme (script)',
  SALE_REASSIGN_USER: 'Temsilci değişikliği',
  SALE_ITEM_KDV_DUZELT: 'KDV düzeltme',
  SALE_ITEM_FIYAT_DUZELT: 'Brüt tutar düzeltme',
  SALE_ITEM_RECETE_DUZELT: 'Reçete düzeltme',
  ODOO_TAHSILAT_BAGLANAMADI: 'Odoo tahsilatı faturaya bağlanamadı',
  MUDAHALE_LOT: 'Lot / UTS düzeltme',
};

export async function duzeltmeGecmisi(saleId: string) {
  const loglar = await prisma.auditLog.findMany({
    where: { OR: [{ entityId: saleId }, { payload: { path: ['saleId'], equals: saleId } }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const userIds = [...new Set(loglar.map((l) => l.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  return loglar.map((l) => {
    const pl = (l.payload ?? {}) as Record<string, any>;
    return {
      id: l.id,
      tarih: l.createdAt,
      islem: GECMIS_AD[l.action] ?? l.action,
      kullanici: users.find((u) => u.id === l.userId)?.name ?? (l.userId === 'SISTEM' ? 'Sistem' : l.userId),
      sebep: pl.sebep ?? pl.not ?? null,
      ozet: Array.isArray(pl.ozet) ? (pl.ozet as string[]) : null,
    };
  });
}

// ───────────────────────── LOT / UTS DÜZELT (Faz 2a) ─────────────────────────
//
// Satışta yanlış lot okutulmuş / Odoo serbest bir lot ya da "STOKSUZ-…" yer tutucu seçmişse: teslimatın
// (done) hareket satırındaki lot doğru lotla değiştirilir. Odoo 17 bitmiş satırda lot değişince stoğu
// kendisi düzeltir (eski lot şubeye +, yeni lot şubeden −); uygulamada bu ayrıca ölçülüp doğrulanır,
// stok kıpırdamadıysa lot eski hâline döndürülür ve iş durdurulur.
// NOT: POS satışında UTS "tüketiciye verme" bildirimi otomatik gönderilmiyor (sadece özel sipariş
// tesliminde) — bu yüzden lot düzeltmesi UTS'ye bir şey göndermez; elle yapılmış bildirim varsa uyarır.

type SatisMl = {
  id: number; lotId: number | null; lotAdi: string; utsKodu: string | null; qty: number; productId: number; productAdi: string;
  pickingId: number; pickingAdi: string; locationId: number; locationAdi: string; companyId: number;
};

async function satisHareketSatirlari(odooSaleOrderId: number | null): Promise<SatisMl[]> {
  if (!odooSaleOrderId) return [];
  const [so] = (await execute('sale.order', 'read', [[odooSaleOrderId], ['picking_ids']], TUM)) as any[];
  if (!so?.picking_ids?.length) return [];
  const pks = ((await execute('stock.picking', 'read', [so.picking_ids, ['name', 'state', 'picking_type_code', 'location_id', 'company_id', 'move_line_ids']], TUM)) as any[])
    .filter((p) => p.state === 'done' && p.picking_type_code === 'outgoing');
  const mlIds = pks.flatMap((p) => p.move_line_ids);
  if (!mlIds.length) return [];
  const mls = (await execute('stock.move.line', 'read', [mlIds, ['lot_id', 'quantity', 'product_id', 'location_id', 'picking_id']], TUM)) as any[];
  const lotIds = [...new Set(mls.filter((m) => m.lot_id).map((m) => m.lot_id[0]))];
  const lotlar = lotIds.length ? ((await execute('stock.lot', 'read', [lotIds, ['x_uts_kodu']], TUM)) as any[]) : [];
  return mls.map((m) => {
    const pk = pks.find((p) => p.id === m.picking_id[0]);
    const lt = m.lot_id ? lotlar.find((l) => l.id === m.lot_id[0]) : null;
    return {
      id: m.id, lotId: m.lot_id ? m.lot_id[0] : null, lotAdi: m.lot_id ? m.lot_id[1] : '-', utsKodu: lt?.x_uts_kodu || null,
      qty: Number(m.quantity), productId: m.product_id[0], productAdi: m.product_id[1],
      pickingId: pk?.id, pickingAdi: pk?.name, locationId: m.location_id[0], locationAdi: m.location_id[1], companyId: pk?.company_id?.[0] ?? 1,
    };
  });
}

async function lotStoklari(lotIds: number[]) {
  if (!lotIds.length) return [] as Array<{ lotId: number; locationId: number; locationAdi: string; qty: number }>;
  const qs = (await execute('stock.quant', 'search_read', [[['lot_id', 'in', lotIds], ['location_id.usage', '=', 'internal']]], { fields: ['lot_id', 'location_id', 'quantity'], ...TUM })) as any[];
  return qs.filter((q) => Math.abs(Number(q.quantity)) > 0.0001).map((q) => ({ lotId: q.lot_id[0], locationId: q.location_id[0], locationAdi: q.location_id[1], qty: Number(q.quantity) }));
}

async function lotKonumStok(lotId: number, locationId: number) {
  const qs = (await execute('stock.quant', 'search_read', [[['lot_id', '=', lotId], ['location_id', '=', locationId]]], { fields: ['quantity'], ...TUM })) as any[];
  return yuvarla(qs.reduce((s, q) => s + Number(q.quantity), 0));
}

async function kalemGetir(saleId: string, itemId: string) {
  const item = await prisma.saleItem.findUnique({ where: { id: itemId } });
  if (!item || item.saleId !== saleId) throw mudahaleHatasi('Kalem bu satışta bulunamadı.');
  if (!item.odooProductId) throw mudahaleHatasi("Bu kalemin Odoo ürünü yok (hizmet/özel kalem) — lotu olmaz.");
  return { item, productId: parseInt(item.odooProductId, 10) };
}

/** Kalemin satıldığı hareket satırları + aranan koda uyan, AYNI ürüne ait lot adayları (stoklarıyla). */
export async function lotAra(saleId: string, itemId: string, q: string) {
  const sale = await satisGetir(saleId);
  const { productId } = await kalemGetir(saleId, itemId);
  const tumMl = await satisHareketSatirlari(sale.odooSaleOrderId);
  const satirlar = tumMl.filter((m) => m.productId === productId);
  const kod = q.trim();
  let adaylar: Array<{ id: number; name: string; utsKodu: string | null; companyId: number | null; stoklar: Array<{ locationAdi: string; qty: number }> }> = [];
  if (kod.length >= 2) {
    const terimler = new Set<string>([kod]);
    const gs1 = parseGs1DataMatrix(kod);
    if (gs1?.lot) terimler.add(gs1.lot);
    if (gs1?.serial) terimler.add(gs1.serial);
    const or: unknown[] = [];
    for (const t of terimler) or.push(['name', 'ilike', t], ['x_uts_kodu', 'ilike', t]);
    const dom = [['product_id', '=', productId], ...Array(or.length - 1).fill('|'), ...or];
    const lotlar = (await execute('stock.lot', 'search_read', [dom], { fields: ['id', 'name', 'x_uts_kodu', 'company_id'], limit: 20, ...TUM })) as any[];
    const st = await lotStoklari(lotlar.map((l) => l.id));
    adaylar = lotlar.map((l) => ({
      id: l.id, name: l.name, utsKodu: l.x_uts_kodu || null, companyId: l.company_id ? l.company_id[0] : null,
      stoklar: st.filter((s) => s.lotId === l.id).map((s) => ({ locationAdi: s.locationAdi, qty: s.qty })),
    }));
  }
  return {
    satirlar: satirlar.map((m) => ({ mlId: m.id, lotAdi: m.lotAdi, utsKodu: m.utsKodu, qty: m.qty, pickingAdi: m.pickingAdi, locationAdi: m.locationAdi })),
    adaylar,
    not: !satirlar.length ? "Bu kalemin Odoo'da tamamlanmış teslimat satırı yok — lot düzeltilemez." : (kod.length >= 2 && !adaylar.length ? 'Bu ürüne ait böyle bir lot/UTS bulunamadı. Okutulan ürün başka model/renk/ölçü ise bu "kalem değiştirme"dir (Faz 2b).' : null),
  };
}

export type LotGirdi = { itemId: string; mlId: number; lotId: number };

async function lotPlanla(saleId: string, g: LotGirdi) {
  const satirlar: string[] = [];
  const uyarilar: string[] = [];
  const engeller: string[] = [];
  const sale = await satisGetir(saleId);
  durumKontrol(sale.status, engeller);
  if (gunTR(sale.createdAt) < KILIT_GUN) engeller.push(`Satış ${trYaz(sale.createdAt)} tarihli — Ekim ve öncesine dokunulmaz.`);
  const { item, productId } = await kalemGetir(saleId, g.itemId);
  const ml = (await satisHareketSatirlari(sale.odooSaleOrderId)).find((m) => m.id === g.mlId);
  if (!ml || ml.productId !== productId) throw mudahaleHatasi('Seçilen teslimat satırı bu kaleme ait değil.');
  const [lot] = (await execute('stock.lot', 'read', [[g.lotId], ['name', 'product_id', 'company_id', 'x_uts_kodu']], TUM)) as any[];
  if (!lot) throw mudahaleHatasi('Lot bulunamadı.');
  if (lot.product_id?.[0] !== productId) engeller.push('Seçilen lot başka bir ürüne ait.');
  if (lot.company_id && lot.company_id[0] !== ml.companyId) engeller.push(`Seçilen lot başka şirkette (${lot.company_id[1]}) — bu teslimatın şirketinde değil.`);
  if (ml.lotId === lot.id) engeller.push('Satırda zaten bu lot var.');

  const yeniStok = await lotKonumStok(lot.id, ml.locationId);
  const tum = await lotStoklari([lot.id]);
  satirlar.push(`Satış ${sale.referansNo ?? sale.id} — ${sale.customer.name}`);
  satirlar.push(`Kalem: ${ml.productAdi} (${ml.qty} adet) — teslimat ${ml.pickingAdi}, ${ml.locationAdi}`);
  satirlar.push(`ESKİ lot: ${ml.lotAdi}${ml.utsKodu ? ` (UTS ${ml.utsKodu})` : ''} → şube stoğuna +${ml.qty} geri döner`);
  satirlar.push(`YENİ lot: ${lot.name}${lot.x_uts_kodu ? ` (UTS ${lot.x_uts_kodu})` : ''} → şube stoğundan −${ml.qty} (şimdi ${yeniStok}, sonra ${yuvarla(yeniStok - ml.qty)})`);
  if (ml.lotAdi.startsWith('STOKSUZ-')) satirlar.push('Eski lot satış anında açılmış yer tutucu (STOKSUZ) — eksi stoğu sıfırlanır.');
  if (yeniStok < ml.qty) {
    const baska = tum.filter((s) => s.locationId !== ml.locationId && s.qty > 0);
    uyarilar.push(`Yeni lot bu şubede stokta görünmüyor (${yeniStok}) — eksiye düşer.${baska.length ? ` Stokta olduğu yer: ${baska.map((s) => `${s.locationAdi} ${s.qty}`).join(', ')} (önce transfer gerekebilir).` : ''}`);
  }
  if (item.lotNo && item.lotNo !== ml.lotAdi && item.lotNo !== ml.utsKodu) uyarilar.push(`POS kalemindeki lot (${item.lotNo}) Odoo satırındakiyle (${ml.lotAdi}) zaten farklıydı.`);
  satirlar.push(`POS kalemindeki lot: ${item.lotNo ?? '-'} → ${lot.name}`);
  const uts = sale.referansNo ? await prisma.utsBildirim.findFirst({ where: { tip: 'TUKETICIYE_VERME', belgeNo: sale.referansNo, durum: 'GONDERILDI' } }) : null;
  if (uts) uyarilar.push(`Bu satış için UTS'ye elle "tüketiciye verme" bildirimi gönderilmiş (${uts.utsBildirimId ?? uts.id}) — UTS Yönetimi'nden eski bildirimi iptal edip doğru lotla yeniden bildirin.`);
  return { satirlar, uyarilar, engeller, sale, item, ml, lot, yeniStok };
}

export async function lotDuzeltPlan(saleId: string, g: LotGirdi): Promise<PlanSonuc> {
  const p = await lotPlanla(saleId, g);
  return { satirlar: p.satirlar, uyarilar: p.uyarilar, engeller: p.engeller };
}

export async function lotDuzeltUygula(saleId: string, g: LotGirdi, sebep: string, userId: string) {
  const p = await lotPlanla(saleId, g);
  if (p.engeller.length) throw mudahaleHatasi(`Uygulanamaz: ${p.engeller.join(' | ')}`);
  const { ml, lot, item } = p;
  const kw = { context: { allowed_company_ids: [ml.companyId, ...ODOO_ALL_COMPANY_IDS.filter((c) => c !== ml.companyId)], company_id: ml.companyId } };
  const eskiStokOnce = ml.lotId ? await lotKonumStok(ml.lotId, ml.locationId) : null;
  const yeniStokOnce = await lotKonumStok(lot.id, ml.locationId);
  const geriYaz = async () => { await cagir('stock.move.line', 'write', [[ml.id], { lot_id: ml.lotId }], kw); };

  try {
    await cagir('stock.move.line', 'write', [[ml.id], { lot_id: lot.id }], kw);
  } catch (e) {
    throw mudahaleHatasi(`Odoo lotu değiştirmedi, hiçbir şey yazılmadı: ${(e as Error).message}`);
  }
  // doğrulama: satır yeni lotta mı, stok gerçekten kaydı mı?
  const [son] = (await execute('stock.move.line', 'read', [[ml.id], ['lot_id']], TUM)) as any[];
  const yeniStokSonra = await lotKonumStok(lot.id, ml.locationId);
  const eskiStokSonra = ml.lotId ? await lotKonumStok(ml.lotId, ml.locationId) : null;
  const satirTamam = son?.lot_id?.[0] === lot.id;
  const stokTamam = Math.abs(yeniStokSonra - (yeniStokOnce - ml.qty)) < 0.001 && (eskiStokOnce == null || Math.abs((eskiStokSonra ?? 0) - (eskiStokOnce + ml.qty)) < 0.001);
  if (!satirTamam || !stokTamam) {
    let geri = '';
    try { await geriYaz(); geri = 'lot eski hâline döndürüldü'; } catch (e) { geri = `ESKİ HÂLİNE DÖNDÜRÜLEMEDİ: ${(e as Error).message}`; }
    throw mudahaleHatasi(`Odoo stoğu beklendiği gibi güncellemedi (yeni lot ${yeniStokOnce}→${yeniStokSonra}, eski lot ${eskiStokOnce ?? '-'}→${eskiStokSonra ?? '-'}) — ${geri}. Bana bildirin.`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.saleItem.update({ where: { id: item.id }, data: { lotNo: lot.name } });
      await tx.auditLog.create({
        data: {
          userId, action: 'MUDAHALE_LOT', entity: 'Sale', entityId: saleId,
          payload: {
            saleId, sebep, itemId: item.id, eskiPosLot: item.lotNo,
            odoo: { mlId: ml.id, eskiLotId: ml.lotId, eskiLot: ml.lotAdi, yeniLotId: lot.id, yeniLot: lot.name, lokasyon: ml.locationAdi, adet: ml.qty, stok: { eskiOnce: eskiStokOnce, eskiSonra: eskiStokSonra, yeniOnce: yeniStokOnce, yeniSonra: yeniStokSonra } },
            ozet: p.satirlar,
          },
        },
      });
    });
  } catch (e) {
    let geri = '';
    try { await geriYaz(); geri = "Odoo'da lot eski hâline döndürüldü"; } catch (e2) { geri = `Odoo GERİ ALINAMADI: ${(e2 as Error).message}`; }
    throw mudahaleHatasi(`POS kaydı yazılamadı: ${(e as Error).message} (${geri})`);
  }
  return { ok: true, satirlar: p.satirlar, uyarilar: p.uyarilar, odoo: [`teslimat satırı ${lot.name} lotuna çevrildi, stok doğrulandı`] };
}
