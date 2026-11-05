/**
 * 05.11.2026 — Eski bir MANUEL (kağıt üstü) KART tahsilatına banka / taksit (ve isteğe bağlı POS)
 * bilgisini ekler ve komisyonu, tahsilatın KENDİ tarihindeki oranla hesaplar. Tutara, tarihe,
 * vardiyaya dokunmaz — sadece bankId/posDeviceId/installment/commissionRate/commissionAmount yazılır.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/manuel-tahsilat-kart-bilgisi.ts --musteri "YELİZ KUMRAL" --tutar 10000 --banka "GARANTİ" --taksit 1 [--pos "GVN2"] [--uygula]
 *   (birden fazla kayıt eşleşirse --id <kayıt id> ile seçin; id'ler kasa-tahsilat-liste.ts çıktısında)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { manuelTahsilatKomisyonHesapla } from '../src/modules/openaccount/manuel-tahsilat.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');
const z = (x?: Date | null) => (x ? x.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function main() {
  const id = d('--id'), musteri = d('--musteri'), tutar = Number(d('--tutar')), bankaAdi = d('--banka'), taksit = Number(d('--taksit')), posAdi = d('--pos');
  if (!bankaAdi || !taksit) throw new Error('--banka ve --taksit zorunlu');
  if (!id && (!musteri || !tutar)) throw new Error('--id ya da (--musteri ve --tutar) zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');

  const rows = id
    ? await prisma.$queryRaw<any[]>`SELECT * FROM "ManuelTahsilat" WHERE "id" = ${id}`
    : await prisma.$queryRaw<any[]>`SELECT * FROM "ManuelTahsilat" WHERE "customerAdi" ILIKE ${'%' + musteri + '%'} AND "tutar" = ${tutar} AND "odemeTuru" = 'CARD' ORDER BY "createdAt" DESC`;
  if (rows.length !== 1) {
    console.log(`${rows.length} kart tahsilatı bulundu (tam 1 olmalı; --id ile seçin):`);
    for (const r of rows) console.log(`  ${r.id} ${r.customerAdi} ${r.tutar} ${r.odemeTuru} ${z(r.createdAt)} "${r.aciklama ?? ''}"`);
    return;
  }
  const t = rows[0];
  if (t.odemeTuru !== 'CARD') { console.log(`⚠️ DURDU: bu tahsilat kart değil (${t.odemeTuru}).`); return; }

  const bankalar = await prisma.bank.findMany({ where: { name: { contains: bankaAdi, mode: 'insensitive' } }, select: { id: true, name: true } });
  if (bankalar.length !== 1) {
    const tum = await prisma.bank.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    console.log(`⚠️ DURDU: "${bankaAdi}" ile ${bankalar.length} banka eşleşti. Bankalar: ${tum.map((b) => b.name).join(', ')}`);
    return;
  }
  const banka = bankalar[0];
  let posId: string | null = null;
  if (posAdi) {
    const poslar = await prisma.posDevice.findMany({ where: { bankId: banka.id, name: { contains: posAdi, mode: 'insensitive' } }, select: { id: true, name: true } });
    if (poslar.length !== 1) { console.log(`⚠️ DURDU: "${posAdi}" ile ${poslar.length} POS eşleşti (${banka.name}).`); return; }
    posId = poslar[0].id;
  }

  const k = await manuelTahsilatKomisyonHesapla(Number(t.tutar), banka.id, posId, taksit, new Date(t.createdAt));
  console.log(`\nTAHSİLAT ${t.customerAdi} | ${t.tutar} TL | ${z(t.createdAt)} | "${t.aciklama ?? ''}"`);
  console.log(`  banka: ${t.bankId ? 'VAR (üzerine yazılacak)' : 'yok'} → ${banka.name}${posId ? ' / POS ' + posAdi : ''} · ${taksit} taksit`);
  console.log(`  komisyon oranı ${(Number(k.commissionRate) * 100).toFixed(2)}% → komisyon ${k.commissionAmount} TL`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }
  await prisma.$executeRaw`
    UPDATE "ManuelTahsilat"
    SET "bankId" = ${k.bankId}, "posDeviceId" = ${k.posDeviceId}, "installment" = ${k.installment},
        "commissionRate" = ${Number(k.commissionRate)}, "commissionAmount" = ${Number(k.commissionAmount)}
    WHERE "id" = ${t.id}`;
  await prisma.auditLog.create({
    data: { userId: t.userId, action: 'MANUEL_TAHSILAT_KART_BILGISI', entity: 'ManuelTahsilat', entityId: t.id, payload: { banka: banka.name, taksit, komisyon: k.commissionAmount, script: true } },
  });
  console.log('✓ Kart bilgisi ve komisyon yazıldı');
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
