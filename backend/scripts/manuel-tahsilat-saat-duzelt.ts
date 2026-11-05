/**
 * 05.11.2026 — ManuelTahsilat kayıtları Postgres now() ile yazıldığı için 3 saat İLERİ kayıtlı
 * (TR yerel saat UTC gibi saklandı). Bu script düzeltilmemiş kayıtları 3 saat geri alır ve
 * vardiyasını gerçek saate göre yeniden bağlar. Kodu düzeltildikten SONRA girilen kayıtlara dokunmamak için
 * sadece --once tarihinden önce oluşturulanlar ele alınır.
 * VARSAYILAN KURU ÇALIŞMA. Kullanım: npx ts-node --transpile-only scripts/manuel-tahsilat-saat-duzelt.ts --once 2026-11-06T00:00 [--haric id1,id2] [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
async function main() {
  const once = d('--once'); if (!once) throw new Error('--once zorunlu (kod düzeltmesinin yüklendiği an, ör. 2026-11-05T22:30)');
  const haric = (d('--haric') ?? '').split(',').filter(Boolean);
  const UYGULA = argv.includes('--uygula');
  const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "ManuelTahsilat" WHERE "createdAt" < ${new Date(once + '+03:00')} ORDER BY "createdAt"`;
  const subeler = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  let n = 0;
  for (const r of rows) {
    if (haric.includes(r.id)) { console.log(`  atlandı (hariç) ${r.customerAdi}`); continue; }
    const yeni = new Date(+new Date(r.createdAt) - 3 * 3600_000);
    const v = await prisma.shift.findFirst({ where: { branchId: r.branchId, openedAt: { lte: yeni }, OR: [{ closedAt: null }, { closedAt: { gte: yeni } }] }, orderBy: { openedAt: 'desc' } });
    const gunDegisti = z(r.createdAt).slice(0, 10) !== z(yeni).slice(0, 10);
    console.log(`  ${subeler.get(r.branchId)} ${r.customerAdi} ${r.tutar} ${r.odemeTuru}: ${z(r.createdAt)} → ${z(yeni)}${gunDegisti ? '  ⚠️ GÜN DEĞİŞİYOR (rapor günü düzelir)' : ''} | vardiya ${v ? 'bulundu' : 'YOK'} [${r.id}]`);
    if (UYGULA) { await prisma.$executeRaw`UPDATE "ManuelTahsilat" SET "createdAt" = ${yeni}, "shiftId" = ${v?.id ?? r.shiftId} WHERE "id" = ${r.id}`; n++; }
  }
  console.log(UYGULA ? `✓ ${n} kayıt düzeltildi` : `\nKURU ÇALIŞMA — ${rows.length} kayıt. Uygulamak için --uygula.`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
