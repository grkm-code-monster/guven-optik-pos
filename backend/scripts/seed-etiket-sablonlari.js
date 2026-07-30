/**
 * Etiket Tasarımcısı'ndaki (sablon-registry.ts) 6 sabit tasarımı, "Etiket
 * Şablonları (Yeni)" (EtiketSablonu tablosu / EtiketSablonDuzenleyici.tsx)
 * sistemine de aktarır — orada da seçilebilir/görünür olsunlar diye.
 *
 * Koordinatlar packages/web/src/components/etiket-tasarimci/sablon-zpl.ts
 * içindeki "Görkem onaylı nihai koordinatlar" ile birebir aynıdır (8 dot/mm).
 * slug alanı üzerinden upsert yapılır — script birden fazla kez çalıştırılsa
 * bile kayıtları çoğaltmaz, günceller.
 *
 * Çalıştırma (sunucuda):
 *   cd backend && node scripts/seed-etiket-sablonlari.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// --- Güneş Gözlüğü/Aksesuar & Optik Çerçeve (UTS'li) — 102x20mm, 816x160 dot ---
const gunesElemanlari = [
  { id: 'barkod', type: 'barcode128', x: 334, y: 16, height: 27 },
  { id: 'barkodNo', type: 'barkodMetin', x: 334, y: 58, fontSize: 11 },
  { id: 'urunAdi', type: 'urunAdi', x: 290, y: 74, fontSize: 14, fontWeight: 'normal', width: 250 },
  { id: 'model', type: 'model', x: 290, y: 90, fontSize: 13 },
  { id: 'renkKodu', type: 'renkKodu', x: 341, y: 90, fontSize: 13 },
  { id: 'fiyat', type: 'fiyat', x: 388, y: 112, fontSize: 26, fontWeight: 'bold' },
  { id: 'fiyatTarih', type: 'fiyatDegisimTarihi', x: 289, y: 131, fontSize: 10 },
  { id: 'kdv', type: 'kdvDahildir', x: 289, y: 144, fontSize: 10 },
  { id: 'gs1', type: 'gs1datamatrix', x: 569, y: 18, width: 60, height: 60 },
  { id: 'gs1ref', type: 'gs1Referans', x: 665, y: 38, fontSize: 13, lineGap: 16, mode: 'oto' },
];

// --- Depo Etiketi — 50x30mm, 400x240 dot ---
const depoElemanlari = [
  { id: 'barkod', type: 'barcode128', x: 10, y: 6, height: 48 },
  { id: 'barkodNo', type: 'barkodMetin', x: 10, y: 58, fontSize: 11 },
  { id: 'urunAdi', type: 'urunAdi', x: 10, y: 72, fontSize: 14, fontWeight: 'normal', width: 380 },
  { id: 'nitelik', type: 'nitelik', x: 10, y: 92, fontSize: 10, width: 186 },
  { id: 'sonSayim', type: 'sonGuncelleme', x: 204, y: 92, fontSize: 8 },
  { id: 'cerceveTuruBaslik', type: 'serbestMetin', x: 10, y: 110, fontSize: 7, text: 'Çerçeve Türü' },
  { id: 'cerceveTuruKutu', type: 'kutu', x: 10, y: 120, width: 186, height: 110 },
  { id: 'materyalBaslik', type: 'serbestMetin', x: 204, y: 110, fontSize: 7, text: 'Materyal' },
  { id: 'materyalKutu', type: 'kutu', x: 204, y: 120, width: 186, height: 110 },
];

// --- Kampanya şablonları — Güneş ile aynı taban (barkod/ürün/model/renk/kdv/gs1) ---
const kampanyaTaban = [
  { id: 'barkod', type: 'barcode128', x: 334, y: 16, height: 27 },
  { id: 'barkodNo', type: 'barkodMetin', x: 334, y: 58, fontSize: 11 },
  { id: 'urunAdi', type: 'urunAdi', x: 290, y: 74, fontSize: 14, fontWeight: 'normal', width: 250 },
  { id: 'model', type: 'model', x: 290, y: 90, fontSize: 13 },
  { id: 'renkKodu', type: 'renkKodu', x: 341, y: 90, fontSize: 13 },
  { id: 'kdv', type: 'kdvDahildir', x: 289, y: 144, fontSize: 10 },
  { id: 'gs1', type: 'gs1datamatrix', x: 569, y: 18, width: 60, height: 60 },
  { id: 'gs1ref', type: 'gs1Referans', x: 665, y: 38, fontSize: 13, lineGap: 16, mode: 'oto' },
];

const kampanyaYuzdeElemanlari = [
  ...kampanyaTaban,
  { id: 'fiyat', type: 'fiyat', x: 388, y: 112, fontSize: 26, fontWeight: 'bold' },
  { id: 'indirimYuzde', type: 'serbestMetin', x: 289, y: 131, fontSize: 14, fontWeight: 'bold', text: '%25 İNDİRİM' },
];

const kampanyaFiyatElemanlari = [
  ...kampanyaTaban,
  { id: 'yeniLabel', type: 'serbestMetin', x: 388, y: 112, fontSize: 22, fontWeight: 'bold', text: 'YENİ:' },
  { id: 'yeniFiyat', type: 'fiyat', x: 458, y: 112, fontSize: 22, fontWeight: 'bold' },
  { id: 'eskiFiyat', type: 'serbestMetin', x: 289, y: 131, fontSize: 10, text: 'ESKİ: 000,00 TL' },
];

const kampanyaIkinciElemanlari = [
  ...kampanyaTaban,
  { id: 'fiyat', type: 'fiyat', x: 388, y: 112, fontSize: 26, fontWeight: 'bold' },
  { id: 'ikinciUrun', type: 'serbestMetin', x: 289, y: 131, fontSize: 14, fontWeight: 'bold', text: '2. ÜRÜN %50' },
];

const SABLONLAR = [
  {
    slug: 'gunes-gozlugu-aksesuar',
    ad: 'Güneş Gözlüğü / Aksesuar',
    kategori: 'GUNES',
    elemanlar: gunesElemanlari,
    etiketGenislik: 102,
    etiketYukseklik: 20,
  },
  {
    slug: 'optik-cerceve-uts',
    ad: "Optik Çerçeve (UTS'li)",
    kategori: 'CERCEVE',
    elemanlar: gunesElemanlari,
    etiketGenislik: 102,
    etiketYukseklik: 20,
  },
  {
    slug: 'depo-etiketi',
    ad: 'Depo Etiketi',
    kategori: 'GENEL',
    elemanlar: depoElemanlari,
    etiketGenislik: 50,
    etiketYukseklik: 30,
  },
  {
    slug: 'kampanya-yuzde-indirim',
    ad: 'Kampanya — Yüzde İndirim',
    kategori: 'GENEL',
    elemanlar: kampanyaYuzdeElemanlari,
    etiketGenislik: 102,
    etiketYukseklik: 20,
  },
  {
    slug: 'kampanya-fiyat-dususu',
    ad: 'Kampanya — Fiyat Düşüşü',
    kategori: 'GENEL',
    elemanlar: kampanyaFiyatElemanlari,
    etiketGenislik: 102,
    etiketYukseklik: 20,
  },
  {
    slug: 'kampanya-ikinci-urun',
    ad: 'Kampanya — İkinci Ürün',
    kategori: 'GENEL',
    elemanlar: kampanyaIkinciElemanlari,
    etiketGenislik: 102,
    etiketYukseklik: 20,
  },
];

async function main() {
  for (const s of SABLONLAR) {
    const kayit = await prisma.etiketSablonu.upsert({
      where: { slug: s.slug },
      update: {
        ad: s.ad,
        kategori: s.kategori,
        elemanlar: s.elemanlar,
        etiketGenislik: s.etiketGenislik,
        etiketYukseklik: s.etiketYukseklik,
        aktif: true,
      },
      create: {
        ad: s.ad,
        slug: s.slug,
        kategori: s.kategori,
        elemanlar: s.elemanlar,
        etiketGenislik: s.etiketGenislik,
        etiketYukseklik: s.etiketYukseklik,
      },
    });
    console.log(`OK  ${kayit.id}  ${kayit.ad}  (${kayit.kategori}, ${kayit.etiketGenislik}x${kayit.etiketYukseklik}mm)`);
  }
  console.log(`\n${SABLONLAR.length} şablon işlendi.`);
}

main()
  .catch((err) => {
    console.error('HATA:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
