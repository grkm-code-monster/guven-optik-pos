/**
 * Pilot sablonlar — PPLA cikti testi (Argox OS-214plus).
 * Calistirma: cd backend && npx tsx scripts/test-pilot-etiket-ppla.ts
 */
import 'dotenv/config';
import { getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';
import {
  generatePplaFromSablon,
  PPLA_BLOCK_START,
  PPLA_DATAMATRIX_FIXED,
  PPLA_EOL,
  zplYToPplaY,
} from '../src/modules/etiket/etiket-ppla';

function pplaGorunur(s: string): string {
  return s.replace(/\x02/g, '<STX>').replace(/\r/g, '<CR>\n').replace(/\x1d/g, '<FNC1>');
}
import {
  gs1ReferansSatirlari,
  type CanvasElement,
  type EtiketVeri,
} from '../src/modules/etiket/etiket-zpl';

const utsLi: EtiketVeri = {
  urunAdi: 'ORNEK GUNES GOZLUGU',
  icReferans: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  renkVaryant: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  fiyat: 999,
  barkod: '8693283900499',
  utsKodu: '08681234567890',
  lotNo: 'LOT-2024-001',
  seriNo: 'SN-123456',
  sktTarihi: '260624',
  sonGuncelleme: '22.06.2026',
};

const utsSiz: EtiketVeri = {
  urunAdi: 'ORNEK GUNES GOZLUGU',
  icReferans: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  renkVaryant: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  fiyat: 999,
  barkod: '8693283900499',
  lotNo: 'LOT-99',
  seriNo: 'SERI-88',
  sonGuncelleme: '22.06.2026',
};

async function main() {
  const gunesSablon = await getSablonBySlug('gunes-gozlugu-katlanir');
  if (!gunesSablon) {
    throw new Error('gunes-gozlugu-katlanir bulunamadi — once seed script calistirin');
  }

  const elemanlar = gunesSablon.elemanlar as CanvasElement[];
  const gunesH = Math.round(gunesSablon.etiketYukseklik * 8);

  const pplaUts = generatePplaFromSablon(
    elemanlar,
    gunesSablon.etiketGenislik,
    gunesSablon.etiketYukseklik,
    utsLi,
  );
  const pplaNoUts = generatePplaFromSablon(
    elemanlar,
    gunesSablon.etiketGenislik,
    gunesSablon.etiketYukseklik,
    utsSiz,
  );

  const refUts = gs1ReferansSatirlari(utsLi, 'oto');
  const refNoUts = gs1ReferansSatirlari(utsSiz, 'oto');

  console.log('=== UTS\'li referans satirlari (' + refUts.length + ' satir) ===');
  console.log(refUts.join('\n'));

  console.log('\n=== UTS\'siz referans satirlari (' + refNoUts.length + ' satir) ===');
  console.log(refNoUts.join('\n'));

  console.log('\n=== PPLA — Gunes UTS\'li (kontrol karakterleri gorunur) ===');
  console.log(pplaGorunur(pplaUts));

  console.log('\n=== PPLA — Gunes UTS\'siz (kontrol karakterleri gorunur) ===');
  console.log(pplaGorunur(pplaNoUts));

  const depoSablon = await getSablonBySlug('depo-etiketi');
  if (!depoSablon) throw new Error('depo-etiketi bulunamadi');

  const pplaDepo = generatePplaFromSablon(
    depoSablon.elemanlar as CanvasElement[],
    depoSablon.etiketGenislik,
    depoSablon.etiketYukseklik,
    {
      urunAdi: 'ORNEK DEPO URUNU',
      icReferans: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
      renkVaryant: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
      barkod: '8693283900499',
      sonGuncelleme: '15.07.2026',
    },
  );

  console.log('\n=== PPLA — Depo Etiketi (kontrol karakterleri gorunur) ===');
  console.log(pplaGorunur(pplaDepo));

  const gs1RefEl = elemanlar.find((e) => e.type === 'gs1Referans');
  const barkodEl = elemanlar.find((e) => e.type === 'barcode128');
  const gs1RefY = gs1RefEl
    ? zplYToPplaY(gs1RefEl.y, gunesH, Math.round(gs1RefEl.fontSize ?? 8))
    : 0;
  const barkodY = barkodEl
    ? zplYToPplaY(barkodEl.y, gunesH, Math.round(barkodEl.height ?? 100))
    : 0;
  const depoBarkodY = zplYToPplaY(8, 400, 90);

  const dmSatir = pplaUts.split(PPLA_EOL).find((line) => line.startsWith('1W1c')) ?? '';

  const checks = [
    refUts.length === 4,
    refNoUts.length === 2,
    PPLA_DATAMATRIX_FIXED.length === 10,
    pplaUts.startsWith(PPLA_BLOCK_START),
    pplaUts.includes(PPLA_EOL),
    !pplaUts.includes('\n'),
    pplaUts.endsWith(`${PPLA_EOL}E`),
    pplaUts.includes(`1E00${String(barkodEl?.height ?? 27).padStart(3, '0')}${String(barkodY).padStart(4, '0')}${String(barkodEl?.x ?? 0).padStart(4, '0')}`),
    pplaUts.includes(`${String(gs1RefY).padStart(4, '0')}${String(gs1RefEl?.x ?? 0).padStart(4, '0')}(01)`),
    pplaUts.includes('(17) 260624'),
    pplaUts.includes('GG1188S'),
    dmSatir.includes(PPLA_DATAMATRIX_FIXED),
    dmSatir.includes('0108681234567890'),
    pplaNoUts.includes('(10) LOT-99'),
    !pplaNoUts.includes('(17)'),
    pplaDepo.includes(`1E00${String(90).padStart(3, '0')}${String(depoBarkodY).padStart(4, '0')}0010`),
    pplaDepo.includes('1X11000'),
    pplaDepo.includes('B106034'),
  ];

  if (!checks.every(Boolean)) {
    throw new Error('PPLA dogrulama basarisiz');
  }
  console.log('\nTum kontroller gecti.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/database/prisma');
    await prisma.$disconnect();
  });
