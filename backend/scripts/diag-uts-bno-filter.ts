/**
 * UTS BNO filtresi doğrulama — farklı BNO ile aynı endpoint karşılaştırması.
 * Token değerini stdout'a yazmaz.
 *
 * npx tsx backend/scripts/diag-uts-bno-filter.ts [BNO_A] [BNO_B] [SUBE]
 */
import 'dotenv/config';
import axios from 'axios';
import { prisma } from '../src/database/prisma';

const BNO_A = process.argv[2] || 'OPA2026000289158';
const BNO_B = process.argv[3] || '__BNO_OLMAMALI_99999__';
const SUBE = process.argv[4] || 'GVN2';

function baseUrl(ortam: string) {
  return ortam === 'test' ? 'https://utstest.saglik.gov.tr' : 'https://utsuygulama.saglik.gov.tr';
}

function parseListe(data: unknown) {
  if (!data || typeof data !== 'object') return { items: [] as Array<{ bno?: string; uno: string }>, nextOff: undefined as string | undefined };
  const root = data as Record<string, unknown>;
  const snc = root.SNC;
  if (!snc || typeof snc !== 'object') return { items: [], nextOff: undefined };
  const sncObj = snc as Record<string, unknown>;
  const lstRaw = sncObj.LST ?? sncObj.Lst ?? sncObj.liste;
  const liste = Array.isArray(lstRaw) ? lstRaw : lstRaw ? [lstRaw] : [];
  const items = liste.map((row) => {
    const r = row as Record<string, unknown>;
    const str = (v: unknown) => (v == null ? '' : String(v).trim());
    return { uno: str(r.UNO), bno: str(r.BNO) || undefined };
  }).filter((r) => r.uno);
  const nextOff = String(sncObj.OFF ?? sncObj.off ?? '').trim() || undefined;
  return { items, nextOff };
}

function ozet(data: unknown) {
  const parsed = parseListe(data);
  const bnoSet = new Set(parsed.items.map((i) => i.bno).filter(Boolean));
  return {
    kayitSayisi: parsed.items.length,
    farkliBnoSayisi: bnoSet.size,
    ornekBno: [...bnoSet].slice(0, 8),
    ornekUno: parsed.items.slice(0, 3).map((i) => i.uno),
    nextOff: parsed.nextOff ?? null,
    msj: (data as Record<string, unknown>)?.MSJ ?? null,
  };
}

async function sorgula(
  token: string,
  ortam: string,
  body: Record<string, unknown>,
  label: string,
) {
  const url = `${baseUrl(ortam)}/UTS/uh/rest/bildirim/alma/bekleyenler/sorgula`;
  const t0 = Date.now();
  const resp = await axios.post(url, body, {
    headers: { utsToken: token, 'Content-Type': 'application/json' },
    timeout: 45000,
    validateStatus: () => true,
  });
  const parsed = parseListe(resp.data);
  const hedef = String(body.BNO ?? '').trim();
  return {
    label,
    body,
    httpStatus: resp.status,
    ms: Date.now() - t0,
    ozet: ozet(resp.data),
    bnoEslesmeOrani: hedef && parsed.items.length
      ? {
          hedef,
          eslesen: parsed.items.filter((i) => i.bno === hedef).length,
          toplam: parsed.items.length,
        }
      : null,
  };
}

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { code: { equals: SUBE, mode: 'insensitive' } },
    include: { utsSube: true },
  });
  if (!branch?.utsSube?.token?.trim()) {
    console.error(`UTS token yok: ${SUBE}`);
    process.exit(1);
  }

  const token = branch.utsSube.token.trim();
  const ortam = branch.utsSube.ortam;
  console.log(`Şube: ${branch.code} | Ortam: ${ortam} | Token: [${token.length} char]`);

  // Resmi v1.0.56 istek alanları: GKK, SAN (Tablo 63). Eski ek dokümanda BNO da var (Tablo 35).
  const tests = [
    await sorgula(token, ortam, { BNO: BNO_A, SAN: 0 }, `BNO=${BNO_A} + SAN=0`),
    await sorgula(token, ortam, { BNO: BNO_B, SAN: 0 }, `BNO=${BNO_B} + SAN=0`),
    await sorgula(token, ortam, { SAN: 0 }, 'Resmi: SAN=0 (BNO yok)'),
    await sorgula(token, ortam, { BNO: BNO_A, ADT: 100 }, `BNO=${BNO_A} + ADT=100 (mevcut kod)`),
    await sorgula(token, ortam, { BNO: BNO_B, ADT: 100 }, `BNO=${BNO_B} + ADT=100 (mevcut kod)`),
  ];

  console.log('\n=== SONUÇLAR ===');
  for (const t of tests) {
    console.log(JSON.stringify(t, null, 2));
    console.log('---');
  }

  const byLabel = Object.fromEntries(tests.map((t) => [t.label, t.ozet.kayitSayisi]));
  console.log('\n=== ÖZET SAYILAR ===');
  console.log(JSON.stringify(byLabel, null, 2));

  const a = tests[0].ozet.kayitSayisi;
  const b = tests[1].ozet.kayitSayisi;
  const c = tests[2].ozet.kayitSayisi;
  const d = tests[3].ozet.kayitSayisi;
  const e = tests[4].ozet.kayitSayisi;

  console.log('\n=== YORUM ===');
  if (a === b && b === c && c === d && d === e && a > 0) {
    console.log('UYARI: Tüm sorgular aynı kayıt sayısı — BNO istek parametresi sunucu tarafında filtrelemiyor olabilir.');
  } else if (a !== b || d !== e) {
    console.log(`Farklı BNO farklı sonuç: SAN=0 ile A=${a} B=${b}; ADT=100 ile D=${d} E=${e}`);
    if (tests[0].bnoEslesmeOrani && tests[0].bnoEslesmeOrani.eslesen === tests[0].bnoEslesmeOrani.toplam) {
      console.log('OK: Dönen kayıtların tamamı istenen BNO ile eşleşiyor.');
    } else if (tests[0].bnoEslesmeOrani) {
      console.log(`Kısmi eşleşme: ${JSON.stringify(tests[0].bnoEslesmeOrani)}`);
    }
  } else {
    console.log(`Karışık: filtresiz=${c}, BNO_A=${a}, BNO_B=${b}`);
  }
}

main()
  .catch((err) => {
    console.error(err?.response?.data ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
