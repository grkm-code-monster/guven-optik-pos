/**
 * Etiket Tasarımcısı'ndaki (sablon-registry.ts) sabit tasarımları, "Etiket
 * Şablonları (Yeni)" (EtiketSablonu tablosu / EtiketSablonDuzenleyici.tsx)
 * sistemine de aktarır — orada da seçilebilir/görünür/düzenlenebilir olsunlar
 * diye. Bunlar SADECE tarayıcı/düzenleyici amaçlı kayıtlardır — gerçek
 * "Etiket Bas" akışı bunları KULLANMAZ.
 *
 * ÖNEMLİ — "depo-etiketi" ve "gunes-gozlugu-katlanir" slug'larına DOKUNMAYIN:
 * bu ikisi ayrı, önceden tamamlanmış bir pilot projenin parçası
 * (bkz. ETIKET_MOTORU_BIRLESTIRME_VE_PILOT_TALIMATI.md ve
 * backend/scripts/seed-pilot-etiket-sablonlari.ts) ve gerçekten "Etiket Bas"
 * akışına bağlı — EtiketBasModal.tsx, pilotSlugForSablon() üzerinden bu iki
 * slug'ı arayıp üzerinden gerçek ZPL/PPLA üretiyor. Bu dosya o slug'ları
 * ASLA yazmaz (daha önce bir kez yanlışlıkla "depo-etiketi" ile çakışıp canlı
 * kaydı ezmişti — o hata burada düzeltildi, tekrarlanmasın).
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

// Bu iki slug, artık gerçek baskıya bağlanan tek konsolide kayıt
// ("gunes-gozlugu-katlanir", bkz. seed-pilot-etiket-sablonlari.ts) tarafından
// tamamen kapsandığı için PASİFE ALINIYOR — böyle iki ayrı, birbirinden
// habersiz düzenlenebilir kopya kalmıyor.
const ESKI_YEDEK_SLUGLAR = ['gunes-gozlugu-aksesuar', 'optik-cerceve-uts'];

const SABLONLAR = [
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

  for (const slug of ESKI_YEDEK_SLUGLAR) {
    const mevcut = await prisma.etiketSablonu.findUnique({ where: { slug } });
    if (mevcut && mevcut.aktif) {
      await prisma.etiketSablonu.update({ where: { slug }, data: { aktif: false } });
      console.log(`PASİFE ALINDI  ${slug}  (yerine: gunes-gozlugu-katlanir kullanılıyor)`);
    }
  }
}

main()
  .catch((err) => {
    console.error('HATA:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
