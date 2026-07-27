/**
 * Madde 7 devam — DepoPage / StokYonetimiPage pilot yolu simulasyonu.
 * cd backend && npx tsx scripts/test-etiket-tercihli-yol.ts
 */
import 'dotenv/config';
import { getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';
import {
  generateZplBatchFromSablon,
  type CanvasElement,
  type EtiketVeri,
} from '../src/modules/etiket/etiket-zpl';

function gunesKategorisiMi(categAdi?: string) {
  const kat = (categAdi ?? '').toLowerCase();
  return kat.includes('güneş') || kat.includes('gunes');
}

function pilotSlugForSablon(sablonId: string, categAdi?: string): string | null {
  if (sablonId === 'gunes-aksesuar' && gunesKategorisiMi(categAdi)) return 'gunes-gozlugu-katlanir';
  if (sablonId === 'depo-kutu') return 'depo-etiketi';
  return null;
}

async function pilotZpl(sablonId: string, categAdi: string | undefined, veriler: EtiketVeri[]) {
  const slug = pilotSlugForSablon(sablonId, categAdi);
  if (!slug) throw new Error(`Pilot slug yok: ${sablonId} / ${categAdi}`);
  const sablon = await getSablonBySlug(slug);
  if (!sablon) throw new Error(`DB sablon yok: ${slug}`);
  return generateZplBatchFromSablon(
    sablon.elemanlar as CanvasElement[],
    sablon.etiketGenislik,
    sablon.etiketYukseklik,
    veriler,
  );
}

async function main() {
  console.log('=== DepoPage senaryosu (depo-kutu, kategori gerekmez) ===');
  const depoZpl = await pilotZpl('depo-kutu', undefined, [{
    urunAdi: 'DEPO TEST URUN',
    icReferans: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
    renkVaryant: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
    barkod: '8693283900499',
    sonGuncelleme: '25.07.2026',
    lotNo: 'LOT-DEP-1',
    seriNo: 'LOT-DEP-1',
  }]);
  console.log(depoZpl);
  if (!depoZpl.includes('^FO10,8') || !depoZpl.includes('^GB106,34')) {
    throw new Error('Depo pilot koordinatlari eksik');
  }

  console.log('\n=== StokYonetimiPage senaryosu (gunes-aksesuar + Güneş Gözlüğü) ===');
  const gunesZpl = await pilotZpl('gunes-aksesuar', 'Güneş Gözlüğü', [{
    urunAdi: 'RAY-BAN TEST',
    icReferans: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
    renkVaryant: 'MODEL: RB3025 / RENK: W3236 / OLCU: 58',
    fiyat: 1299,
    barkod: '8693283900499',
    utsKodu: '08681234567890',
    lotNo: 'LOT-1',
    seriNo: 'SN-1',
    sktTarihi: '260624',
    sonGuncelleme: '25.07.2026',
  }]);
  console.log(gunesZpl);
  if (!gunesZpl.includes('^FO334,16') || !gunesZpl.includes('^FO290,90^A0N,13,13^FDRB3025^FS')) {
    throw new Error('Gunes pilot koordinatlari eksik');
  }

  console.log('\nDepoPage + StokYonetimiPage pilot yolu: OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/database/prisma');
    await prisma.$disconnect();
  });
