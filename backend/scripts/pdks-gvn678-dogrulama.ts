/**
 * PDKS GVN6/GVN7/GVN8 — hasTodayAttendance doğrulama
 * npx tsx backend/scripts/pdks-gvn678-dogrulama.ts
 */
import axios from 'axios';
import { prisma } from '../src/database/prisma';
import { hasTodayAttendance } from '../src/modules/pdks/pdks.service';

const HEDEF = ['GVN6', 'GVN7', 'GVN8'] as const;
const ORG_ID = process.env.PDKS_ORG_ID!;
const TOKEN = process.env.PDKS_TOKEN!;
const BASE = 'https://app.patronpdks.com/api/v4';

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

async function testPlaceDetail(placeId: number) {
  const res = await axios.get(`${BASE}/organizations/${ORG_ID}/places/${placeId}`, {
    headers: { Token: TOKEN, 'Accept-Language': 'tr' },
    validateStatus: () => true,
    timeout: 8000,
  });
  return { status: res.status, message: res.data?.error?.message ?? 'OK' };
}

async function testEntries(userId: string) {
  const date = todayYmd();
  const res = await axios.get(`${BASE}/organizations/${ORG_ID}/entries`, {
    headers: { Token: TOKEN, 'Accept-Language': 'tr' },
    params: { 'created[gte]': `${date} 00:00:00`, userId, limit: 100 },
    validateStatus: () => true,
    timeout: 8000,
  });
  const entries = Array.isArray(res.data?.data) ? res.data.data : [];
  return { status: res.status, entryCount: entries.length, message: res.data?.error?.message };
}

async function main() {
  console.log('=== Adım 4: PDKS doğrulama (GVN6/GVN7/GVN8) ===\n');

  const branches = await prisma.branch.findMany({
    where: { code: { in: [...HEDEF] } },
    select: { id: true, code: true, pdksPlaceId: true },
    orderBy: { code: 'asc' },
  });

  for (const branch of branches) {
    console.log(`--- ${branch.code} (placeId=${branch.pdksPlaceId}) ---`);

    if (branch.pdksPlaceId) {
      const detail = await testPlaceDetail(branch.pdksPlaceId);
      console.log(`  GET /places/{id}: HTTP ${detail.status} — ${detail.message}`);
    }

    const personel = await prisma.personel.findFirst({
      where: {
        aktif: true,
        pdksId: { not: null },
        OR: [
          { subeId: branch.id },
          { subeAdi: branch.code },
          { subeAdi: { contains: branch.code, mode: 'insensitive' } },
        ],
      },
      select: { id: true, ad: true, soyad: true, pdksId: true, subeAdi: true },
      orderBy: { ad: 'asc' },
    });

    if (!personel?.pdksId) {
      console.log('  Personel (pdksId): bulunamadı — attendance testi atlandı');
      console.log('');
      continue;
    }

    console.log(`  Personel: ${personel.ad} ${personel.soyad} (pdksId=${personel.pdksId}, sube=${personel.subeAdi})`);

    const entries = await testEntries(personel.pdksId);
    console.log(`  GET /entries: HTTP ${entries.status}, kayıt=${entries.entryCount}${entries.message ? ` — ${entries.message}` : ''}`);

    const attendance = await hasTodayAttendance(personel.pdksId, branch.pdksPlaceId);
    const attendanceLabel = attendance === null ? 'null (API hatası — login bloklanmaz)' : attendance ? 'true (giriş var)' : 'false (giriş yok)';
    console.log(`  hasTodayAttendance: ${attendanceLabel}`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
