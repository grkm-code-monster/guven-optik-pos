/**
 * 23.10.2026 — YANLIŞ ŞUBEYE DÜŞEN SATIŞ TEŞHİSİ. SALT OKUNUR, hiçbir kayıt DEĞİŞTİRMEZ.
 *
 * Arka plan: GVN2'nin 22.10.2026 Excel kasa formundaki iki satış (Mehmet Akgün,
 * Buse Buran — ikisi de SP) sistemde GVN1 referansıyla kayıtlı:
 *   GVNS-20261022-GVN1-00001 (Mehmet Akgün), GVNS-20261022-GVN1-00002 (Buse Buran)
 * Satışın şubesi createSale'de giriş yapan kullanıcının branchId'sinden + o şubede
 * açık vardiyadan geliyor. GVN1 = ADESE, GVN2 = NG -> stok, Odoo satış siparişi ve
 * e-fatura da yanlış ŞİRKET üzerinden gitmiş olabilir. Taşıma tasarımından önce
 * her bir satışın nereye dokunduğunu görmek için.
 *
 * Gösterilenler: satış/şube/şirket, vardiya (kimin açtığı, hangi şube),
 * satışı yapan kullanıcı + kullanıcının kayıtlı şubesi, kalemler (lot dahil),
 * ödemeler (banka/taksit/komisyon), Odoo sale.order + picking (şirket, kaynak
 * lokasyon, durum), Fatura / FaturaKuyruk kayıtları, aynı vardiyadaki diğer
 * satışlar ve kasa hareketleri.
 *
 * Kullanım:
 *   npm run yanlis-sube-satis-teshis
 *   npm run yanlis-sube-satis-teshis -- GVNS-20261022-GVN1-00001 GVNS-20261022-GVN1-00002
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

const VARSAYILAN_REFLER = ['GVNS-20261022-GVN1-00001', 'GVNS-20261022-GVN1-00002'];
const TUM_SIRKETLER = { allowed_company_ids: [1, 2, 3, 4], active_test: false };

const tl = (v: unknown) => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const zaman = (d: Date | null | undefined) => (d ? d.toLocaleString('tr-TR') : '—');
const m2o = (v: unknown) => (Array.isArray(v) ? `${v[1]} (id ${v[0]})` : String(v ?? '—'));

async function odooSafe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    console.log(`   ⚠️ Odoo okunamadı (${label}): ${e?.message ?? e}`);
    return null;
  }
}

async function main() {
  const refler = process.argv.slice(2).length ? process.argv.slice(2) : VARSAYILAN_REFLER;
  const branches = await prisma.branch.findMany();
  const subeById = new Map(branches.map((b) => [b.id, b]));
  const subeTxt = (id: string | null | undefined) => {
    const b = id ? subeById.get(id) : null;
    return b ? `${b.code} — ${b.sirketAdi ?? '?'} (şirketId ${b.sirketId ?? '?'}, Odoo lok. ${b.odooLocationId ?? '?'})` : `? (${id})`;
  };
  const banks = await prisma.bank.findMany({ select: { id: true, name: true } }).catch(() => [] as { id: string; name: string }[]);
  const bankById = new Map(banks.map((b) => [b.id, b.name]));
  const posDevices = await prisma.posDevice.findMany({ select: { id: true, name: true, branchId: true } });
  const posById = new Map(posDevices.map((d) => [d.id, `${d.name} [${subeById.get(d.branchId)?.code ?? '?'}]`]));
  const incelenenVardiyalar = new Set<string>();

  for (const ref of refler) {
    console.log('\n' + '='.repeat(90));
    console.log(`SATIŞ ${ref}`);
    console.log('='.repeat(90));

    const sale = await prisma.sale.findUnique({
      where: { referansNo: ref },
      include: {
        customer: { select: { name: true } },
        user: { select: { name: true, username: true, role: true, branchId: true, isActive: true } },
        shift: { include: { user: { select: { name: true, username: true, branchId: true } } } },
        items: { include: { product: { select: { name: true } } } },
        payments: true,
      },
    });
    if (!sale) {
      console.log('   Bulunamadı.');
      continue;
    }

    console.log(`Satış id     : ${sale.id}`);
    console.log(`Müşteri      : ${sale.customer?.name}`);
    console.log(`Tarih        : ${zaman(sale.createdAt)}   Durum: ${sale.status}`);
    console.log(`Satış şubesi : ${subeTxt(sale.branchId)}`);
    console.log(`Tutarlar     : brüt ${tl(sale.grossTotal)} / indirim ${tl(sale.discountTotal)} / net ${tl(sale.netTotal)} / KDV ${tl(sale.taxTotal)} / SGK ${tl(sale.sgkAmount)}`);
    console.log(`Satışı yapan : ${sale.user.name} (${sale.user.username}, ${sale.user.role}${sale.user.isActive ? '' : ', PASİF'})`);
    console.log(`  -> kullanıcının kayıtlı şubesi: ${subeTxt(sale.user.branchId)}`);
    console.log(`Vardiya      : ${sale.shiftId}  şube: ${subeTxt(sale.shift.branchId)}`);
    console.log(`  -> açan: ${sale.shift.user.name} (${sale.shift.user.username}), açılış ${zaman(sale.shift.openedAt)}, kapanış ${zaman(sale.shift.closedAt)}, durum ${sale.shift.status}`);
    incelenenVardiyalar.add(sale.shiftId);

    console.log('\nKalemler:');
    for (const it of sale.items) {
      console.log(`   - ${it.odooProductName ?? it.product?.name ?? '?'} | odooProd ${it.odooProductId ?? '—'} | lot ${it.lotNo ?? '—'} | adet ${it.qty} | ${tl(it.lineTotal)} | KDV %${it.taxRate ?? '?'} | durum ${it.status} | atölye ${it.atolyeBranchId ? subeTxt(it.atolyeBranchId) : '—'}`);
    }

    console.log('\nÖdemeler:');
    for (const p of sale.payments) {
      console.log(`   - ${p.paymentType} | ${p.bankId ? bankById.get(p.bankId) ?? p.bankId : '—'} | ${p.installment ?? '—'} taksit | POS ${p.posDeviceId ? posById.get(p.posDeviceId) ?? p.posDeviceId : '—'} | brüt ${tl(p.grossAmount)} | oran ${p.commissionRate ?? '—'} | kom. ${tl(p.commissionAmount)} | ${zaman(p.createdAt)}`);
    }

    console.log('\nOdoo:');
    console.log(`   odooSaleOrderId=${sale.odooSaleOrderId ?? '—'} odooSaleId=${sale.odooSaleId ?? '—'} synced=${sale.odooSynced} syncStatus=${sale.syncStatus} hata=${sale.odooSyncError ?? sale.syncError ?? '—'}`);
    if (sale.odooSaleOrderId) {
      const so = await odooSafe('sale.order', () =>
        execute('sale.order', 'read', [[sale.odooSaleOrderId]], {
          fields: ['name', 'state', 'company_id', 'warehouse_id', 'partner_id', 'amount_total', 'picking_ids', 'invoice_ids'],
          context: TUM_SIRKETLER,
        }) as Promise<any[]>,
      );
      const o = so?.[0];
      if (o) {
        console.log(`   sale.order ${o.name} | durum ${o.state} | şirket ${m2o(o.company_id)} | depo ${m2o(o.warehouse_id)} | toplam ${tl(o.amount_total)}`);
        if (o.picking_ids?.length) {
          const picks = await odooSafe('stock.picking', () =>
            execute('stock.picking', 'read', [o.picking_ids], {
              fields: ['name', 'state', 'company_id', 'location_id', 'location_dest_id', 'date_done'],
              context: TUM_SIRKETLER,
            }) as Promise<any[]>,
          );
          for (const pk of picks ?? []) {
            console.log(`   picking ${pk.name} | ${pk.state} | şirket ${m2o(pk.company_id)} | ${m2o(pk.location_id)} -> ${m2o(pk.location_dest_id)} | ${pk.date_done || '—'}`);
          }
        } else {
          console.log('   picking yok');
        }
        if (o.invoice_ids?.length) {
          const invs = await odooSafe('account.move', () =>
            execute('account.move', 'read', [o.invoice_ids], {
              fields: ['name', 'state', 'company_id', 'amount_total', 'payment_state'],
              context: TUM_SIRKETLER,
            }) as Promise<any[]>,
          );
          for (const iv of invs ?? []) {
            console.log(`   fatura ${iv.name} | ${iv.state} | şirket ${m2o(iv.company_id)} | ${tl(iv.amount_total)} | ödeme ${iv.payment_state}`);
          }
        } else {
          console.log('   Odoo faturası yok');
        }
      }
    }

    console.log('\ne-Fatura:');
    console.log(`   sale.eFaturaId=${sale.eFaturaId ?? '—'} eFaturaDurum=${sale.eFaturaDurum ?? '—'}`);
    const faturalar = await prisma.fatura.findMany({ where: { satisId: sale.id } });
    for (const f of faturalar) {
      console.log(`   Fatura ${f.faturaNo} | şube ${f.sube} | ${f.profileId} | ${f.durum} | ${tl(f.tutar)} | alıcı ${f.aliciAdi} | ${zaman(f.gonderilenAt ?? f.createdAt)}${f.hata ? ' | HATA: ' + f.hata : ''}`);
    }
    if (!faturalar.length) console.log('   Fatura tablosunda kayıt yok');
    const kuyruk = await prisma.faturaKuyruk.findMany({ where: { satisId: sale.id } });
    for (const k of kuyruk) {
      console.log(`   Kuyruk ${k.faturaNo} | ${k.durum} | deneme ${k.deneme} | ${zaman(k.createdAt)}${k.hata ? ' | HATA: ' + k.hata : ''}`);
    }
    if (!kuyruk.length) console.log('   FaturaKuyruk\'ta kayıt yok');
  }

  for (const shiftId of incelenenVardiyalar) {
    console.log('\n' + '-'.repeat(90));
    console.log(`VARDİYA ${shiftId} — içindeki TÜM satışlar ve kasa hareketleri`);
    console.log('-'.repeat(90));
    const sales = await prisma.sale.findMany({
      where: { shiftId },
      include: { customer: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const s of sales) {
      console.log(`   ${zaman(s.createdAt)} | ${s.referansNo ?? '(ref yok)'} | ${s.status} | ${s.customer?.name} | ${tl(s.netTotal)} | ${s.user.name}`);
    }
    const cms = await prisma.cashMovement.findMany({ where: { shiftId }, orderBy: { createdAt: 'asc' } });
    for (const c of cms) {
      console.log(`   KASA ${zaman(c.createdAt)} | ${c.type} | ${tl(c.amount)} | ${c.description}`);
    }
    if (!cms.length) console.log('   kasa hareketi yok');
  }

  console.log('\nKarşılaştırma için 22.10.2026 GVN1 ve GVN2 vardiyaları:');
  const gun = new Date('2026-10-22T00:00:00');
  const gunSonu = new Date('2026-10-23T00:00:00');
  const hedef = branches.filter((b) => ['GVN1', 'GVN2'].includes(b.code.toUpperCase()));
  const vardiyalar = await prisma.shift.findMany({
    where: { branchId: { in: hedef.map((b) => b.id) }, openedAt: { lt: gunSonu }, OR: [{ closedAt: null }, { closedAt: { gte: gun } }] },
    include: { user: { select: { name: true, username: true } }, _count: { select: { sales: true } } },
    orderBy: { openedAt: 'asc' },
  });
  for (const v of vardiyalar) {
    console.log(`   ${subeById.get(v.branchId)?.code} | ${v.id} | açan ${v.user.name} (${v.user.username}) | ${zaman(v.openedAt)} -> ${zaman(v.closedAt)} | ${v.status} | ${v._count.sales} satış`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
