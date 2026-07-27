/**
 * PDKS GVN6/GVN7/GVN8 mekan ID raporu + doğrulama
 * npx tsx backend/scripts/pdks-gvn678-mekan-rapor.ts
 */
import { prisma } from '../src/database/prisma';
import { getKonumlar, hasTodayAttendance } from '../src/modules/pdks/pdks.service';

const HEDEF_SUBELER = ['GVN6', 'GVN7', 'GVN8'] as const;

type PlaceRow = { id: number; name?: string; address?: string; raw: unknown };

function normalizePlace(raw: unknown): PlaceRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id ?? o.placeId);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : undefined,
    address: typeof o.address === 'string' ? o.address : undefined,
    raw,
  };
}

function extractPlaces(payload: unknown): PlaceRow[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: unknown[] }).data
      : [];
  return list.map(normalizePlace).filter((p): p is PlaceRow => p != null);
}

function scoreMatch(branchCode: string, place: PlaceRow): number {
  const name = (place.name ?? '').toUpperCase();
  const code = branchCode.toUpperCase();
  const num = code.replace('GVN', '');
  let score = 0;
  if (name.includes(code)) score += 100;
  if (name.includes(`- ${num}`) || name.includes(` ${num}`) || name.endsWith(` ${num}`)) score += 80;
  if (name.includes(`1959`) && name.includes(num)) score += 40;
  if (name.includes('GÜVEN OPTİK') || name.includes('GUVEN OPTIK')) score += 10;
  return score;
}

async function main() {
  console.log('=== Adım 1: Patron PDKS canlı mekan listesi ===\n');

  const raw = await getKonumlar();
  const places = extractPlaces(raw).sort((a, b) => a.id - b.id);

  console.log('| placeId | isim |');
  console.log('|---------|------|');
  for (const p of places) {
    console.log(`| ${p.id} | ${p.name ?? '(isimsiz)'} |`);
  }
  console.log(`\nToplam: ${places.length} mekan\n`);

  console.log('=== Adım 2: GVN6/GVN7/GVN8 eşleştirme adayları ===\n');
  for (const code of HEDEF_SUBELER) {
    const ranked = places
      .map((p) => ({ ...p, score: scoreMatch(code, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    console.log(`${code}:`);
    if (!ranked.length) {
      console.log('  (isim eşleşmesi bulunamadı — manuel onay gerekir)');
    } else {
      for (const r of ranked.slice(0, 5)) {
        console.log(`  → id=${r.id} score=${r.score} name="${r.name ?? ''}"`);
      }
    }
    console.log('');
  }

  console.log('=== Adım 3: DB mevcut pdksPlaceId ===\n');
  const branches = await prisma.branch.findMany({
    where: { code: { in: [...HEDEF_SUBELER] } },
    select: { id: true, code: true, name: true, pdksPlaceId: true },
    orderBy: { code: 'asc' },
  });

  for (const code of HEDEF_SUBELER) {
    const b = branches.find((x) => x.code.toUpperCase() === code);
    if (!b) {
      console.log(`${code}: Branch kaydı YOK`);
      continue;
    }
    const placeName = b.pdksPlaceId
      ? places.find((p) => p.id === b.pdksPlaceId)?.name ?? '(listedeki isim bulunamadı)'
      : '—';
    console.log(
      `${b.code}: pdksPlaceId=${b.pdksPlaceId ?? 'NULL'} | Patron isim: ${placeName} | branch.name="${b.name}"`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
