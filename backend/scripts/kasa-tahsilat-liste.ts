/**
 * 05.11.2026 — SADECE OKUR. Bir günün vardiyalarında tahsil edilen geçmiş açık hesap ödemeleri,
 * manuel (kağıt üstü) tahsilatlar ve ciro düzeltmelerini banka/taksit/komisyon bilgisiyle listeler.
 * Kart tahsilatında banka/taksit eksikse "EKSİK" yazar (manuel-tahsilat-kart-bilgisi.ts ile doldurulur).
 *
 * Kullanım:
 *   npx ts-node --transpile-only scripts/kasa-tahsilat-liste.ts --tarih 2026-11-04 [--sube GVN2]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const tl = (x: unknown) => Number(x ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const tarih = d('--tarih');
  if (!tarih) throw new Error('--tarih zorunlu (YYYY-AA-GG)');
  const subeKodu = d('--sube');
  const gunBas = new Date(`${tarih}T00:00:00+03:00`), gunSon = new Date(`${tarih}T23:59:59+03:00`);
  const subeler = await prisma.branch.findMany({ where: subeKodu ? { code: subeKodu } : {}, select: { id: true, code: true, name: true } });
  const bankalar = new Map((await prisma.bank.findMany({ select: { id: true, name: true } })).map((b) => [b.id, b.name]));

  for (const sube of subeler) {
    const vardiyalar = await prisma.shift.findMany({ where: { branchId: sube.id, openedAt: { gte: gunBas, lte: gunSon } }, orderBy: { openedAt: 'asc' } });
    for (const v of vardiyalar) {
      const aralik = { gte: v.openedAt, ...(v.closedAt ? { lte: v.closedAt } : {}) };
      const acik = await prisma.payment.findMany({
        where: { paymentType: { in: ['CASH', 'CARD', 'TRANSFER'] }, createdAt: aralik, sale: { branchId: sube.id, status: 'PAID', shiftId: { not: v.id } } },
        include: { sale: { select: { createdAt: true, customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      });
      const manuel = await prisma.$queryRaw<any[]>`
        SELECT * FROM "ManuelTahsilat" WHERE "branchId" = ${sube.id} AND "createdAt" >= ${v.openedAt}
        ORDER BY "createdAt" ASC`;
      const manuelFiltre = manuel.filter((m) => !v.closedAt || new Date(m.createdAt) <= v.closedAt);
      const ciro = await prisma.payment.findMany({
        where: { paymentType: 'CIRO_DUZELTME' as any, createdAt: aralik, sale: { branchId: sube.id, status: 'PAID' } },
        include: { sale: { select: { createdAt: true, customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!acik.length && !manuelFiltre.length && !ciro.length) continue;
      console.log(`\n=== ${sube.code} · vardiya ${z(v.openedAt)} → ${z(v.closedAt)} (${v.status}) ===`);
      for (const p of acik) {
        const kart = p.paymentType === 'CARD' ? ` · ${p.bankId ? bankalar.get(p.bankId) : 'BANKA EKSİK'} · ${p.installment ?? '?'} taksit · kom ${tl(p.commissionAmount)}` : '';
        console.log(`  🟡 AÇIK HESAP  ${p.sale.customer?.name} (satış ${z(p.sale.createdAt).slice(0, 10)}) · ${p.paymentType} ${tl(p.grossAmount)}${kart} · id ${p.id}`);
      }
      for (const m of manuelFiltre) {
        const kart = m.odemeTuru === 'CARD'
          ? (m.bankId ? ` · ${bankalar.get(m.bankId)} · ${m.installment} taksit · kom ${tl(m.commissionAmount)}` : ' · ⚠️ BANKA/TAKSİT EKSİK (komisyon hesaplanmadı)')
          : '';
        console.log(`  🟢 MANUEL      ${m.customerAdi} · ${m.odemeTuru} ${tl(m.tutar)}${kart} · "${m.aciklama ?? ''}" · ${z(m.createdAt)} · id ${m.id}`);
      }
      for (const c of ciro) {
        console.log(`  🟣 CİRO DÜZ.   ${c.sale.customer?.name} (satış ${z(c.sale.createdAt).slice(0, 10)}) · −${tl(c.grossAmount)} · "${c.aciklama ?? ''}" · ${z(c.createdAt)} · id ${c.id}`);
      }
    }
  }
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
