/**
 * Madde 7 — pilot Etiket Bas yolu vs eski optik regresyon.
 * cd backend && npx tsx scripts/test-etiket-bas-pilot-yolu.ts
 */
import 'dotenv/config';
import { getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';
import {
  generateZplBatchFromSablon,
  type CanvasElement,
  type EtiketVeri,
} from '../src/modules/etiket/etiket-zpl';

const gunesVeri: EtiketVeri = {
  urunAdi: 'ORNEK GUNES',
  icReferans: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  renkVaryant: 'MODEL: GG1188S / RENK: C1 / OLCU: 58',
  fiyat: 999,
  barkod: '8693283900499',
  utsKodu: '08681234567890',
  lotNo: 'LOT-1',
  seriNo: 'SN-1',
  sktTarihi: '260624',
  sonGuncelleme: '22.06.2026',
};

async function main() {
  const gunesSablon = await getSablonBySlug('gunes-gozlugu-katlanir');
  const depoSablon = await getSablonBySlug('depo-etiketi');
  if (!gunesSablon || !depoSablon) throw new Error('Pilot sablonlar eksik — seed calistirin');

  const gunesZpl = generateZplBatchFromSablon(
    gunesSablon.elemanlar as CanvasElement[],
    gunesSablon.etiketGenislik,
    gunesSablon.etiketYukseklik,
    [gunesVeri],
  );

  const depoZpl = generateZplBatchFromSablon(
    depoSablon.elemanlar as CanvasElement[],
    depoSablon.etiketGenislik,
    depoSablon.etiketYukseklik,
    [{
      urunAdi: 'DEPO URUN',
      icReferans: 'MODEL: X / RENK: Y / OLCU: 58',
      renkVaryant: 'MODEL: X / RENK: Y / OLCU: 58',
      barkod: '8693283900499',
      sonGuncelleme: '01.01.2026',
    }],
  );

  console.log('=== Pilot gunes (EtiketBasModal -> slug gunes-gozlugu-katlanir) ===');
  console.log(gunesZpl);

  console.log('\n=== Pilot depo (EtiketBasModal -> slug depo-etiketi) ===');
  console.log(depoZpl.slice(0, 400) + '...');

  const gunesChecks = [
    ['^FO334,16', 'barkod'],
    ['^FO290,90^A0N,13,13^FDGG1188S^FS', 'model'],
    ['^FO341,90^A0N,13,13^FDC1^FS', 'renk'],
    ['^FO665,38', 'gs1 ref'],
  ] as const;

  for (const [needle, label] of gunesChecks) {
    if (!gunesZpl.includes(needle)) throw new Error(`Gunes pilot ZPL eksik: ${label} (${needle})`);
  }

  const depoChecks = ['^FO10,8', '^FO10,130', '^GB106,34'] as const;
  for (const needle of depoChecks) {
    if (!depoZpl.includes(needle)) throw new Error(`Depo pilot ZPL eksik: ${needle}`);
  }

  // GÜNCELLEME (Görkem kararı): pilot kapsamı 2 şablondan 6 şablonun tamamına
  // genişletildi — bkz. packages/web/src/components/etiket/etiket-sablon-helpers.ts
  // pilotSlugForSablon() (gerçek/güncel mantık orada). Bu kopya sadece backend
  // scriptinin frontend TS'i import edemediği için var, elle senkron tutuluyor.
  console.log('\n=== pilotSlug mantigi (EtiketBasModal) ===');
  function pilotSlugForSablon(sablonId: string, _categAdi?: string): string | null {
    if (sablonId === 'gunes-aksesuar' || sablonId === 'optik-cerceve-uts') return 'gunes-gozlugu-katlanir';
    if (sablonId === 'depo-kutu') return 'depo-etiketi';
    if (sablonId === 'kampanya-yuzde') return 'kampanya-yuzde-indirim';
    if (sablonId === 'kampanya-fiyat') return 'kampanya-fiyat-dususu';
    if (sablonId === 'kampanya-ikinci') return 'kampanya-ikinci-urun';
    return null;
  }
  if (pilotSlugForSablon('gunes-aksesuar', 'Güneş Gözlüğü') !== 'gunes-gozlugu-katlanir') {
    throw new Error('Gunes pilot slug eslesmedi');
  }
  if (pilotSlugForSablon('gunes-aksesuar', 'Aksesuar') !== 'gunes-gozlugu-katlanir') {
    throw new Error('Aksesuar da artik ayni pilota gitmeli');
  }
  if (pilotSlugForSablon('depo-kutu', '') !== 'depo-etiketi') throw new Error('Depo pilot slug');
  if (pilotSlugForSablon('optik-cerceve-uts', 'Çerçeve') !== 'gunes-gozlugu-katlanir') {
    throw new Error('Optik cerceve de artik gunes pilotuna gitmeli');
  }
  if (pilotSlugForSablon('kampanya-yuzde', '') !== 'kampanya-yuzde-indirim') {
    throw new Error('Kampanya yuzde pilot slug eslesmedi');
  }
  console.log('pilotSlugForSablon: OK');

  console.log('\nMadde 7 pilot + routing: OK');
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
