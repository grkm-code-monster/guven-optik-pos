/**
 * 09.11.2026 — POS kullanıcısının şubesini değiştirir (User.branchId) ve bağlı İK personel kaydını
 * (Personel.subeId/subeAdi) aynı şubeye eşitler. Satışın şubesi giriş yapan KULLANICININ şubesinden
 * geldiği için, İK'da şube değişip kullanıcı eski şubede kalırsa satışlar yanlış şubeye yazılıyordu
 * (Sude Parıldar: İK'da GVN2, kullanıcı GVN1).
 * Değişiklikten sonra personelin programdan ÇIKIŞ yapıp tekrar GİRİŞ yapması gerekir.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/kullanici-sube-degistir.ts --kullanici "sude parildar" --sube GVN2 [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');

async function main() {
  const kullanici = (d('--kullanici') ?? '').trim();
  const subeKod = (d('--sube') ?? '').trim().toUpperCase();
  if (!kullanici || !subeKod) throw new Error('--kullanici ve --sube zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const hedef = await prisma.branch.findFirst({ where: { code: subeKod } });
  if (!hedef) throw new Error(`Şube ${subeKod} bulunamadı`);
  const users = await prisma.user.findMany({
    where: { OR: [{ username: { equals: kullanici, mode: 'insensitive' } }, { name: { equals: kullanici, mode: 'insensitive' } }] },
    include: { branch: true },
  });
  if (users.length !== 1) throw new Error(`"${kullanici}" için ${users.length} kullanıcı bulundu (tam 1 olmalı)`);
  const u = users[0];
  const p = u.personelId ? await prisma.personel.findUnique({ where: { id: u.personelId } }) : await prisma.personel.findFirst({ where: { userId: u.id } });
  console.log(`Kullanıcı: ${u.name} (${u.username}) | rol ${u.role} | şu anki şube: ${u.branch.code}`);
  console.log(`İK kaydı: ${p ? `${p.ad} ${p.soyad} | şube ${p.subeId ?? '—'}` : 'bağlı personel yok'}`);
  const acik = await prisma.shift.findMany({ where: { userId: u.id, status: 'OPEN' } });
  if (acik.length) console.log(`Not: açtığı ${acik.length} açık vardiya var (eski şubenin vardiyası; gün sonunda otomatik kapanır, dokunulmuyor).`);
  if (u.branchId === hedef.id && (!p || p.subeId === hedef.code)) { console.log(`Zaten ${hedef.code} — değişiklik yok.`); return; }
  console.log(`→ Kullanıcı şubesi ${u.branch.code} → ${hedef.code}${p ? `, İK şubesi ${p.subeId ?? '—'} → ${hedef.code}` : ''}`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — uygulamak için --uygula ekleyin.'); return; }
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { branchId: hedef.id } }),
    ...(p ? [prisma.personel.update({ where: { id: p.id }, data: { subeId: hedef.code, subeAdi: hedef.name } })] : []),
  ]);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) await prisma.auditLog.create({ data: { userId: admin.id, action: 'KULLANICI_SUBE_DEGISTIR', entity: 'User', entityId: u.id, payload: { eski: u.branch.code, yeni: hedef.code, script: true } } });
  console.log(`✓ ${u.name} artık ${hedef.code}. Programdan çıkış yapıp tekrar giriş yapması gerekiyor.`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
