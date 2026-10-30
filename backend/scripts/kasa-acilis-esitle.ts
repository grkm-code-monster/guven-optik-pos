/**
 * 30.10.2026 — Kasa açılış devrini Excel kasa formuyla EŞİTLEME.
 *
 * Excel'deki "devir" rakamları (bir günün akşam kapanışı) ile Optik POS'un
 * Mağaza Özeti kutularını eşitlemek için gereken TEK bir "ay açılış devri"
 * düzeltme kaydını (tarih = ayın 1'i) hesaplar.
 *
 * Optik POS'un KENDİ rakamları (düzeltme kayıtları HARİÇ) report.service.ts
 * ile BİREBİR aynı mantıkla, --tarih gününün SONUNA kadar hesaplanır —
 * yani o günden SONRA (ör. bugün) girilen satışlar hesaba KATILMAZ.
 *   Aylık Ciro  = computeAylikCiroToplami (ay başı 08:00 → tarih sonu)
 *   Banka Kom.  = ay içindeki TÜM kart ödemelerinin komisyonu (computeAylikOzet)
 *   KDV         = ay içindeki satışların taxTotal toplamı
 *   SGK         = ay içindeki satışların sgkAmount toplamı
 *   Kasa Nakit  = tarih sonuna kadar TÜM nakit ödemeler − TÜM nakit çıkışlar
 *                 (computeRunningKasaBakiye) + ay öncesi düzeltmelerin nakdi
 *
 * Gerekli düzeltme = Excel hedefi − POS'un kendi rakamı.
 *
 * VARSAYILAN: KURU ÇALIŞMA (hiçbir şey yazmaz). --uygula verilirse, şubenin
 * o aya ait (ayın 1'i ve sonrası) TÜM eski düzeltme kayıtlarını siler ve
 * yerine hesaplanan tek kaydı (ayın 1'i tarihli) oluşturur — tek transaction.
 *
 * Kullanım (backend klasöründe):
 *   npx ts-node --transpile-only scripts/kasa-acilis-esitle.ts --sube=GVN2 --tarih=2026-10-29 \
 *     --ciro=1677973.39 --komisyon=109115.83 --kdv=260218.31 --sgk=10638.91 --kasa=3865 [--uygula]
 */
import 'dotenv/config';
import { CashMovementType, PaymentType, Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';

const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : undefined;
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function main() {
  const subeKodu = arg('sube');
  const tarihStr = arg('tarih');
  const uygula = process.argv.includes('--uygula');
  const hedef = {
    ciro: arg('ciro'), komisyon: arg('komisyon'), kdv: arg('kdv'), sgk: arg('sgk'), kasa: arg('kasa'),
  };
  if (!subeKodu || !tarihStr || Object.values(hedef).some((v) => v === undefined)) {
    console.log('Eksik parametre. Bkz. dosyanın başındaki Kullanım.');
    process.exit(1);
  }

  const branch = await prisma.branch.findFirst({
    where: { OR: [{ code: subeKodu }, { code: subeKodu.replace(/\s/g, '') }, { name: { contains: subeKodu } }] },
  });
  if (!branch) { console.log(`Şube bulunamadı: ${subeKodu}`); process.exit(1); }

  const [y, m, d] = tarihStr.split('-').map(Number);
  const ayBaslangici = new Date(y, m - 1, 1, 8, 0, 0, 0);
  const tarihSonu = new Date(y, m - 1, d, 23, 59, 59, 999);
  const ayIlkGun = new Date(y, m - 1, 1, 0, 0, 0, 0);

  console.log(`Şube: ${branch.name} (${branch.code}) | Kesim: ${tarihSonu.toLocaleString('tr-TR')} | Ay başı: ${ayBaslangici.toLocaleString('tr-TR')}`);
  console.log(`Sunucu saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

  // ---- POS'un kendi rakamları (düzeltmesiz) ----
  const sales = await prisma.sale.findMany({
    where: { branchId: branch.id, status: SaleStatus.PAID, createdAt: { gte: ayBaslangici, lte: tarihSonu } },
    select: {
      createdAt: true, netTotal: true, taxTotal: true, sgkAmount: true, prescriptionAmount: true,
      payments: { where: { paymentType: PaymentType.CARD }, select: { createdAt: true, commissionAmount: true } },
    },
  });
  let ciro = D(0); let kdv = D(0); let sgk = D(0);
  for (const s of sales) {
    const net = Number(s.netTotal); const sg = Number(s.sgkAmount ?? 0); const vk = Number(s.prescriptionAmount ?? 0);
    const musteriPayi = Math.max(0, net - sg - vk);
    const tax = Number(s.taxTotal ?? 0);
    const oran = net > 0 ? (net - tax) / net : 1;
    ciro = ciro.plus(musteriPayi * oran);
    for (const p of s.payments) if (isSameCalendarDay(p.createdAt, s.createdAt)) ciro = ciro.minus(D(p.commissionAmount));
    kdv = kdv.plus(D(s.taxTotal)); sgk = sgk.plus(D(s.sgkAmount));
  }
  const komAgg = await prisma.payment.aggregate({
    where: { paymentType: PaymentType.CARD, sale: { branchId: branch.id, status: SaleStatus.PAID }, createdAt: { gte: ayBaslangici, lte: tarihSonu } },
    _sum: { commissionAmount: true },
  });
  const komisyon = D(komAgg._sum.commissionAmount);
  const nakitGiris = await prisma.payment.aggregate({
    where: { paymentType: PaymentType.CASH, sale: { branchId: branch.id, status: SaleStatus.PAID }, createdAt: { lte: tarihSonu } },
    _sum: { grossAmount: true },
  });
  const nakitCikis = await prisma.cashMovement.aggregate({
    where: { branchId: branch.id, type: CashMovementType.CASH_OUT, createdAt: { lte: tarihSonu } },
    _sum: { amount: true },
  });
  const kasaKendi = D(nakitGiris._sum.grossAmount).minus(D(nakitCikis._sum.amount));

  // ---- Mevcut düzeltme kayıtları ----
  const kayitlar = await prisma.kasaDuzeltme.findMany({ where: { branchId: branch.id }, orderBy: { tarih: 'asc' } });
  const silinecek = kayitlar.filter((k) => k.tarih >= ayIlkGun);
  const kalan = kayitlar.filter((k) => k.tarih < ayIlkGun);
  console.log('MEVCUT DÜZELTME KAYITLARI:');
  for (const k of kayitlar) {
    console.log(`  ${k.tarih.toISOString().slice(0, 10)} | nakit ${k.nakit} | kart ${k.kartBrut} | kdv ${k.kdv} | kom ${k.komisyon} | ciro ${k.ciro} | vakıf ${k.vakif} | sgk ${k.sgk} | açık h. ${k.acikHesap} | "${k.aciklama}" ${k.tarih >= ayIlkGun ? '← SİLİNECEK' : '(ay öncesi, kalacak)'}`);
  }
  if (!kayitlar.length) console.log('  (yok)');
  const kalanNakit = kalan.reduce((t, k) => t.plus(k.nakit), D(0));
  const tasinanVakif = silinecek.reduce((t, k) => t.plus(k.vakif), D(0));
  const tasinanKart = silinecek.reduce((t, k) => t.plus(k.kartBrut), D(0));
  const tasinanAcik = silinecek.reduce((t, k) => t.plus(k.acikHesap), D(0));

  // ---- Gerekli yeni kayıt ----
  const yeni = {
    ciro: D(hedef.ciro!).minus(ciro).toDecimalPlaces(2),
    komisyon: D(hedef.komisyon!).minus(komisyon).toDecimalPlaces(2),
    kdv: D(hedef.kdv!).minus(kdv).toDecimalPlaces(2),
    sgk: D(hedef.sgk!).minus(sgk).toDecimalPlaces(2),
    nakit: D(hedef.kasa!).minus(kasaKendi).minus(kalanNakit).toDecimalPlaces(2),
    kartBrut: tasinanKart, vakif: tasinanVakif, acikHesap: tasinanAcik,
  };

  const satir = (ad: string, h: string, k: Prisma.Decimal, n: Prisma.Decimal) =>
    console.log(`  ${ad.padEnd(12)} Excel ${Number(h).toFixed(2).padStart(14)} | POS kendi ${k.toFixed(2).padStart(14)} | GEREKEN DÜZELTME ${n.toFixed(2).padStart(14)}`);
  console.log(`\nHESAP (${tarihStr} sonu itibarıyla, ${sales.length} satış):`);
  satir('Aylık Ciro', hedef.ciro!, ciro, yeni.ciro);
  satir('Banka Kom.', hedef.komisyon!, komisyon, yeni.komisyon);
  satir('KDV', hedef.kdv!, kdv, yeni.kdv);
  satir('SGK', hedef.sgk!, sgk, yeni.sgk);
  satir('Kasa Nakit', hedef.kasa!, kasaKendi.plus(kalanNakit), yeni.nakit);
  if (!tasinanKart.isZero() || !tasinanVakif.isZero() || !tasinanAcik.isZero()) {
    console.log(`  (Silinen kayıtlardan aynen taşınan: kart ${tasinanKart} | vakıf ${tasinanVakif} | açık hesap ${tasinanAcik})`);
  }
  console.log(`\nYENİ KAYIT (${ayIlkGun.toLocaleDateString('tr-TR')}): nakit ${yeni.nakit} | kart ${yeni.kartBrut} | kdv ${yeni.kdv} | komisyon ${yeni.komisyon} | ciro ${yeni.ciro} | vakıf ${yeni.vakif} | sgk ${yeni.sgk} | açık hesap ${yeni.acikHesap}`);

  if (!uygula) {
    console.log('\n--- KURU ÇALIŞMA --- Hiçbir şey yazılmadı. Uygulamak için sonuna --uygula ekle.');
    return;
  }

  const kullanici = silinecek[0]?.userId ?? kalan[0]?.userId
    ?? (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))?.id;
  if (!kullanici) { console.log('Kayıt için kullanıcı bulunamadı.'); process.exit(1); }

  await prisma.$transaction(async (tx) => {
    if (silinecek.length) await tx.kasaDuzeltme.deleteMany({ where: { id: { in: silinecek.map((k) => k.id) } } });
    const k = await tx.kasaDuzeltme.create({
      data: {
        branchId: branch.id, userId: kullanici, tarih: ayIlkGun,
        nakit: yeni.nakit, kartBrut: yeni.kartBrut, kdv: yeni.kdv, komisyon: yeni.komisyon,
        ciro: yeni.ciro, vakif: yeni.vakif, sgk: yeni.sgk, acikHesap: yeni.acikHesap,
        aciklama: `Ay açılış devri — Excel ${tarihStr} kapanışıyla eşitleme (script)`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: kullanici, action: 'KASA_DUZELTME_ESITLE', entity: 'KasaDuzeltme', entityId: k.id,
        payload: { silinen: silinecek.map((s) => s.id), hedef, yeni: Object.fromEntries(Object.entries(yeni).map(([a, b]) => [a, b.toString()])) },
      },
    });
  });
  console.log(`\nUYGULANDI: ${silinecek.length} eski kayıt silindi, yeni açılış devri kaydı oluşturuldu.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
