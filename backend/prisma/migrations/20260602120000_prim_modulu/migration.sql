-- CreateTable
CREATE TABLE "Personel" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "soyad" TEXT NOT NULL,
    "telefon" TEXT,
    "email" TEXT,
    "pozisyon" TEXT NOT NULL,
    "subeId" TEXT,
    "subeAdi" TEXT,
    "sirketId" INTEGER,
    "sirketAdi" TEXT,
    "bolgeId" TEXT,
    "maas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "pdksId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimKural" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "kapsam" TEXT NOT NULL,
    "donem" TEXT NOT NULL,
    "hedefTutar" DOUBLE PRECISION,
    "hedefAdet" INTEGER,
    "primOrani" DOUBLE PRECISION,
    "primSabit" DOUBLE PRECISION,
    "kategoriId" TEXT,
    "kategoriAdi" TEXT,
    "subeId" TEXT,
    "subeAdi" TEXT,
    "bolgeId" TEXT,
    "sirketId" INTEGER,
    "pozisyonlar" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrimKural_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimKazanim" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "primKuralId" TEXT NOT NULL,
    "donemBaslangic" TIMESTAMP(3) NOT NULL,
    "donemBitis" TIMESTAMP(3) NOT NULL,
    "hedef" DOUBLE PRECISION NOT NULL,
    "gerceklesen" DOUBLE PRECISION NOT NULL,
    "primTutari" DOUBLE PRECISION NOT NULL,
    "odendi" BOOLEAN NOT NULL DEFAULT false,
    "odemeTarihi" TIMESTAMP(3),
    "notlar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrimKazanim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bolge" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "mudurId" TEXT,
    "subeler" TEXT,
    "sirketId" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bolge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PrimKazanim" ADD CONSTRAINT "PrimKazanim_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimKazanim" ADD CONSTRAINT "PrimKazanim_primKuralId_fkey" FOREIGN KEY ("primKuralId") REFERENCES "PrimKural"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
