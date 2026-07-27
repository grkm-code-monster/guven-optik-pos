/**
 * Personel ↔ User odooEmployeeId uyuşmazlık raporu ve tek seferlik düzeltme.
 * Çelişkili kayıtlar (iki farklı dolu ID) otomatik düzeltilmez.
 *
 * npx tsx backend/scripts/personel-odoo-sync-backfill.ts
 * npx tsx backend/scripts/personel-odoo-sync-backfill.ts --dry-run
 */
import { prisma } from '../src/database/prisma';

const dryRun = process.argv.includes('--dry-run');

type LinkedPair = {
  personelId: string;
  personelAd: string;
  userId: string;
  userName: string;
  personelOdoo: number | null;
  userOdoo: number | null;
};

async function collectLinkedPairs(): Promise<LinkedPair[]> {
  const personeller = await prisma.personel.findMany({
    where: { userId: { not: null } },
    select: {
      id: true,
      ad: true,
      soyad: true,
      userId: true,
      odooEmployeeId: true,
      user: { select: { id: true, name: true, odooEmployeeId: true, personelId: true } },
    },
  });

  const seen = new Set<string>();
  const pairs: LinkedPair[] = [];

  for (const p of personeller) {
    if (!p.userId || !p.user) continue;
    const key = `${p.id}:${p.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      personelId: p.id,
      personelAd: `${p.ad} ${p.soyad}`,
      userId: p.userId,
      userName: p.user.name,
      personelOdoo: p.odooEmployeeId,
      userOdoo: p.user.odooEmployeeId,
    });
  }

  const usersWithPersonel = await prisma.user.findMany({
    where: { personelId: { not: null } },
    select: {
      id: true,
      name: true,
      odooEmployeeId: true,
      personelId: true,
      personel: { select: { id: true, ad: true, soyad: true, odooEmployeeId: true, userId: true } },
    },
  });

  for (const u of usersWithPersonel) {
    if (!u.personelId || !u.personel) continue;
    const key = `${u.personelId}:${u.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      personelId: u.personel.id,
      personelAd: `${u.personel.ad} ${u.personel.soyad}`,
      userId: u.id,
      userName: u.name,
      personelOdoo: u.personel.odooEmployeeId,
      userOdoo: u.odooEmployeeId,
    });
  }

  return pairs;
}

async function main() {
  const pairs = await collectLinkedPairs();

  const synced: LinkedPair[] = [];
  const oneSideEmpty: LinkedPair[] = [];
  const conflicts: LinkedPair[] = [];

  for (const pair of pairs) {
    const { personelOdoo, userOdoo } = pair;
    if (personelOdoo == null && userOdoo == null) {
      synced.push(pair);
      continue;
    }
    if (personelOdoo != null && userOdoo != null && personelOdoo === userOdoo) {
      synced.push(pair);
      continue;
    }
    if (personelOdoo != null && userOdoo != null && personelOdoo !== userOdoo) {
      conflicts.push(pair);
      continue;
    }
    oneSideEmpty.push(pair);
  }

  const fixed: Array<{ pair: LinkedPair; action: string }> = [];

  for (const pair of oneSideEmpty) {
    const source = pair.personelOdoo != null ? 'personel' : 'user';
    const value = pair.personelOdoo ?? pair.userOdoo!;
    const action =
      source === 'personel'
        ? `User.odooEmployeeId ← ${value} (Personel kaynağı)`
        : `Personel.odooEmployeeId ← ${value} (User kaynağı)`;

    if (!dryRun) {
      await prisma.$transaction([
        prisma.personel.update({
          where: { id: pair.personelId },
          data: { odooEmployeeId: value },
        }),
        prisma.user.update({
          where: { id: pair.userId },
          data: { odooEmployeeId: value },
        }),
      ]);
    }
    fixed.push({ pair, action });
  }

  console.log('\n=== Personel ↔ User odooEmployeeId Senkron Raporu ===\n');
  console.log(`Mod: ${dryRun ? 'DRY-RUN (değişiklik yok)' : 'UYGULA'}`);
  console.log(`Bağlı çift sayısı: ${pairs.length}`);
  console.log(`Zaten uyumlu: ${synced.length}`);
  console.log(`Tek taraflı dolu (düzeltildi${dryRun ? ' — dry-run' : ''}): ${oneSideEmpty.length}`);
  console.log(`Çelişkili (iki farklı ID — düzeltilmedi): ${conflicts.length}`);

  if (fixed.length) {
    console.log('\n--- Düzeltilen / düzeltilecek kayıtlar ---');
    for (const { pair, action } of fixed) {
      console.log(
        `  ${pair.personelAd} (${pair.userName}) | Personel=${pair.personelOdoo ?? '∅'} User=${pair.userOdoo ?? '∅'} → ${action}`,
      );
    }
  }

  if (conflicts.length) {
    console.log('\n--- Çelişkili kayıtlar (manuel onay gerekir) ---');
    for (const c of conflicts) {
      console.log(
        `  ${c.personelAd} (${c.userName}) | Personel.odooEmployeeId=${c.personelOdoo} User.odooEmployeeId=${c.userOdoo}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
