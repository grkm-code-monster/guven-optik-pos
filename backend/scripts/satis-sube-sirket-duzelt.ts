/**
 * 19.11.2026 — Yanlış ŞUBEYE (dolayısıyla yanlış Odoo ŞİRKETİNE) girilmiş satışı tamamen düzeltir.
 * Ör: Sude'nin hesabı GVN1'de göründüğü için GVN2 satışı GVN1 (ADESE) olarak girildi (Hasan Çoban).
 *
 * POS:  Sale.branchId → hedef şube, Sale.shiftId → hedef şubenin o günkü vardiyası, Sale/Payment/CashMovement
 *       tarihleri → --tarih (verilirse). Referans no değişmez.
 * ODOO (eski şirket): tahsilatlar taslak→iptal, fatura taslak→iptal, teslimat İADE edilir (eski şube stoğu
 *       geri gelir, eksiler kapanır), sipariş iptal.
 * ODOO (yeni şirket): satış onayındaki adımların aynısı — sipariş, hedef şube stoğundan teslim, fatura
 *       (--tarih günü), tahsilatlar ve faturaya bağlama.
 * GİB'e gönderilmiş e-fatura varsa DURUR.
 *
 *   npx ts-node --transpile-only scripts/satis-sube-sirket-duzelt.ts --tara
 *   npx ts-node --transpile-only scripts/satis-sube-sirket-duzelt.ts --satis=GVNS-... --sube=GVN2 [--tarih=2026-11-07T13:00] [--confirm]
 * Varsayılan KURU. Yapılanlar /root/satis-sube-sirket-duzelt-<zaman>.json dosyasına yazılır.
 */
import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { faturaAlacakHesabi, odooTahsilatOlustur, odooTahsilatiFaturayaBagla, tahsilatYevmiyesi } from '../src/modules/odoo/odoo-tahsilat';
import { getCompanyIdFromLokasyon, resolveBranchStockLocationId } from '../src/modules/odoo/odooLocations';
import { resolveWarehouseIdForCompany, validateSalePickingsFromBranch, zorlaTeslimEt } from '../src/modules/odoo/odoo-delivery.util';
import { readProductSaleTaxRate, resolvePosLineTax, ODOO_TAX_CHART_COMPANY_ID } from '../src/modules/odoo/odoo-tax.util';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const confirm = process.argv.includes('--confirm');
const TUM = { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS], active_test: false };
const sc = (c: number) => ({ allowed_company_ids: [c, ...ODOO_ALL_COMPANY_IDS.filter((x) => x !== c)], company_id: c });
const z = (d?: Date | null) => (d ? d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }).slice(0, 16) : '—');
const m2o = (v: unknown) => (Array.isArray(v) ? `${v[1]}#${v[0]}` : '—');
const ist = (s: string) => new Date(`${s.length === 16 ? `${s}:00` : s}+03:00`);
const odooTarih = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
const odooGun = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kayit: Array<Record<string, unknown>> = [];
const log = (s: string, ek: Record<string, unknown> = {}) => { console.log(s); kayit.push({ s, ...ek }); };

async function sessiz(model: string, method: string, ids: number[], companyId: number, ctx: Record<string, unknown> = {}) {
  try {
    return await execute(model, method, [ids], { context: { ...sc(companyId), ...ctx } }, companyId);
  } catch (e) {
    if (!/marshal None/i.test(e instanceof Error ? e.message : String(e))) throw e;
    return null;
  }
}

async function tara() {
  const satislar = await prisma.sale.findMany({
    where: { status: { not: 'DRAFT' }, odooSaleOrderId: { not: null } },
    select: { referansNo: true, odooSaleOrderId: true, createdAt: true, netTotal: true, branchId: true, customer: { select: { name: true } } },
  });
  const kod = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  const g1 = [...kod].find(([, c]) => c === 'GVN1')?.[0] ?? '-';
  const ids = satislar.map((s) => s.odooSaleOrderId!) as number[];
  const sirket = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = (await execute('sale.order', 'read', [ids.slice(i, i + 500)], { fields: ['company_id'], context: TUM })) as any[];
    for (const o of r) sirket.set(o.id, o.company_id?.[0]);
  }
  let n = 0;
  for (const s of satislar) {
    const bek = getCompanyIdFromLokasyon(kod.get(s.branchId) ?? '');
    const var_ = sirket.get(s.odooSaleOrderId!);
    if (bek && var_ && bek !== var_) {
      n++;
      console.log(`${z(s.createdAt)} | ${s.referansNo} | ${kod.get(s.branchId)} | ${s.customer?.name} | ${s.netTotal} | Odoo şirket ${var_} (olması gereken ${bek})`);
    }
  }
  const gvn1 = await prisma.sale.findMany({ where: { branchId: g1, status: { not: 'DRAFT' } }, select: { referansNo: true, createdAt: true, customer: { select: { name: true } }, user: { select: { name: true } } } });
  console.log(`\nŞube ile Odoo şirketi uyuşmayan satış: ${n}`);
  console.log(`GVN1 şubesinde duran satış (tüm zamanlar): ${gvn1.length}`);
  for (const s of gvn1) console.log(`   ${z(s.createdAt)} | ${s.referansNo} | ${s.customer?.name} | ${s.user?.name}`);
}

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  if (process.argv.includes('--tara')) return tara();

  const ref = arg('satis');
  const subeKod = (arg('sube') ?? '').toUpperCase();
  const tarihS = arg('tarih');
  if (!ref || !subeKod) throw new Error('--satis ve --sube zorunlu');
  const tarih = tarihS ? ist(tarihS) : null;
  if (tarih && Number.isNaN(tarih.getTime())) throw new Error('Tarih biçimi: 2026-11-07T13:00');

  const s = await prisma.sale.findFirst({
    where: { OR: [{ referansNo: ref }, { id: ref }] },
    include: { customer: true, items: true, payments: true },
  });
  if (!s) throw new Error(`Satış bulunamadı: ${ref}`);
  const eskiSube = await prisma.branch.findUniqueOrThrow({ where: { id: s.branchId } });
  const hedef = await prisma.branch.findFirst({ where: { code: subeKod } });
  if (!hedef) throw new Error(`Şube yok: ${subeKod}`);
  const yeniSirket = getCompanyIdFromLokasyon(hedef.code);
  if (!yeniSirket) throw new Error(`${hedef.code} için Odoo şirketi bulunamadı`);
  const yeniLok = hedef.odooLocationId ?? resolveBranchStockLocationId(hedef.code);
  const zaman = tarih ?? s.createdAt;

  log(`SATIŞ ${s.referansNo} | ${s.customer?.name} | ${s.status} | net ${s.netTotal} | ${z(s.createdAt)} | şube ${eskiSube.code}`);
  log(`HEDEF  şube ${hedef.code} | Odoo şirket ${yeniSirket} | stok lok. ${yeniLok} | tarih ${z(zaman)}`);

  // --- e-fatura kontrolü
  const faturalar = await prisma.fatura.findMany({ where: { satisId: s.id } });
  if (faturalar.some((f) => f.durum === 'GONDERILDI')) throw new Error('Bu satışın e-faturası GİB\'e gönderilmiş — durduruldu.');
  log(`e-fatura: ${faturalar.length ? faturalar.map((f) => `${f.faturaNo} ${f.durum}`).join(', ') : 'yok'}`);

  // --- POS hedef vardiya
  const gun = odooGun(zaman);
  const vardiya = await prisma.shift.findFirst({
    where: { branchId: hedef.id, openedAt: { gte: new Date(`${gun}T00:00:00+03:00`), lte: new Date(`${gun}T23:59:59+03:00`) } },
    orderBy: { openedAt: 'asc' },
    include: { user: { select: { name: true } } },
  });
  if (!vardiya) throw new Error(`${hedef.code} şubesinde ${gun} günü vardiya yok`);
  log(`POS vardiya: ${vardiya.id} (${vardiya.user.name}, ${z(vardiya.openedAt)} → ${z(vardiya.closedAt)}, ${vardiya.status})`);
  if (zaman < vardiya.openedAt) throw new Error(`Saat vardiya açılışından (${z(vardiya.openedAt)}) önce — daha geç bir saat verin`);
  const nakitHar = await prisma.cashMovement.findMany({ where: { description: { contains: s.id } } });
  log(`POS nakit hareketi: ${nakitHar.length}`);

  // --- Eski Odoo kayıtları
  let eski: any = null;
  let eskiFat: any[] = [];
  let eskiTes: any[] = [];
  let eskiOdeme: any[] = [];
  if (s.odooSaleOrderId) {
    [eski] = (await execute('sale.order', 'read', [[s.odooSaleOrderId]], { fields: ['id', 'name', 'state', 'company_id', 'invoice_ids', 'picking_ids', 'partner_id'], context: TUM })) as any[];
    log(`ESKİ ODOO sipariş ${eski.name} | ${eski.state} | ${m2o(eski.company_id)}`);
    if (eski.company_id[0] === yeniSirket) log('   ⚠️ Odoo siparişi zaten hedef şirkette — Odoo tarafı yeniden kurulmayacak');
    if (eski.invoice_ids.length) eskiFat = (await execute('account.move', 'read', [eski.invoice_ids], { fields: ['id', 'name', 'state', 'move_type', 'amount_total', 'payment_state', 'line_ids'], context: TUM })) as any[];
    for (const f of eskiFat) log(`   fatura ${f.name} | ${f.move_type} | ${f.state} | ${f.amount_total} | ${f.payment_state}`);
    if (eski.picking_ids.length) eskiTes = (await execute('stock.picking', 'read', [eski.picking_ids], { fields: ['id', 'name', 'state', 'location_id', 'location_dest_id', 'picking_type_code'], context: TUM })) as any[];
    for (const p of eskiTes) {
      const ml = (await execute('stock.move.line', 'search_read', [[['picking_id', '=', p.id]]], { fields: ['product_id', 'lot_id', 'quantity'], context: TUM })) as any[];
      log(`   teslimat ${p.name} | ${p.state} | ${m2o(p.location_id)} → ${m2o(p.location_dest_id)} | ${ml.map((x) => `${x.product_id[1]} lot ${x.lot_id?.[1] ?? '-'} x${x.quantity}`).join('; ')}`);
      p.ml = ml;
    }
    // faturaya bağlı tahsilatlar + ref'inde satış id'si geçenler
    const odemeIdleri = new Set<number>();
    for (const f of eskiFat) {
      const al = (await execute('account.move.line', 'search_read', [[['move_id', '=', f.id], ['account_type', '=', 'asset_receivable']]], { fields: ['matched_credit_ids'], context: TUM })) as any[];
      const pr = al.flatMap((x) => x.matched_credit_ids);
      if (pr.length) {
        const parts = (await execute('account.partial.reconcile', 'read', [pr], { fields: ['credit_move_id'], context: TUM })) as any[];
        const cml = parts.map((x) => x.credit_move_id[0]);
        const lines = (await execute('account.move.line', 'read', [cml], { fields: ['payment_id'], context: TUM })) as any[];
        for (const l of lines) if (l.payment_id) odemeIdleri.add(l.payment_id[0]);
      }
    }
    const refle = (await execute('account.payment', 'search', [[['ref', 'ilike', s.id], ['state', '!=', 'cancel']]], { context: TUM })) as number[];
    for (const id of refle) odemeIdleri.add(id);
    if (odemeIdleri.size) eskiOdeme = (await execute('account.payment', 'read', [[...odemeIdleri]], { fields: ['id', 'name', 'state', 'amount', 'company_id', 'journal_id', 'ref'], context: TUM })) as any[];
    for (const p of eskiOdeme) log(`   tahsilat ${p.name} | ${p.state} | ${p.amount} | ${m2o(p.company_id)} | ${m2o(p.journal_id)} | ${p.ref}`);
  } else log('Odoo siparişi yok');
  const odooYenidenKur = !!eski && eski.company_id[0] !== yeniSirket;

  // --- Ürünler hedef şirkette kullanılabilir mi
  const urunHarita = new Map<string, number>();
  for (const it of s.items.filter((x) => x.odooProductId && x.status !== 'VOID')) {
    const pid = Number(it.odooProductId);
    const [p] = (await execute('product.product', 'read', [[pid]], { fields: ['id', 'display_name', 'company_id', 'default_code'], context: TUM })) as any[];
    let yeni = pid;
    if (p?.company_id && p.company_id[0] !== yeniSirket) {
      const alt = (await execute('product.product', 'search_read', [[['name', '=', p.display_name.replace(/^\[.*?\]\s*/, '')], '|', ['company_id', '=', yeniSirket], ['company_id', '=', false]]], { fields: ['id', 'display_name'], limit: 1, context: TUM })) as any[];
      if (!alt[0]) throw new Error(`Ürün ${p.display_name} #${pid} sadece ${m2o(p.company_id)} şirketinde — hedef şirkette karşılığı yok`);
      yeni = alt[0].id;
    }
    urunHarita.set(it.id, yeni);
    log(`   kalem ${it.odooProductName} | ürün #${pid} (${p?.company_id ? m2o(p.company_id) : 'ortak'})${yeni !== pid ? ` → #${yeni}` : ''} | lot ${it.lotNo ?? '-'} | ${it.status}`);
  }

  // --- Yeni şube stok durumu (bilgi)
  for (const it of s.items.filter((x) => x.odooProductId && x.status !== 'VOID')) {
    const q = (await execute('stock.quant', 'search_read', [[['product_id', '=', urunHarita.get(it.id)!], ['location_id', '=', yeniLok]]], { fields: ['quantity', 'reserved_quantity', 'lot_id'], context: TUM })) as any[];
    log(`   ${hedef.code} stoğu ${it.odooProductName}: ${q.reduce((a, x) => a + x.quantity, 0)} adet${q.length ? ` (${q.map((x) => `${x.lot_id?.[1] ?? 'lotsuz'}:${x.quantity}`).join(', ')})` : ''}`);
  }

  if (!confirm) {
    console.log('\n--- KURU --- Yukarıdaki plan uygulanacak. Uygulamak için --confirm.');
    return;
  }

  // ===================== UYGULA =====================
  // 1) POS
  kayit.push({ posOnce: { branchId: s.branchId, shiftId: s.shiftId, createdAt: s.createdAt, odooSaleOrderId: s.odooSaleOrderId, odemeler: s.payments.map((p) => ({ id: p.id, createdAt: p.createdAt })), nakit: nakitHar.map((c) => ({ id: c.id, branchId: c.branchId, shiftId: c.shiftId, createdAt: c.createdAt })) } });
  await prisma.$transaction([
    prisma.sale.update({ where: { id: s.id }, data: { branchId: hedef.id, shiftId: vardiya.id, ...(tarih ? { createdAt: tarih } : {}) } }),
    ...(tarih ? [prisma.payment.updateMany({ where: { saleId: s.id }, data: { createdAt: tarih } })] : []),
    ...(nakitHar.length ? [prisma.cashMovement.updateMany({ where: { id: { in: nakitHar.map((c) => c.id) } }, data: { branchId: hedef.id, shiftId: vardiya.id, ...(tarih ? { createdAt: tarih } : {}) } })] : []),
    ...[...urunHarita].filter(([id, pid]) => String(pid) !== s.items.find((x) => x.id === id)?.odooProductId).map(([id, pid]) => prisma.saleItem.update({ where: { id }, data: { odooProductId: String(pid) } })),
  ]);
  log(`✓ POS: şube ${hedef.code}, vardiya ${vardiya.id}${tarih ? `, tarih ${z(tarih)}` : ''}`);
  if (!odooYenidenKur) {
    log('Odoo tarafı değişmedi.');
    return bitir();
  }

  const ec = eski.company_id[0] as number;
  // 2) Eski şirket: tahsilat → taslak → iptal
  for (const p of eskiOdeme.filter((x) => x.state !== 'cancel')) {
    const c = p.company_id[0];
    if (p.state !== 'draft') await sessiz('account.payment', 'action_draft', [p.id], c);
    await sessiz('account.payment', 'action_cancel', [p.id], c);
    log(`✓ eski tahsilat iptal: ${p.name} ${p.amount}`, { odeme: p.id });
  }
  // 3) Eski fatura → taslak → iptal
  for (const f of eskiFat.filter((x) => x.state !== 'cancel')) {
    if (f.state === 'posted') await sessiz('account.move', 'button_draft', [f.id], ec);
    await sessiz('account.move', 'button_cancel', [f.id], ec);
    log(`✓ eski fatura iptal: ${f.name}`, { fatura: f.id });
  }
  // 4) Eski teslimat iadesi (stok eski şubeye geri)
  for (const p of eskiTes.filter((x) => x.state === 'done' && x.picking_type_code === 'outgoing')) {
    const ctx = { ...sc(ec), active_id: p.id, active_ids: [p.id], active_model: 'stock.picking' };
    const onceki = (await execute('stock.picking', 'search_read', [[['return_id', '=', p.id], ['state', '!=', 'cancel']]], { fields: ['name', 'state'], context: TUM })) as any[];
    if (onceki.length) {
      log(`   ${p.name} için iade zaten var: ${onceki.map((x) => `${x.name} ${x.state}`).join(', ')} — atlandı`);
      continue;
    }
    const wiz = (await execute('stock.return.picking', 'create', [{ picking_id: p.id }], { context: ctx }, ec)) as number;
    const [w] = (await execute('stock.return.picking', 'read', [[wiz]], { fields: ['product_return_moves'], context: ctx })) as any[];
    if (!w?.product_return_moves?.length) {
      const mv = (await execute('stock.move', 'search_read', [[['picking_id', '=', p.id], ['state', '=', 'done']]], { fields: ['id', 'product_id', 'quantity'], context: TUM })) as any[];
      for (const m of mv) await execute('stock.return.picking.line', 'create', [{ wizard_id: wiz, product_id: m.product_id[0], quantity: m.quantity, move_id: m.id }], { context: ctx }, ec);
    }
    let ret: any;
    try {
      ret = await execute('stock.return.picking', 'create_returns', [[wiz]], { context: ctx }, ec);
    } catch (e) {
      if (!/create_returns/.test(e instanceof Error ? e.message : String(e))) throw e;
      ret = await execute('stock.return.picking', 'action_create_returns', [[wiz]], { context: ctx }, ec);
    }
    const retId = Number(ret?.res_id);
    if (!retId) throw new Error(`İade teslimatı oluşmadı (${p.name})`);
    const lotlar = (p.ml as any[]).map((x) => ({ productId: x.product_id[0], lotNo: x.lot_id ? String(x.lot_id[1]) : null, qty: Number(x.quantity) }));
    await zorlaTeslimEt(retId, ec, lotlar, true);
    const [rp] = (await execute('stock.picking', 'read', [[retId]], { fields: ['name', 'state'], context: TUM })) as any[];
    log(`✓ eski teslimat iade edildi: ${p.name} → ${rp.name} (${rp.state})`, { iade: retId });
  }
  // 5) Eski sipariş iptal
  try {
    await sessiz('sale.order', 'action_cancel', [eski.id], ec, { disable_cancel_warning: true });
    log(`✓ eski sipariş iptal: ${eski.name}`);
  } catch (e) {
    log(`⚠️ eski sipariş ${eski.name} iptal edilemedi (fatura+stok zaten geri alındı): ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
  }

  // 6) Yeni şirkette sipariş (satış onayındaki adımlarla aynı)
  const varOlan = (await execute('sale.order', 'search_read', [[['note', 'ilike', s.id], ['company_id', '=', yeniSirket], ['state', '!=', 'cancel']]], { fields: ['name'], context: TUM })) as any[];
  if (varOlan.length) throw new Error(`Hedef şirkette bu satış için sipariş zaten var (${varOlan.map((x) => x.name).join(', ')}) — tekrar oluşturulmadı, elle kontrol gerekir`);
  const partnerId = s.customer?.odooPartnerId ?? eski.partner_id?.[0] ?? 1;
  const satirlar: Array<[0, 0, Record<string, unknown>]> = [];
  for (const it of s.items.filter((x) => x.odooProductId && x.status !== 'VOID')) {
    const pid = urunHarita.get(it.id)!;
    const yerel = it.taxRate != null ? Number(it.taxRate) : null;
    const oran = yerel != null && yerel > 0 ? yerel : await readProductSaleTaxRate(pid, ODOO_TAX_CHART_COMPANY_ID);
    const { taxId, priceUnit } = await resolvePosLineTax({ companyId: yeniSirket, taxRate: oran, unitPriceInclusive: Number(it.unitPrice) });
    const brut = Number(it.unitPrice) * it.qty;
    satirlar.push([0, 0, {
      ...(taxId ? { tax_id: [[6, 0, [taxId]]] } : {}),
      product_id: pid,
      product_uom_qty: it.qty,
      price_unit: priceUnit,
      discount: brut > 0 ? Math.min(100, (Number(it.discount) / brut) * 100) : 0,
      name: it.odooProductName ?? 'Ürün',
    }]);
  }
  const depo = await resolveWarehouseIdForCompany(yeniSirket);
  const yeniSip = Number(await execute('sale.order', 'create', [{
    partner_id: partnerId,
    note: `POS Satış ID: ${s.id}`,
    order_line: satirlar,
    company_id: yeniSirket,
    date_order: odooTarih(zaman),
    ...(depo ? { warehouse_id: depo } : {}),
  }], { context: sc(yeniSirket) }, yeniSirket));
  await execute('sale.order', 'action_confirm', [[yeniSip]], { context: sc(yeniSirket) }, yeniSirket);
  await execute('sale.order', 'write', [[yeniSip], { date_order: odooTarih(zaman) }], { context: sc(yeniSirket) }, yeniSirket);
  const [ys] = (await execute('sale.order', 'read', [[yeniSip]], { fields: ['name', 'picking_ids'], context: TUM })) as any[];
  log(`✓ yeni sipariş ${ys.name} (şirket ${yeniSirket})`, { yeniSiparis: yeniSip });

  // 7) Hedef şube stoğundan teslim
  const lotlar = s.items.filter((x) => x.odooProductId && x.status !== 'VOID').map((x) => ({ productId: urunHarita.get(x.id)!, lotNo: x.lotNo ?? null, qty: x.qty }));
  const tes = await validateSalePickingsFromBranch(yeniSip, yeniLok, yeniSirket, lotlar);
  const uyari = !tes.ok ? `Stok teslimatı tamamlanamadı: ${tes.errors.join('; ')}` : tes.stoksuz.length ? `Stok düşüldü ama şubede kayıtlı stok yoktu (eksiye düştü): ${tes.stoksuz.join('; ')}` : null;
  log(uyari ? `⚠️ ${uyari}` : `✓ ${hedef.code} stoğundan düşüldü`);
  for (const pid of ys.picking_ids) {
    try {
      await execute('stock.picking', 'write', [[pid], { date_done: odooTarih(zaman) }], { context: sc(yeniSirket) }, yeniSirket);
      const mv = (await execute('stock.move', 'search', [[['picking_id', '=', pid]]], { context: TUM }, yeniSirket)) as number[];
      if (mv.length) await execute('stock.move', 'write', [mv, { date: odooTarih(zaman) }], { context: sc(yeniSirket) }, yeniSirket);
      const mls = (await execute('stock.move.line', 'search', [[['picking_id', '=', pid]]], { context: TUM }, yeniSirket)) as number[];
      if (mls.length) await execute('stock.move.line', 'write', [mls, { date: odooTarih(zaman) }], { context: sc(yeniSirket) }, yeniSirket);
    } catch (e) {
      log(`⚠️ teslimat tarihi yazılamadı: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }

  // 8) Fatura
  const wctx = { ...sc(yeniSirket), active_ids: [yeniSip], active_model: 'sale.order', active_id: yeniSip };
  const wiz = await execute('sale.advance.payment.inv', 'create', [{ advance_payment_method: 'delivered' }], { context: wctx }, yeniSirket);
  await execute('sale.advance.payment.inv', 'create_invoices', [[wiz]], { context: wctx }, yeniSirket).catch(() => {});
  const [ys2] = (await execute('sale.order', 'read', [[yeniSip]], { fields: ['invoice_ids'], context: TUM })) as any[];
  const fid = ys2.invoice_ids?.[0];
  if (!fid) throw new Error('Yeni fatura oluşmadı — Odoo\'da sipariş var, fatura elle kesilmeli');
  await execute('account.move', 'write', [[fid], { invoice_date: odooGun(zaman), date: odooGun(zaman) }], { context: sc(yeniSirket) }, yeniSirket);
  await sessiz('account.move', 'action_post', [fid], yeniSirket);
  const [yf] = (await execute('account.move', 'read', [[fid]], { fields: ['name', 'state', 'amount_total', 'company_id'], context: TUM })) as any[];
  log(`✓ yeni fatura ${yf.name} | ${yf.state} | ${yf.amount_total} | ${m2o(yf.company_id)}`, { yeniFatura: fid });

  // 9) Tahsilatlar (POS ödemeleriyle aynı) + faturaya bağla
  const alacak = await faturaAlacakHesabi(fid);
  const bankalar = new Map((await prisma.bank.findMany({ select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  for (const p of s.payments) {
    if (p.paymentType === 'OPEN_ACCOUNT') continue;
    const yev = await tahsilatYevmiyesi(yeniSirket, p.paymentType);
    const bankaAdi = p.bankId ? bankalar.get(p.bankId) ?? null : null;
    const pid = await odooTahsilatOlustur({
      companyId: yev.companyId,
      journalId: yev.journalId,
      partnerId,
      amount: Number(p.grossAmount),
      alacakHesapId: yev.yedek ? null : alacak,
      date: odooGun(zaman),
      ref: p.paymentType === 'TRANSFER' && bankaAdi ? `POS HAVALE ${bankaAdi} - ${s.id}` : `POS ${p.paymentType} - ${s.id}`,
    });
    const b = await odooTahsilatiFaturayaBagla(pid, fid, yev.companyId);
    log(`✓ tahsilat ${p.paymentType} ${p.grossAmount} → şirket ${yev.companyId}${yev.yedek ? ' (YEDEK 1959 yevmiyesi!)' : ''} | faturaya bağlandı: ${b.ok ? 'evet' : `HAYIR (${b.hata})`}`, { yeniOdeme: pid });
  }

  await prisma.sale.update({ where: { id: s.id }, data: { odooSaleOrderId: yeniSip, odooSynced: true, odooSyncError: uyari } });
  log(`✓ POS satışı yeni Odoo siparişine bağlandı (${ys.name})`);
  return bitir();
}

function bitir() {
  const dosya = `/root/satis-sube-sirket-duzelt-${Date.now()}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nTAMAM. Kayıt: ${dosya}`);
}

main()
  .catch((e) => { console.error('HATA:', e?.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
