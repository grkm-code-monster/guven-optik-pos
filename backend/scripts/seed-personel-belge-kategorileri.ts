import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Spesifikasyon: "2. Personel Tarafından Yüklenecek Belgeler"
const KATEGORILER: Array<{
  kod: string; ad: string; grup: string; zorunlu: boolean; siraNo: number;
}> = [
  // A. Kişisel ve Kimlik Belgeleri
  { kod: 'KIMLIK', ad: 'Kimlik Fotokopisi', grup: 'KIMLIK_KISISEL', zorunlu: true, siraNo: 1 },
  { kod: 'IKAMETGAH', ad: 'İkametgâh Belgesi', grup: 'KIMLIK_KISISEL', zorunlu: true, siraNo: 2 },
  { kod: 'VUKUATLI_NUFUS_KAYDI', ad: 'Vukuatlı Nüfus Kayıt Örneği', grup: 'KIMLIK_KISISEL', zorunlu: false, siraNo: 3 },

  // B. Eğitim ve Mesleki Belgeler
  { kod: 'DIPLOMA', ad: 'Diploma / Mezuniyet Belgesi', grup: 'EGITIM_MESLEKI', zorunlu: true, siraNo: 10 },
  { kod: 'ASKERLIK_DURUM_BELGESI', ad: 'Askerlik Durum Belgesi', grup: 'EGITIM_MESLEKI', zorunlu: false, siraNo: 11 },
  { kod: 'KATILIM_SERTIFIKASI', ad: 'Katılım Sertifikası', grup: 'EGITIM_MESLEKI', zorunlu: false, siraNo: 12 },
  { kod: 'MESLEKI_EGITIM_BELGESI', ad: 'Mesleki Eğitim Belgesi', grup: 'EGITIM_MESLEKI', zorunlu: false, siraNo: 13 },
  { kod: 'USTALIK_KALFALIK_BELGESI', ad: 'Ustalık / Kalfalık Belgesi', grup: 'EGITIM_MESLEKI', zorunlu: false, siraNo: 14 },
  { kod: 'YETKINLIK_BELGESI', ad: 'Yetkinlik Belgesi', grup: 'EGITIM_MESLEKI', zorunlu: false, siraNo: 15 },

  // C. Sağlık ve Yasal Belgeler
  { kod: 'SAGLIK_RAPORU', ad: 'Sağlık Raporu (İşe Giriş)', grup: 'SAGLIK_YASAL', zorunlu: true, siraNo: 20 },
  { kod: 'ADLI_SICIL_KAYDI', ad: 'Adli Sicil Kaydı (Sabıka Kaydı)', grup: 'SAGLIK_YASAL', zorunlu: true, siraNo: 21 },
  { kod: 'KAN_GRUBU_BELGESI', ad: 'Kan Grubu Belgesi', grup: 'SAGLIK_YASAL', zorunlu: false, siraNo: 22 },

  // D. Diğer Belgeler
  { kod: 'SURUCU_BELGESI', ad: 'Sürücü Belgesi', grup: 'DIGER', zorunlu: false, siraNo: 30 },
  { kod: 'PASAPORT', ad: 'Pasaport', grup: 'DIGER', zorunlu: false, siraNo: 31 },
  { kod: 'REFERANS_YAZISI', ad: 'Referans Yazısı', grup: 'DIGER', zorunlu: false, siraNo: 32 },
  { kod: 'YABANCI_DIL_BELGESI', ad: 'Yabancı Dil Belgesi', grup: 'DIGER', zorunlu: false, siraNo: 33 },
  { kod: 'DIGER_EVRAK', ad: 'Diğer Evrak', grup: 'DIGER', zorunlu: false, siraNo: 34 },

  // Firma tarafından yönetilen (İK yükler) — aynı kategori listesinde, ayrı grupta
  { kod: 'IS_SOZLESMESI', ad: 'İş Sözleşmesi', grup: 'FIRMA_YONETIMI', zorunlu: true, siraNo: 40 },
  { kod: 'SGK_GIRIS', ad: 'SGK İşe Giriş Bildirgesi', grup: 'FIRMA_YONETIMI', zorunlu: true, siraNo: 41 },
  { kod: 'SGK_AYRILIS', ad: 'SGK İşten Ayrılış Bildirgesi', grup: 'FIRMA_YONETIMI', zorunlu: false, siraNo: 42 },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const k of KATEGORILER) {
    const existing = await prisma.personelBelgeKategorisi.findUnique({ where: { kod: k.kod } });
    if (existing) {
      await prisma.personelBelgeKategorisi.update({
        where: { kod: k.kod },
        data: { ad: k.ad, grup: k.grup, siraNo: k.siraNo },
      });
      updated++;
    } else {
      await prisma.personelBelgeKategorisi.create({ data: k });
      created++;
    }
  }
  console.log(`Belge kategorileri: ${created} oluşturuldu, ${updated} güncellendi.`);
  const toplam = await prisma.personelBelgeKategorisi.count();
  console.log(`Toplam kategori sayısı: ${toplam}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
