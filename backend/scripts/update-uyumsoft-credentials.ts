/**
 * Uyumsoft web servis kimlik bilgilerini güncelle + testConnection
 * npx ts-node scripts/update-uyumsoft-credentials.ts
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import {
  clearUyumsoftClientCache,
  getCredentialsForSirket,
  testConnection,
} from '../src/modules/uyumsoft/uyumsoft.service';
import { clearDespatchClientCache, getDespatchCredentialsForSirket } from '../src/modules/efatura/uyumsoft-irsaliye.service';

const CREDENTIALS: Record<string, Record<string, string>> = {
  ng: {
    uyumsoft_username: 'NejlaGumuskesen_WebServis2',
    uyumsoft_password: '$pg1VW4o',
    uyumsoft_eirsaliye_username: 'NejlaGumuskesen_WebServis2',
    uyumsoft_eirsaliye_password: '$pg1VW4o',
  },
  adese: {
    uyumsoft_username: 'AdeseOptik_WebServis7',
    uyumsoft_password: 'ck#K8x$0',
    uyumsoft_eirsaliye_username: 'AdeseOptik_WebServis7',
    uyumsoft_eirsaliye_password: 'ck#K8x$0',
  },
};

async function upsertCredentials(sirketId: string, ayarlar: Record<string, string>) {
  for (const [anahtar, deger] of Object.entries(ayarlar)) {
    await prisma.sirketAyar.upsert({
      where: { sirketId_anahtar: { sirketId, anahtar } },
      create: { sirketId, anahtar, deger },
      update: { deger },
    });
    console.log(`  upsert ${sirketId}.${anahtar}`);
  }
}

function parseTestConnectionOk(result: unknown): boolean {
  const r = result as { TestConnectionResult?: { attributes?: { IsSucceded?: boolean | string } } };
  const ok = r?.TestConnectionResult?.attributes?.IsSucceded;
  return ok === true || ok === 'true';
}

async function main() {
  console.log('=== SirketAyar güncelleme ===');
  for (const [sirketId, ayarlar] of Object.entries(CREDENTIALS)) {
    await upsertCredentials(sirketId, ayarlar);
  }

  clearUyumsoftClientCache();
  clearDespatchClientCache();

  console.log('\n=== Kimlik doğrulama (DB\'den okunan) ===');
  for (const sirketId of ['ng', 'adese'] as const) {
    const efatura = await getCredentialsForSirket(sirketId);
    const eirsaliye = await getDespatchCredentialsForSirket(sirketId);
    console.log(`${sirketId} e-Fatura user=${efatura.username}`);
    console.log(`${sirketId} e-İrsaliye user=${eirsaliye.username} kaynak=${eirsaliye.kaynak}`);
  }

  console.log('\n=== testConnection ===');
  let failed = 0;
  for (const sirketId of ['ng', 'adese'] as const) {
    try {
      const result = await testConnection(sirketId);
      const ok = parseTestConnectionOk(result);
      console.log(`${ok ? '✅' : '❌'} testConnection('${sirketId}')`, JSON.stringify(result));
      if (!ok) failed += 1;
    } catch (err) {
      console.log(`❌ testConnection('${sirketId}')`, err instanceof Error ? err.message : err);
      failed += 1;
    }
  }

  if (failed) process.exit(1);
  console.log('\nTüm testConnection çağrıları başarılı.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
