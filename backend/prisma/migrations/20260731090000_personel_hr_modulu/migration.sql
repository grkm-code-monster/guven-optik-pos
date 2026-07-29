-- AlterTable
ALTER TABLE "PersonelBelge" ADD COLUMN "durum" TEXT NOT NULL DEFAULT 'YUKLENDI';
ALTER TABLE "PersonelBelge" ADD COLUMN "versiyon" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PersonelBelge" ADD COLUMN "oncekiVersiyonId" TEXT;

-- CreateTable
CREATE TABLE "PersonelOzgecmis" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "tcKimlikNo" TEXT,
    "dogumTarihi" TIMESTAMP(3),
    "dogumYeri" TEXT,
    "cinsiyet" TEXT,
    "medeniDurum" TEXT,
    "uyruk" TEXT,
    "kanGrubu" TEXT,
    "alternatifTelefon" TEXT,
    "ikametAdresi" TEXT,
    "il" TEXT,
    "ilce" TEXT,
    "postaKodu" TEXT,
    "acilYakinlikDerecesi" TEXT,
    "acilAdSoyad" TEXT,
    "acilTelefon" TEXT,
    "acilAlternatifTelefon" TEXT,
    "ehliyetSinifi" TEXT,
    "ehliyetVerilisTarihi" TIMESTAMP(3),
    "aktifAracKullaniyor" BOOLEAN,
    "askerlikDurumu" TEXT,
    "tecilTarihi" TIMESTAMP(3),
    "kisaOzgecmis" TEXT,
    "sigaraKullaniyor" BOOLEAN,
    "seyahatEngeliVar" BOOLEAN,
    "vardiyaliCalisabilir" BOOLEAN,
    "kullanilanProgramlar" TEXT,
    "hobiler" TEXT,
    "digerAciklamalar" TEXT,
    "egitimler" JSONB,
    "isDeneyimleri" JSONB,
    "yabanciDiller" JSONB,
    "bilgisayarBilgileri" JSONB,
    "referanslar" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonelOzgecmis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelSertifika" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "kurum" TEXT,
    "tarih" TIMESTAMP(3),
    "dosyaAdi" TEXT,
    "mimeType" TEXT,
    "icerik" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonelSertifika_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelBelgeKategorisi" (
    "id" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "grup" TEXT NOT NULL,
    "zorunlu" BOOLEAN NOT NULL DEFAULT false,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "siraNo" INTEGER NOT NULL DEFAULT 0,
    "hedefGruplar" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonelBelgeKategorisi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SozlesmeSablonu" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "versiyon" INTEGER NOT NULL DEFAULT 1,
    "dosyaAdi" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "icerik" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SozlesmeSablonu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelSozlesme" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "sablonId" TEXT NOT NULL,
    "sablonAdi" TEXT NOT NULL,
    "sablonVersiyon" INTEGER NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "indirilmeTarihi" TIMESTAMP(3),
    "yuklenmeTarihi" TIMESTAMP(3),
    "onayTarihi" TIMESTAMP(3),
    "onaylayanId" TEXT,
    "yuklenenDosyaAdi" TEXT,
    "yuklenenMimeType" TEXT,
    "yuklenenIcerik" TEXT,
    "aciklama" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonelSozlesme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelBordro" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "ay" INTEGER NOT NULL,
    "yil" INTEGER NOT NULL,
    "dosyaAdi" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "icerik" TEXT NOT NULL,
    "aciklama" TEXT,
    "yukleyenId" TEXT,
    "yuklenmeTarihi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonelBordro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelHastalikRaporu" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "baslangicTarihi" TIMESTAMP(3) NOT NULL,
    "bitisTarihi" TIMESTAMP(3) NOT NULL,
    "gunSayisi" INTEGER NOT NULL,
    "saglikKurumu" TEXT,
    "aciklama" TEXT,
    "dosyaAdi" TEXT,
    "mimeType" TEXT,
    "icerik" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonelHastalikRaporu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonelBelgeLog" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "belgeId" TEXT,
    "sozlesmeId" TEXT,
    "islem" TEXT NOT NULL,
    "yapanId" TEXT,
    "aciklama" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonelBelgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonelOzgecmis_personelId_key" ON "PersonelOzgecmis"("personelId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonelBelgeKategorisi_kod_key" ON "PersonelBelgeKategorisi"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "PersonelBordro_personelId_ay_yil_key" ON "PersonelBordro"("personelId", "ay", "yil");

-- AddForeignKey
ALTER TABLE "PersonelOzgecmis" ADD CONSTRAINT "PersonelOzgecmis_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelSertifika" ADD CONSTRAINT "PersonelSertifika_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelSozlesme" ADD CONSTRAINT "PersonelSozlesme_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelSozlesme" ADD CONSTRAINT "PersonelSozlesme_sablonId_fkey" FOREIGN KEY ("sablonId") REFERENCES "SozlesmeSablonu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelBordro" ADD CONSTRAINT "PersonelBordro_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelHastalikRaporu" ADD CONSTRAINT "PersonelHastalikRaporu_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonelBelgeLog" ADD CONSTRAINT "PersonelBelgeLog_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
