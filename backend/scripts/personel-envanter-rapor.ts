/**
 * Adım 1 — Personel envanter raporu (READ-ONLY, veri değiştirmez)
 * npx tsx backend/scripts/personel-envanter-rapor.ts
 */
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';

function isLikelyTestOrAdmin(u: {
  name: string;
  username: string;
  role: string;
  branchCode: string | null;
}): boolean {
  const un = u.username.toLowerCase();
  const nm = u.name.toLowerCase();
  if (u.role === 'ADMIN') return true;
  if (u.branchCode === 'YONETIM') return true;
  if (/^(admin|test|demo|dev)/.test(un)) return true;
  if (/test|demo|admin/.test(nm)) return true;
  return false;
}

function splitName(full: string): { ad: string; soyad: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { ad: parts[0] ?? full, soyad: '' };
  return { ad: parts.slice(0, -1).join(' '), soyad: parts[parts.length - 1] };
}

async function main() {
  console.log('=== ADIM 1: Personel Envanter Raporu (READ-ONLY) ===\n');
  console.log(`Rapor zamanı: ${new Date().toISOString()}\n`);

  // ── 1) Personel tablosu istatistikleri ──
  const [toplamPersonel, userIdDolu, odooDolu, subeIdDolu, subeAdiDolu, aktifPersonel] =
    await Promise.all([
      prisma.personel.count(),
      prisma.personel.count({ where: { userId: { not: null } } }),
      prisma.personel.count({ where: { odooEmployeeId: { not: null } } }),
      prisma.personel.count({ where: { subeId: { not: null } } }),
      prisma.personel.count({ where: { subeAdi: { not: null } } }),
      prisma.personel.count({ where: { aktif: true } }),
    ]);

  const personelLinkedViaUserPersonelId = await prisma.user.count({
    where: { personelId: { not: null } },
  });

  console.log('── 1) Personel tablosu ──');
  console.log(`Toplam Personel kaydı:        ${toplamPersonel} (aktif: ${aktifPersonel})`);
  console.log(`userId dolu:                  ${userIdDolu}`);
  console.log(`odooEmployeeId dolu:          ${odooDolu}`);
  console.log(`subeId dolu:                  ${subeIdDolu}`);
  console.log(`subeAdi dolu:                 ${subeAdiDolu}`);
  console.log(`User.personelId ile bağlı:    ${personelLinkedViaUserPersonelId} (çift yönlü bağ kontrolü için)`);
  console.log('');

  // ── 2) Yetim POS User kayıtları ──
  const activeUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      branchId: true,
      personelId: true,
      odooEmployeeId: true,
      branch: { select: { code: true, name: true } },
    },
    orderBy: [{ branch: { code: 'asc' } }, { name: 'asc' }],
  });

  const personelByUserId = await prisma.personel.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true },
  });
  const personelUserIdSet = new Set(personelByUserId.map((p) => p.userId!));

  const orphanUsers = activeUsers.filter(
    (u) => !u.personelId && !personelUserIdSet.has(u.id),
  );

  const orphanNormal = orphanUsers.filter(
    (u) => !isLikelyTestOrAdmin({ ...u, branchCode: u.branch.code }),
  );
  const orphanTestAdmin = orphanUsers.filter(
    (u) => isLikelyTestOrAdmin({ ...u, branchCode: u.branch.code }),
  );

  console.log('── 2) Aktif POS User vs Personel ──');
  console.log(`Toplam aktif User:            ${activeUsers.length}`);
  console.log(`Yetim POS hesabı (Personel yok): ${orphanUsers.length}`);
  console.log(`  → muhtemel test/admin:      ${orphanTestAdmin.length}`);
  console.log(`  → gerçek personel adayı:   ${orphanNormal.length}`);
  console.log('');

  if (orphanUsers.length) {
    console.log('| isim | username | rol | şube | odooEmpId | test/admin? |');
    console.log('|------|----------|-----|------|-----------|-------------|');
    for (const u of orphanUsers) {
      const tag = isLikelyTestOrAdmin({ ...u, branchCode: u.branch.code }) ? 'EVET' : 'hayır';
      console.log(
        `| ${u.name} | ${u.username} | ${u.role} | ${u.branch.code} | ${u.odooEmployeeId ?? '—'} | ${tag} |`,
      );
    }
    console.log('');
  }

  // ── 3) GVN7 / GVN8 aktif User ──
  const gvnBranches = await prisma.branch.findMany({
    where: { code: { in: ['GVN7', 'GVN8', 'GVN6'] } },
    select: { id: true, code: true, name: true },
  });
  const gvnBranchMap = new Map(gvnBranches.map((b) => [b.code, b]));

  console.log('── 3) GVN6 / GVN7 / GVN8 aktif POS kullanıcıları ──');
  for (const code of ['GVN6', 'GVN7', 'GVN8'] as const) {
    const branch = gvnBranchMap.get(code);
    if (!branch) {
      console.log(`${code}: Branch kaydı bulunamadı`);
      continue;
    }
    const users = activeUsers.filter((u) => u.branchId === branch.id);
    console.log(`\n${code} (${branch.name}): ${users.length} aktif User`);
    if (!users.length) {
      console.log('  (aktif POS kullanıcısı yok)');
      continue;
    }
    for (const u of users) {
      const hasPersonel = !!(u.personelId || personelUserIdSet.has(u.id));
      const personel = hasPersonel
        ? await prisma.personel.findFirst({
            where: { OR: [{ userId: u.id }, { id: u.personelId ?? undefined }] },
            select: { id: true, subeId: true, subeAdi: true, pdksId: true },
          })
        : null;
      console.log(
        `  • ${u.name} (@${u.username}, ${u.role}) — Personel: ${hasPersonel ? 'VAR' : 'YOK'}${personel ? ` | subeAdi=${personel.subeAdi ?? '—'} pdksId=${personel.pdksId ?? '—'}` : ''}`,
      );
    }
  }
  console.log('');

  // ── 4) Odoo hr.employee vs Personel.odooEmployeeId ──
  console.log('── 4) Odoo hr.employee vs Personel eşleşmesi ──');
  let odooEmployees: Array<{ id: number; name: string }> = [];
  try {
    const raw = await execute(
      'hr.employee',
      'search_read',
      [[['active', '=', true]]],
      { fields: ['id', 'name'], limit: 500 },
    );
    odooEmployees = (raw as Array<{ id: number; name: string }>).map((e) => ({
      id: Number(e.id),
      name: String(e.name),
    }));
  } catch (err) {
    console.log('Odoo sorgusu başarısız:', err instanceof Error ? err.message : err);
    console.log('(Odoo erişilemezse bu bölüm atlanır)\n');
  }

  if (odooEmployees.length) {
    const personelOdooIds = await prisma.personel.findMany({
      where: { odooEmployeeId: { not: null } },
      select: { odooEmployeeId: true, ad: true, soyad: true },
    });
    const userOdooIds = await prisma.user.findMany({
      where: { odooEmployeeId: { not: null } },
      select: { odooEmployeeId: true, name: true },
    });

    const matchedOdooIds = new Set<number>();
    for (const p of personelOdooIds) {
      if (p.odooEmployeeId != null) matchedOdooIds.add(p.odooEmployeeId);
    }
    for (const u of userOdooIds) {
      if (u.odooEmployeeId != null) matchedOdooIds.add(u.odooEmployeeId);
    }

    const orphanOdoo = odooEmployees.filter((e) => !matchedOdooIds.has(e.id));

    console.log(`Odoo aktif hr.employee:       ${odooEmployees.length}`);
    console.log(`Personel.odooEmployeeId dolu: ${personelOdooIds.length}`);
    console.log(`User.odooEmployeeId dolu:     ${userOdooIds.length}`);
    console.log(`Eşleşen benzersiz Odoo ID:    ${matchedOdooIds.size}`);
    console.log(`Yetim Odoo çalışanı:          ${orphanOdoo.length}`);
    console.log('');

    if (orphanOdoo.length) {
      console.log('Yetim Odoo çalışanları (Personel/User eşleşmesi yok):');
      for (const e of orphanOdoo.slice(0, 30)) {
        console.log(`  • id=${e.id} — ${e.name}`);
      }
      if (orphanOdoo.length > 30) {
        console.log(`  ... ve ${orphanOdoo.length - 30} kayıt daha`);
      }
      console.log('');
    }
  }

  // ── Ek: Personel şube boş ama User.branch dolu ──
  const subeBosPersonelUserDolu = await prisma.personel.findMany({
    where: {
      aktif: true,
      OR: [{ subeId: null }, { subeAdi: null }],
      userId: { not: null },
    },
    select: {
      ad: true,
      soyad: true,
      subeId: true,
      subeAdi: true,
      user: { select: { branch: { select: { code: true } } } },
    },
    take: 20,
  });

  const subeBosCount = await prisma.personel.count({
    where: {
      aktif: true,
      OR: [{ subeId: null }, { subeAdi: null }],
    },
  });

  console.log('── Ek: "Şube: —" adayı (aktif Personel, subeId veya subeAdi boş) ──');
  console.log(`Toplam: ${subeBosCount} aktif Personel`);
  console.log(`Bunların ${subeBosPersonelUserDolu.length} tanesinde userId dolu (User.branch mevcut):`);
  for (const p of subeBosPersonelUserDolu.slice(0, 15)) {
    console.log(
      `  • ${p.ad} ${p.soyad} — Personel.subeAdi=${p.subeAdi ?? '—'} | User.branch=${p.user?.branch.code ?? '—'}`,
    );
  }
  if (subeBosPersonelUserDolu.length > 15) {
    console.log(`  ... (ilk 15 gösterildi)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
