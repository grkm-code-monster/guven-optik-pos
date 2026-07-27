/**
 * Adım 2 — ek yetki backend enforcement doğrulama
 * npx tsx backend/scripts/test-ek-yetki-adim2.ts
 */
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Role } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { createApp } from '../src/app';
import { login } from '../src/modules/auth/auth.service';
import { EK_YETKI } from '../src/modules/admin/ek-yetki';
import type { JwtPayload } from '../src/modules/auth/auth.types';

function signTestToken(user: {
  id: string;
  role: Role;
  branchId: string;
  canWorkAtolye?: boolean;
  ekYetkiler: string[];
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET yok');
  const payload: JwtPayload = {
    userId: user.id,
    role: user.role,
    branchId: user.branchId,
    shiftId: null,
    canWorkAtolye: user.canWorkAtolye ?? false,
    ekYetkiler: user.ekYetkiler,
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

async function adminStatus(base: string, path: string, token: string): Promise<number> {
  const res = await axios.get(`${base}/api/admin${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 15000,
  });
  return res.status;
}

async function main() {
  const salesStaff = await prisma.user.findMany({
    where: { role: Role.SALES_STAFF, isActive: true },
    take: 2,
    orderBy: { username: 'asc' },
  });
  if (salesStaff.length < 1) throw new Error('SALES_STAFF kullanıcı bulunamadı');

  const withEk = salesStaff[0];
  const withoutEk = salesStaff[1] ?? salesStaff[0];

  const prevWith = [...(withEk.ekYetkiler ?? [])];
  const prevWithout = [...(withoutEk.ekYetkiler ?? [])];

  await prisma.user.update({
    where: { id: withEk.id },
    data: { ekYetkiler: [EK_YETKI.DEPO_SIPARIS] },
  });
  await prisma.user.update({
    where: { id: withoutEk.id },
    data: { ekYetkiler: [] },
  });

  const app = createApp();
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Port alınamadı');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    const tokenEk = signTestToken({
      id: withEk.id,
      role: withEk.role,
      branchId: withEk.branchId,
      ekYetkiler: [EK_YETKI.DEPO_SIPARIS],
    });
    const tokenPlain = signTestToken({
      id: withoutEk.id,
      role: withoutEk.role,
      branchId: withoutEk.branchId,
      ekYetkiler: [],
    });

    const tests: Array<{ label: string; path: string; token: string; expect: number }> = [
      {
        label: 'DEPO_SIPARIS → ozel-siparisler',
        path: '/ozel-siparisler',
        token: tokenEk,
        expect: 200,
      },
      {
        label: 'DEPO_SIPARIS → muhasebe-dashboard (403)',
        path: '/muhasebe-dashboard',
        token: tokenEk,
        expect: 403,
      },
      {
        label: 'DEPO_SIPARIS → finans-ozet (403)',
        path: '/finans-ozet',
        token: tokenEk,
        expect: 403,
      },
      {
        label: 'DEPO_SIPARIS → transfer-urun-ara (403, sadece sipariş yetkisi)',
        path: '/transfer-urun-ara?q=test',
        token: tokenEk,
        expect: 403,
      },
      {
        label: 'Ek yetkisiz SALES_STAFF → muhasebe-dashboard (403)',
        path: '/muhasebe-dashboard',
        token: tokenPlain,
        expect: 403,
      },
      {
        label: 'Ek yetkisiz SALES_STAFF → banks (403)',
        path: '/banks',
        token: tokenPlain,
        expect: 403,
      },
    ];

    console.log('=== Ek Yetki Adım 2 Backend Testi ===\n');
    let failed = 0;
    for (const t of tests) {
      const status = await adminStatus(base, t.path, t.token);
      const ok = status === t.expect;
      console.log(`${ok ? '✅' : '❌'} ${t.label}: HTTP ${status} (beklenen ${t.expect})`);
      if (!ok) failed += 1;
    }

    // JWT login yolu — ekYetkiler response'ta mı?
    const refreshed = await prisma.user.findUnique({ where: { id: withEk.id } });
    if (refreshed) {
      // login için bilinen pin yoksa atla
      const knownPinUser = await prisma.user.findFirst({
        where: { username: 'test_sm_gvn1', isActive: true },
      });
      if (knownPinUser) {
        await prisma.user.update({
          where: { id: knownPinUser.id },
          data: { ekYetkiler: [EK_YETKI.DEPO_SIPARIS] },
        });
        try {
          const loginRes = await login('test_sm_gvn1', '123456');
          const jwtHas =
            Array.isArray(loginRes.user.ekYetkiler) &&
            loginRes.user.ekYetkiler.includes(EK_YETKI.DEPO_SIPARIS);
          console.log(`${jwtHas ? '✅' : '❌'} Login response ekYetkiler: ${JSON.stringify(loginRes.user.ekYetkiler)}`);
          if (!jwtHas) failed += 1;
        } catch {
          console.log('⚠ Login JWT testi atlandı (test_sm_gvn1 pin)');
        } finally {
          await prisma.user.update({
            where: { id: knownPinUser.id },
            data: { ekYetkiler: knownPinUser.ekYetkiler ?? [] },
          });
        }
      }
    }

    if (failed) {
      throw new Error(`${failed} test başarısız`);
    }
    console.log('\nTüm testler geçti.');
  } finally {
    server.close();
    await prisma.user.update({
      where: { id: withEk.id },
      data: { ekYetkiler: prevWith },
    });
    await prisma.user.update({
      where: { id: withoutEk.id },
      data: { ekYetkiler: prevWithout },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
