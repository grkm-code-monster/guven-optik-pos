/**
 * ACIL teşhis: GVNS-20260721-GVN2-00001 satış + bağlı transfer e-Fatura/e-İrsaliye durumu
 */
import { prisma } from '../src/database/prisma';

const REF = 'GVNS-20260721-GVN2-00001';

async function main() {
  console.log('=== SATIŞ ARAMA ===');
  const sales = await prisma.sale.findMany({
    where: {
      OR: [
        { referansNo: REF },
        { referansNo: { contains: '20260721' } },
      ],
    },
    include: {
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const branchCache = new Map<string, { code: string; name: string }>();
  async function getBranch(branchId: string) {
    if (!branchCache.has(branchId)) {
      const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true, name: true } });
      if (b) branchCache.set(branchId, b);
    }
    return branchCache.get(branchId);
  }

  for (const s of sales) {
    const branch = await getBranch(s.branchId);
    console.log('\n--- Sale ---');
    console.log('id:', s.id);
    console.log('referansNo:', s.referansNo);
    console.log('musteri:', s.customer?.name);
    console.log('sube:', branch?.code);
    console.log('createdAt:', s.createdAt);
    console.log('eFaturaDurum:', s.eFaturaDurum);
    console.log('eFaturaId:', s.eFaturaId);

    const kuyruk = await prisma.faturaKuyruk.findMany({
      where: { satisId: s.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log('\n--- faturaKuyruk (son 5) ---');
    for (const k of kuyruk) {
      console.log(JSON.stringify({
        id: k.id,
        createdAt: k.createdAt,
        deneme: k.deneme,
        faturaNo: k.faturaNo,
        hata: k.hata,
      }, null, 2));
    }

    const faturalar = await prisma.fatura.findMany({
      where: { satisId: s.id },
      orderBy: { createdAt: 'desc' },
    });
    console.log('\n--- fatura ---');
    for (const f of faturalar) {
      console.log(JSON.stringify({
        id: f.id,
        faturaNo: f.faturaNo,
        uuid: f.uuid,
        durum: f.durum,
        hata: f.hata,
        createdAt: f.createdAt,
      }, null, 2));
    }

    const transfers = await prisma.transferAksiyonLog.findMany({
      where: {
        OR: [
          { mesaj: { contains: s.id } },
          { transferRef: { contains: s.referansNo ?? '' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log('\n--- transfer aksiyon log (sale ile ilişkili) ---');
    for (const t of transfers) {
      console.log(JSON.stringify(t));
    }
  }

  // Yaprak Gezer + bugün
  console.log('\n=== YAPRAK GEZER SATIŞLAR (21.07.2026) ===');
  const yaprak = await prisma.sale.findMany({
    where: {
      customer: { name: { contains: 'Yaprak', mode: 'insensitive' } },
      createdAt: {
        gte: new Date('2026-07-21T00:00:00+03:00'),
        lt: new Date('2026-07-22T00:00:00+03:00'),
      },
    },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const s of yaprak) {
    const branch = await getBranch(s.branchId);
    console.log(s.referansNo, s.id, s.createdAt, s.eFaturaDurum, branch?.code);
  }

  console.log('\n=== TRANSFER AKSİYON LOG (bugün GVN2) ===');
  const logs = await prisma.transferAksiyonLog.findMany({
    where: {
      createdAt: { gte: new Date('2026-07-21T00:00:00+03:00') },
      OR: [
        { transferRef: { contains: 'INT2' } },
        { transferRef: { contains: '1784639534663' } },
        { mesaj: { contains: 'irsaliye', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const l of logs) {
    console.log(JSON.stringify({
      transferRef: l.transferRef,
      aksiyon: l.aksiyon,
      durum: l.durum,
      mesaj: l.mesaj,
      createdAt: l.createdAt,
    }));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
