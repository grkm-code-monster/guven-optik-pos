/**
 * 23.10.2026 — YANLIŞ ŞUBEYE KAYDEDİLMİŞ SATIŞLARI DOĞRU ŞUBEYE TAŞIMA.
 *
 * Arka plan: Sude Parıldar'ın (SP) kullanıcısı sistemde GVN1'e kayıtlıydı. Satışın
 * şubesi createSale'de giriş yapan kullanıcının branchId'sinden geldiği için SP'nin
 * GVN2'de yaptığı satışlar GVN1'e (ADESE) düştü ve GVN2 kasa formunda görünmedi.
 * Kullanıcının şubesi 23.10.2026'da GVN2 yapıldı; bu script geçmiş satışları taşır.
 *
 * VARSAYILAN: KURU ÇALIŞMA (dry-run) — hiçbir şey değiştirmez, sadece listeler.
 * Değişiklik için sonuna --uygula eklenmeli.
 *
 * Taşınan (POS veritabanı):
 *   - Sale.branchId  -> hedef şube
 *   - Sale.shiftId   -> hedef şubenin, satış anında açık olan vardiyası
 *                       (günlük kasa raporu vardiyaya göre çalıştığı için zorunlu)
 *   - CashMovement   -> açıklamasında satış id'si geçen nakit hareketleri (branchId+shiftId)
 * DOKUNULMAYAN (ayrıca karar gerekir — çıktıda gösterilir):
 *   - Odoo satış siparişi / stok çıkışı (picking) / Odoo faturası -> GVN1/ADESE'de kalır
 *   - Uyumsoft'a gönderilmiş e-fatura/e-arşiv (GİB'e gitmiş yasal belge)
 *   - referansNo (GVNS-...-GVN1-...) — basılmış belgelerde geçtiği için değiştirilmez
 * Güvenlik: e-faturası GİB'e GÖNDERİLMİŞ satışlar --uygula'da ATLANIR
 * (--faturali-dahil verilmedikçe). Hedef şubede o saatte vardiya yoksa ATLANIR.
 *
 * Kullanım:
 *   npm run satis-sube-tasi                                   (iki satış, kuru çalışma)
 *   npm run satis-sube-tasi -- --uygula                       (iki satışı taşı)
 *   npm run satis-sube-tasi -- --personel                     (SP'nin GVN2 dışı TÜM satışlarını listele)
 *   npm run satis-sube-tasi -- --personel --uygula            (hepsini taşı)
 *   npm run satis-sube-tasi -- REF1 REF2 --uygula             (belirli referanslar)
 *   Seçenekler: --hedef GVN2 (varsayılan) --kisi "sude" (varsayılan) --faturali-dahil
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

const VARSAYILAN_REFLER = ['GVNS-20261022-GVN1-00001', 'GVNS-20261022-GVN1-00002'];
const ODOO_CTX = { allowed_company_ids: [1, 2, 3, 4], active_test: false };

const argv = process.argv.slice(2);
const bayrak = (b: string) => argv.includes(b);
const deger = (b: string, v: string) => {
  const i = argv.indexOf(b);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : v;
};
const UYGULA = bayrak('--uygula');
const FATURALI_DAHIL = bayrak('--faturali-dahil');
const PERSONEL_MODU = bayrak('--personel');
const HEDEF_KOD = deger('--hedef', 'GVN2').toUpperCase();
const KISI = deger('--kisi', 'sude');
const refArgs = argv.filter((a, i) => !a.startsWith('--') && !['--hedef', '--kisi'].includes(argv[i - 1] ?? ''));

const tl = (v: unknown) => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const zaman = (d: Date | null | undefined) => (d ? d.toLocaleString('tr-TR') : '—');
const m2o = (v: unknown) => (Array.isArray(v) ? String(v[1]) : '—');

async function odooOzet(soId: number | null): Promise<string> {
  if (!soId) return 'Odoo siparişi yok';
  try {
    const so = ((await execute('sale.order', 'read', [[soId]], {
      fields: ['name', 'state', 'company_id', 'picking_ids', 'invoice_ids'],
      context: ODOO_CTX,
    })) as any[])[0];
    if (!so) return `Odoo sipariş ${soId} okunamadı`;
    let pick = 'picking yok';
    if (so.picking_ids?.length) {
      const pk = (await execute('stock.picking', 'read', [so.picking_ids], {
        fields: ['name', 'state', 'location_id'],
        context: ODOO_CTX,
      })) as any[];
      pick = pk.map((p) => `${p.name} ${p.state} (${m2o(p.location_id)})`).join(', ');
    }
    return `${so.name} ${so.state} | şirket: ${m2o(so.company_id)} | stok: ${pick} | Odoo fatura: ${so.invoice_ids?.length ?? 0}`;
  } catch (e: any) {
    return `Odoo okunamadı: ${e?.message ?? e}`;
  }
}

async function main() {
  console.log(UYGULA ? '*** UYGULAMA MODU — kayıtlar DEĞİŞECEK ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const branches = await prisma.branch.findMany();
  const subeById = new Map(branches.map((b) => [b.id, b]));
  const hedef = branches.find((b) => b.code.toUpperCase() === HEDEF_KOD);
  if (!hedef) throw new Error(`Hedef şube ${HEDEF_KOD} bulunamadı.`);
  console.log(`Hedef şube: ${hedef.code} — ${hedef.sirketAdi ?? '?'}\n`);

  let refler: string[];
  if (PERSONEL_MODU) {
    const users = await prisma.user.findMany({ where: { name: { contains: KISI, mode: 'insensitive' } } });
    if (!users.length) throw new Error(`"${KISI}" adında kullanıcı yok.`);
    for (const u of users) console.log(`Personel: ${u.name} (${u.username}) — şu anki şubesi: ${subeById.get(u.branchId)?.code}`);
    const satislar = await prisma.sale.findMany({
      where: { userId: { in: users.map((u) => u.id) }, branchId: { not: hedef.id } },
      orderBy: { createdAt: 'asc' },
      select: { referansNo: true, id: true },
    });
    const ozet = await prisma.sale.groupBy({ by: ['branchId'], where: { userId: { in: users.map((u) => u.id) } }, _count: true });
    console.log('Tüm satışlarının şube dağılımı: ' + ozet.map((o) => `${subeById.get(o.branchId)?.code}=${o._count}`).join(', ') + '\n');
    refler = satislar.map((s) => s.referansNo ?? s.id);
  } else {
    refler = refArgs.length ? refArgs : VARSAYILAN_REFLER;
  }

  let tasinan = 0;
  let atlanan = 0;
  for (const ref of refler) {
    const sale = await prisma.sale.findFirst({
      where: { OR: [{ referansNo: ref }, { id: ref }] },
      include: { customer: { select: { name: true } }, user: { select: { name: true } }, payments: true },
    });
    if (!sale) {
      console.log(`✗ ${ref}: bulunamadı`);
      atlanan++;
      continue;
    }
    const kaynak = subeById.get(sale.branchId);
    console.log(`• ${sale.referansNo ?? sale.id} | ${zaman(sale.createdAt)} | ${sale.status} | ${sale.customer?.name} | net ${tl(sale.netTotal)} | ${sale.user.name} | şu an: ${kaynak?.code} (${kaynak?.sirketAdi ?? '?'})`);

    if (sale.branchId === hedef.id) {
      console.log('    zaten hedef şubede, atlandı');
      continue;
    }

    const faturalar = await prisma.fatura.findMany({ where: { satisId: sale.id } });
    const kuyruk = await prisma.faturaKuyruk.findMany({ where: { satisId: sale.id } });
    const gonderilmis = faturalar.filter((f) => f.durum === 'GONDERILDI');
    console.log(`    e-fatura: ${faturalar.length ? faturalar.map((f) => `${f.faturaNo} ${f.profileId} ${f.durum} şube=${f.sube}`).join(', ') : 'yok'}${kuyruk.length ? ' | kuyruk: ' + kuyruk.map((k) => `${k.faturaNo} ${k.durum}`).join(', ') : ''} | sale.eFaturaDurum=${sale.eFaturaDurum ?? '—'}`);
    console.log(`    Odoo: ${await odooOzet(sale.odooSaleOrderId)}`);

    const hedefVardiya = await prisma.shift.findFirst({
      where: {
        branchId: hedef.id,
        openedAt: { lte: sale.createdAt },
        OR: [{ closedAt: null }, { closedAt: { gte: sale.createdAt } }],
      },
      orderBy: { openedAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    console.log(`    hedef vardiya: ${hedefVardiya ? `${hedefVardiya.id} (açan ${hedefVardiya.user.name}, ${zaman(hedefVardiya.openedAt)} -> ${zaman(hedefVardiya.closedAt)})` : 'YOK'}`);

    const nakitHareketleri = await prisma.cashMovement.findMany({ where: { description: { contains: sale.id } } });
    if (nakitHareketleri.length) console.log(`    nakit hareketi: ${nakitHareketleri.length} adet, toplam ${tl(nakitHareketleri.reduce((s, c) => s + Number(c.amount), 0))}`);

    if (!hedefVardiya) {
      console.log(`    ⚠️ ATLANDI: ${HEDEF_KOD}'de satış saatinde açık vardiya yok`);
      atlanan++;
      continue;
    }
    if (gonderilmis.length && !FATURALI_DAHIL) {
      console.log(`    ⚠️ ATLANDI: e-faturası ${kaynak?.sirketAdi ?? 'kaynak şirket'} adına GİB'e gönderilmiş — önce fatura kararı (--faturali-dahil ile zorlanabilir)`);
      atlanan++;
      continue;
    }

    if (UYGULA) {
      await prisma.$transaction([
        prisma.sale.update({ where: { id: sale.id }, data: { branchId: hedef.id, shiftId: hedefVardiya.id } }),
        prisma.cashMovement.updateMany({
          where: { id: { in: nakitHareketleri.map((c) => c.id) } },
          data: { branchId: hedef.id, shiftId: hedefVardiya.id },
        }),
      ]);
      console.log(`    ✓ TAŞINDI -> ${HEDEF_KOD} (eski şube ${kaynak?.code}, eski vardiya ${sale.shiftId})`);
    } else {
      console.log(`    → taşınacak (kuru çalışma)`);
    }
    tasinan++;
  }

  console.log(`\nÖzet: ${UYGULA ? 'taşınan' : 'taşınabilir'} ${tasinan}, atlanan ${atlanan}.`);
  if (!UYGULA && tasinan) console.log('Uygulamak için aynı komutu sonuna --uygula ekleyerek çalıştırın.');
  console.log('NOT: Odoo stok/sipariş/fatura ve GİB e-faturası bu script tarafından DEĞİŞTİRİLMEZ.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
