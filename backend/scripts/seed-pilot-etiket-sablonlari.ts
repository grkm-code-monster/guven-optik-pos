/**
 * Pilot etiket sablonlari — Madde 4/5 (slug ile upsert).
 * Calistirma: cd backend && npx tsx scripts/seed-pilot-etiket-sablonlari.ts
 */
import 'dotenv/config';
import { upsertSablonBySlug, getSablonBySlug } from '../src/modules/etiket/etiket-sablon.service';

const DEPO_ETIKETI = {
  ad: 'Depo Etiketi (50x30mm)',
  kategori: 'GENEL',
  slug: 'depo-etiketi',
  etiketGenislik: 50,
  etiketYukseklik: 30,
  elemanlar: [
    { id: 'barkod', type: 'barcode128', x: 16, y: 10, width: 200, height: 56 },
    { id: 'barkodNo', type: 'barkodMetin', x: 16, y: 70, fontSize: 10 },
    { id: 'urunAdi', type: 'urunAdi', x: 16, y: 88, fontSize: 13, fontWeight: 'bold' },
    { id: 'nitelik', type: 'nitelik', x: 16, y: 104, fontSize: 9, width: 368 },
    { id: 'sonSayim', type: 'sonGuncelleme', x: 16, y: 120, fontSize: 8 },
    { id: 'cerceveTuruLabel', type: 'serbestMetin', text: 'Çerçeve Türü', x: 16, y: 136, fontSize: 7 },
    { id: 'cerceveTuruKutu', type: 'kutu', x: 16, y: 144, width: 180, height: 88 },
    { id: 'materyalLabel', type: 'serbestMetin', text: 'Materyal', x: 204, y: 136, fontSize: 7 },
    { id: 'materyalKutu', type: 'kutu', x: 204, y: 144, width: 180, height: 88 },
  ],
} as const;

const GUNES_KATLANIR = {
  ad: 'Güneş Gözlüğü Etiketi (Katlanır)',
  kategori: 'GUNES',
  slug: 'gunes-gozlugu-katlanir',
  etiketGenislik: 102,
  etiketYukseklik: 20,
  elemanlar: [
    { id: 'barkod', type: 'barcode128', x: 334, y: 16, width: 147, height: 27 },
    { id: 'barkodNo', type: 'barkodMetin', x: 334, y: 58, fontSize: 11 },
    { id: 'urunAdi', type: 'urunAdi', x: 290, y: 74, fontSize: 14, fontWeight: 'bold' },
    { id: 'model', type: 'model', x: 290, y: 90, fontSize: 13 },
    { id: 'renkKodu', type: 'renkKodu', x: 341, y: 90, fontSize: 13 },
    { id: 'fiyat', type: 'fiyat', x: 388, y: 112, fontSize: 26, fontWeight: 'bold' },
    { id: 'fiyatTarihi', type: 'fiyatDegisimTarihi', x: 289, y: 131, fontSize: 10 },
    { id: 'kdv', type: 'kdvDahildir', x: 289, y: 144, fontSize: 10 },
    { id: 'karekod', type: 'gs1datamatrix', x: 569, y: 18, width: 94, height: 94 },
    { id: 'gs1Referans', type: 'gs1Referans', x: 665, y: 38, fontSize: 13, lineGap: 16, mode: 'oto' },
  ],
} as const;

async function main() {
  const depo = await upsertSablonBySlug(DEPO_ETIKETI);
  const gunes = await upsertSablonBySlug(GUNES_KATLANIR);

  const depoCheck = await getSablonBySlug('depo-etiketi');
  const gunesCheck = await getSablonBySlug('gunes-gozlugu-katlanir');

  console.log('=== Pilot sablon seed tamam ===');
  console.log(JSON.stringify({
    depo: { id: depo.id, slug: depo.slug, ad: depo.ad, elemanSayisi: (depo.elemanlar as unknown[]).length },
    gunes: { id: gunes.id, slug: gunes.slug, ad: gunes.ad, elemanSayisi: (gunes.elemanlar as unknown[]).length },
  }, null, 2));

  if (!depoCheck || depoCheck.slug !== 'depo-etiketi') {
    throw new Error('depo-etiketi slug ile bulunamadi');
  }
  if (!gunesCheck || gunesCheck.slug !== 'gunes-gozlugu-katlanir') {
    throw new Error('gunes-gozlugu-katlanir slug ile bulunamadi');
  }
  console.log('Slug dogrulama: OK');
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
