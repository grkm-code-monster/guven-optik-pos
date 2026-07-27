/**
 * Madde 6 — duzenleyici kaydet akisi DB kaliciligi (servis katmani).
 * cd backend && npx tsx scripts/test-etiket-sablon-kaydet.ts
 */
import 'dotenv/config';
import { getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';
import { updateSablon } from '../src/modules/etiket/etiket-sablon.service';

type El = { id: string; fontSize?: number; [k: string]: unknown };

async function main() {
  const sablon = await getSablonBySlug('gunes-gozlugu-katlanir');
  if (!sablon) throw new Error('gunes-gozlugu-katlanir yok');

  const elemanlar = JSON.parse(JSON.stringify(sablon.elemanlar)) as El[];
  const fiyatEl = elemanlar.find((e) => e.id === 'fiyat');
  if (!fiyatEl) throw new Error('fiyat elemani yok');

  const eski = fiyatEl.fontSize ?? 26;
  const yeni = eski === 26 ? 28 : 26;
  fiyatEl.fontSize = yeni;

  await updateSablon(sablon.id, { elemanlar });

  const tekrar = await getSablonBySlug('gunes-gozlugu-katlanir');
  const okunan = (tekrar!.elemanlar as El[]).find((e) => e.id === 'fiyat')?.fontSize;

  console.log(`fiyat.fontSize: ${eski} -> kaydet -> DB'den: ${okunan}`);
  if (okunan !== yeni) throw new Error('Kayit kalici degil');

  // geri al (seed ile uyumlu kalsin)
  fiyatEl.fontSize = 26;
  await updateSablon(sablon.id, { elemanlar });
  console.log('Geri alindi: fiyat.fontSize=26');
  console.log('Madde 6 DB kaliciligi: OK');
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
