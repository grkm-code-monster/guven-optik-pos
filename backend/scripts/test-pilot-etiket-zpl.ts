/**
 * Pilot gunes sablonu — UTS'li / UTS'siz ZPL testi (Madde 5).
 * Calistirma: cd backend && npx tsx scripts/test-pilot-etiket-zpl.ts
 */
import 'dotenv/config';
import { getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';
import {
  generateZplFromSablon,
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
  const sablon = await getSablonBySlug('gunes-gozlugu-katlanir');
  if (!sablon) {
    throw new Error('gunes-gozlugu-katlanir bulunamadi — once seed script calistirin');
  }

  const elemanlar = sablon.elemanlar as CanvasElement[];
  const zplUts = generateZplFromSablon(elemanlar, sablon.etiketGenislik, sablon.etiketYukseklik, utsLi);
  const zplNoUts = generateZplFromSablon(elemanlar, sablon.etiketGenislik, sablon.etiketYukseklik, utsSiz);

  const refUts = gs1ReferansSatirlari(utsLi, 'oto');
  const refNoUts = gs1ReferansSatirlari(utsSiz, 'oto');

  console.log('=== UTS\'li referans satirlari (' + refUts.length + ' satir) ===');
  console.log(refUts.join('\n'));

  console.log('\n=== UTS\'siz referans satirlari (' + refNoUts.length + ' satir) ===');
  console.log(refNoUts.join('\n'));

  console.log('\n=== ZPL — UTS\'li ===');
  console.log(zplUts);

  console.log('\n=== ZPL — UTS\'siz (sadece lot/seri) ===');
  console.log(zplNoUts);

  const depoSablon = await getSablonBySlug('depo-etiketi');
  if (!depoSablon) throw new Error('depo-etiketi bulunamadi');

  const zplDepo = generateZplFromSablon(
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

  console.log('\n=== ZPL — Depo Etiketi (ornek) ===');
  console.log(zplDepo);

  const checks = [
    refUts.length === 4,
    refNoUts.length === 2,
    zplUts.includes('^FO334,16'),
    zplUts.includes('^FO665,38'),
    zplUts.includes('(17) 260624'),
    zplUts.includes('^FO290,90^A0N,13,13^FDGG1188S^FS'),
    zplUts.includes('^FO341,90^A0N,13,13^FDC1^FS'),
    zplNoUts.includes('^FO665,38'),
    zplNoUts.includes('(10) LOT-99'),
    !zplNoUts.includes('(17)'),
    zplDepo.includes('^FO10,8'),
    zplDepo.includes('^GB106,34'),
  ];

  if (!checks.every(Boolean)) {
    throw new Error('ZPL dogrulama basarisiz');
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
