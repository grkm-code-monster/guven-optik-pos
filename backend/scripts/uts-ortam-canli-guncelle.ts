/**
 * Madde 1b — UtsSube ortam test→canli + canlı token doğrulama
 * npx tsx backend/scripts/uts-ortam-canli-guncelle.ts
 */
import axios from 'axios';
import { prisma } from '../src/database/prisma';

const CANLIYA_GECEN_SUBELER = ['ANADEPO', 'GVN3', 'GVN5', 'GVN6', 'GVN8', 'GVN9'] as const;

async function tokenTestCanli(token: string): Promise<{ success: boolean; mesaj: string; httpStatus?: number }> {
  try {
    const resp = await axios.post(
      'https://utsuygulama.saglik.gov.tr/UTS/rest/kurum/firmaSorgula',
      { VRG: '1' },
      { headers: { utsToken: token, 'Content-Type': 'application/json' }, timeout: 15000 },
    );
    return { success: true, mesaj: `HTTP ${resp.status} — canlı token geçerli`, httpStatus: resp.status };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const body = typeof err.response?.data === 'string'
        ? err.response.data.slice(0, 200)
        : JSON.stringify(err.response?.data ?? '').slice(0, 200);
      return {
        success: false,
        mesaj: `HTTP ${err.response?.status ?? '?'} — ${body || err.message}`,
        httpStatus: err.response?.status,
      };
    }
    return { success: false, mesaj: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log('=== Madde 1b: UTS ortam test → canli ===\n');

  const branches = await prisma.branch.findMany({
    where: { code: { in: [...CANLIYA_GECEN_SUBELER] } },
    include: { utsSube: true },
    orderBy: { code: 'asc' },
  });

  const missing = CANLIYA_GECEN_SUBELER.filter(
    (code) => !branches.some((b) => b.code.toUpperCase() === code),
  );
  if (missing.length) {
    console.warn('Branch bulunamadı:', missing.join(', '));
  }

  for (const branch of branches) {
    const uts = branch.utsSube;
    if (!uts) {
      console.log(`${branch.code}: UtsSube kaydı yok — atlandı`);
      continue;
    }

    const onceki = uts.ortam;
    await prisma.utsSube.update({
      where: { branchId: branch.id },
      data: { ortam: 'canli' },
    });

    console.log(`\n${branch.code} (${branch.name})`);
    console.log(`  ortam: ${onceki} → canli`);
    console.log(`  kurumNo: ${uts.kurumNo ?? '—'}`);
    console.log(`  token: ${uts.token ? '•••• (tanımlı)' : 'YOK'}`);

    if (!uts.token?.trim()) {
      console.log('  Token Test: ❌ token tanımlı değil');
      await prisma.utsSube.update({
        where: { branchId: branch.id },
        data: { aktif: false, sonKontrol: new Date() },
      });
      continue;
    }

    const sonuc = await tokenTestCanli(uts.token);
    await prisma.utsSube.update({
      where: { branchId: branch.id },
      data: {
        aktif: sonuc.success,
        sonKontrol: new Date(),
      },
    });
    console.log(`  Token Test (canlı): ${sonuc.success ? '✅' : '❌'} ${sonuc.mesaj}`);
  }

  console.log('\n=== Güncel durum (tüm UtsSube) ===');
  const tum = await prisma.utsSube.findMany({
    include: { branch: { select: { code: true } } },
    orderBy: { branch: { code: 'asc' } },
  });
  for (const u of tum) {
    console.log(
      `${u.branch.code.padEnd(8)} ortam=${u.ortam.padEnd(5)} aktif=${String(u.aktif).padEnd(5)} kurumNo=${u.kurumNo ?? '—'}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
