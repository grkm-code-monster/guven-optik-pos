/**
 * 09.11.2026 — Tek bir Kasa Bakiye Düzeltme kaydını siler (yanlış/gereksiz kalan devir düzeltmeleri için).
 * Silinen kaydın tüm alanları denetim kaydına (AuditLog) yazılır, gerekirse aynen geri girilebilir.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/kasa-duzeltme-sil.ts --liste [--sube GVN2]
 *   npx ts-node --transpile-only scripts/kasa-duzeltme-sil.ts --id <kasaDuzeltmeId> [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const gun = (x: Date) => x.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

async function main() {
  const kodlar = new Map((await prisma.branch.findMany()).map((b) => [b.id, b.code]));
  const satir = (k: any) =>
    `${gun(k.tarih)} ${kodlar.get(k.branchId)} | nakit ${k.nakit} kart ${k.kartBrut} kdv ${k.kdv} komisyon ${k.komisyon} ciro ${k.ciro} sgk ${k.sgk} vakıf ${k.vakif} açıkHesap ${k.acikHesap} | ${k.aciklama ?? ''} | id ${k.id}`;
  if (argv.includes('--liste')) {
    const sube = d('--sube');
    const b = sube ? await prisma.branch.findFirst({ where: { code: sube } }) : null;
    for (const k of await prisma.kasaDuzeltme.findMany({ where: b ? { branchId: b.id } : {}, orderBy: { tarih: 'asc' } })) console.log(satir(k));
    return;
  }
  const id = d('--id');
  if (!id) throw new Error('--liste ya da --id <kasaDuzeltmeId> verin');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const k = await prisma.kasaDuzeltme.findUnique({ where: { id } });
  if (!k) { console.log(`⚠️ DURDU: düzeltme kaydı bulunamadı (${id})`); return; }
  console.log(`\nSİLİNECEK: ${satir(k)}`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }
  await prisma.$transaction([
    prisma.auditLog.create({ data: { userId: k.userId, action: 'KASA_DUZELTME_SIL', entity: 'KasaDuzeltme', entityId: k.id, payload: { ...JSON.parse(JSON.stringify(k)), script: true } } }),
    prisma.kasaDuzeltme.delete({ where: { id: k.id } }),
  ]);
  console.log('✓ Düzeltme kaydı silindi (tüm alanları denetim kaydında)');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
