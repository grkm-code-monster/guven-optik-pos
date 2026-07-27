/**
 * Deploy endpoint — yetki ve eşzamanlılık testi (DEPLOY_DRY_RUN=1, gerçek shell komutu yok).
 * Calistirma: cd backend && DEPLOY_DRY_RUN=1 npx tsx scripts/test-deploy-endpoint.ts
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import {
  getDeployStepDefinitions,
  isDeployInProgress,
  readDeployStatus,
  tryStartDeploy,
} from '../src/modules/admin/deploy.service';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

async function getToken(role: Role): Promise<string> {
  const user = await prisma.user.findFirst({ where: { role, isActive: true } });
  if (!user) throw new Error(`${role} kullanicisi bulunamadi`);
  return jwt.sign(
    { userId: user.id, role: user.role, branchId: user.branchId },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function main() {
  process.env.DEPLOY_DRY_RUN = '1';

  console.log('=== Deploy adimlari (sabit komutlar) ===');
  for (const s of getDeployStepDefinitions()) {
    console.log(`  ${s.id}: ${s.command}`);
  }

  const adminToken = await getToken(Role.ADMIN);
  const staffToken = await getToken(Role.SALES_STAFF);

  const base = process.env.TEST_API_BASE ?? 'http://localhost:3000/api';

  const adminStatus = await fetch(`${base}/admin/deploy/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (adminStatus.status !== 200) {
    throw new Error(`ADMIN status beklenen 200, gelen ${adminStatus.status}`);
  }
  console.log('ADMIN GET /status: OK');

  const forbidden = await fetch(`${base}/admin/deploy/status`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  if (forbidden.status !== 403) {
    throw new Error(`SALES_STAFF status beklenen 403, gelen ${forbidden.status}`);
  }
  console.log('SALES_STAFF GET /status: 403 OK');

  const start1 = await fetch(`${base}/admin/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body1 = (await start1.json()) as { started?: boolean };
  if (start1.status !== 200 || !body1.started) {
    throw new Error(`Ilk POST deploy basarisiz: ${start1.status}`);
  }
  console.log('ADMIN POST /deploy (1): started OK');

  await new Promise((r) => setTimeout(r, 50));

  const start2 = await fetch(`${base}/admin/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (start2.status !== 409) {
    throw new Error(`Esan deploy beklenen 409, gelen ${start2.status}`);
  }
  console.log('ADMIN POST /deploy (2): 409 OK');

  while (isDeployInProgress()) {
    await new Promise((r) => setTimeout(r, 100));
  }

  const final = readDeployStatus();
  if (final.status !== 'success') {
    throw new Error(`Dry-run deploy status beklenen success, gelen ${final.status}`);
  }
  console.log('Dry-run deploy tamamlandi: success');

  const postForbidden = await fetch(`${base}/admin/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  if (postForbidden.status !== 403) {
    throw new Error(`SALES_STAFF POST beklenen 403, gelen ${postForbidden.status}`);
  }
  console.log('SALES_STAFF POST /deploy: 403 OK');

  console.log('\nTum kontroller gecti.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
