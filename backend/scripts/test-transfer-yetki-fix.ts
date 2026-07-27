/**
 * transfer-olustur / prefix() düzeltme doğrulama
 * npx ts-node scripts/test-transfer-yetki-fix.ts
 */
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Role } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { createApp } from '../src/app';
import { EK_YETKI, POS_ROLES, resolveAdminRouteAccess } from '../src/modules/admin/ek-yetki';
import type { JwtPayload } from '../src/modules/auth/auth.types';

function signToken(user: {
  id: string;
  role: Role;
  branchId: string;
  ekYetkiler: string[];
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET yok');
  const payload: JwtPayload = {
    userId: user.id,
    role: user.role,
    branchId: user.branchId,
    shiftId: null,
    canWorkAtolye: false,
    ekYetkiler: user.ekYetkiler,
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

async function request(
  base: string,
  method: 'GET' | 'POST',
  path: string,
  token: string,
): Promise<number> {
  const res = await axios({
    method,
    url: `${base}/api/admin${path}`,
    headers: { Authorization: `Bearer ${token}` },
    data: method === 'POST' ? {} : undefined,
    validateStatus: () => true,
    timeout: 15000,
  });
  return res.status;
}

function assertRouteRule(path: string, expectStoreManager: boolean): boolean {
  const { roles } = resolveAdminRouteAccess(path);
  const ok = roles.includes(Role.STORE_MANAGER) === expectStoreManager;
  console.log(
    `${ok ? '✅' : '❌'} resolveAdminRouteAccess('${path}') STORE_MANAGER=${roles.includes(Role.STORE_MANAGER)}`,
  );
  return ok;
}

async function main() {
  console.log('=== Route kural eşleşmesi (unit) ===');
  let failed = 0;
  for (const p of ['/transfer-olustur', '/transfer-kabul', '/transfer-urun-ara?q=x']) {
    if (!assertRouteRule(p.split('?')[0], true)) failed += 1;
  }
  for (const p of ['/cari-ara', '/nitelik-listesi']) {
    const { roles, yetkiler } = resolveAdminRouteAccess(p);
    const ok = yetkiler.includes(EK_YETKI.DEPO_URUN_GIRIS) && roles.includes(Role.ADMIN);
    console.log(`${ok ? '✅' : '❌'} resolveAdminRouteAccess('${p}') DEPO_URUN_GIRIS kuralı`);
    if (!ok) failed += 1;
  }
  if (!assertRouteRule('/banks', false)) failed += 1;

  const storeManager = await prisma.user.findFirst({
    where: { role: Role.STORE_MANAGER, isActive: true },
  });
  const salesStaff = await prisma.user.findFirst({
    where: { role: Role.SALES_STAFF, isActive: true },
  });
  if (!storeManager || !salesStaff) throw new Error('Test kullanıcıları bulunamadı');

  const app = createApp();
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Port alınamadı');
  const base = `http://127.0.0.1:${addr.port}`;

  const smToken = signToken({
    id: storeManager.id,
    role: Role.STORE_MANAGER,
    branchId: storeManager.branchId,
    ekYetkiler: storeManager.ekYetkiler ?? [],
  });
  const staffToken = signToken({
    id: salesStaff.id,
    role: Role.SALES_STAFF,
    branchId: salesStaff.branchId,
    ekYetkiler: [],
  });
  const staffDepoToken = signToken({
    id: salesStaff.id,
    role: Role.SALES_STAFF,
    branchId: salesStaff.branchId,
    ekYetkiler: [EK_YETKI.DEPO_URUN_GIRIS],
  });

  try {
    console.log('\n=== HTTP — STORE_MANAGER (POS_ROLES) ===');
    const smTransferPost = await request(base, 'POST', '/transfer-olustur', smToken);
    const smTransferOk = smTransferPost !== 403;
    console.log(
      `${smTransferOk ? '✅' : '❌'} POST /transfer-olustur: HTTP ${smTransferPost} (403 olmamalı)`,
    );
    if (!smTransferOk) failed += 1;

    const smKabul = await request(base, 'GET', '/transfer-kabul', smToken);
    console.log(`${smKabul !== 403 ? '✅' : '❌'} GET /transfer-kabul: HTTP ${smKabul}`);
    if (smKabul === 403) failed += 1;

    const smAra = await request(base, 'GET', '/transfer-urun-ara?q=test', smToken);
    console.log(`${smAra !== 403 ? '✅' : '❌'} GET /transfer-urun-ara: HTTP ${smAra}`);
    if (smAra === 403) failed += 1;

    console.log('\n=== HTTP — SALES_STAFF + DEPO_URUN_GIRIS ===');
    const cari = await request(base, 'GET', '/cari-ara?q=test', staffDepoToken);
    console.log(`${cari !== 403 ? '✅' : '❌'} GET /cari-ara: HTTP ${cari}`);
    if (cari === 403) failed += 1;

    const nitelik = await request(base, 'GET', '/nitelik-listesi', staffDepoToken);
    console.log(`${nitelik !== 403 ? '✅' : '❌'} GET /nitelik-listesi: HTTP ${nitelik}`);
    if (nitelik === 403) failed += 1;

    console.log('\n=== HTTP — Regresyon ===');
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } });
    if (adminUser) {
      const adminToken = signToken({
        id: adminUser.id,
        role: Role.ADMIN,
        branchId: adminUser.branchId,
        ekYetkiler: [],
      });
      const adminBanks = await request(base, 'GET', '/banks', adminToken);
      console.log(`${adminBanks === 200 ? '✅' : '❌'} ADMIN GET /banks: HTTP ${adminBanks}`);
      if (adminBanks !== 200) failed += 1;
    }

    const accountant = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true },
    });
    if (accountant) {
      const accToken = signToken({
        id: accountant.id,
        role: Role.ACCOUNTANT,
        branchId: accountant.branchId,
        ekYetkiler: [],
      });
      const accTransfer = await request(base, 'POST', '/transfer-olustur', accToken);
      const accBlocked = accTransfer === 403;
      console.log(
        `${accBlocked ? '✅' : '❌'} ACCOUNTANT POST /transfer-olustur: HTTP ${accTransfer} (403 beklenir)`,
      );
      if (!accBlocked) failed += 1;
    } else {
      const staffBanks = await request(base, 'GET', '/banks', staffToken);
      const staffBlocked = staffBanks === 403;
      console.log(
        `${staffBlocked ? '✅' : '❌'} SALES_STAFF GET /banks: HTTP ${staffBanks} (403 beklenir)`,
      );
      if (!staffBlocked) failed += 1;
    }

    console.log(`\nPOS_ROLES: ${POS_ROLES.join(', ')}`);

    if (failed) {
      throw new Error(`${failed} test başarısız`);
    }
    console.log('\nTüm testler geçti.');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
