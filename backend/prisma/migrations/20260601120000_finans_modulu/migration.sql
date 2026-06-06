-- CreateTable
CREATE TABLE "Ortak" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "soyad" TEXT,
    "telefon" TEXT,
    "email" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ortak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinansalVarlik" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "katman" TEXT NOT NULL,
    "sirketId" INTEGER,
    "sirketAdi" TEXT,
    "subeId" TEXT,
    "subeAdi" TEXT,
    "para_birimi" TEXT NOT NULL DEFAULT 'TRY',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "aciklama" TEXT,
    "odooHesapId" INTEGER,
    "ortakId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinansalVarlik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinansHareket" (
    "id" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tip" TEXT NOT NULL,
    "katman" TEXT NOT NULL,
    "kaynakVarlikId" TEXT,
    "hedefVarlikId" TEXT,
    "ortakId" TEXT,
    "sirketId" INTEGER,
    "sirketAdi" TEXT,
    "subeId" TEXT,
    "tutar" DOUBLE PRECISION NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "odemeYontemi" TEXT,
    "aciklama" TEXT,
    "evrakNo" TEXT,
    "odooFaturaId" INTEGER,
    "onaylayan" TEXT,
    "olusturan" TEXT,
    "iptalEdildi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinansHareket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrtakCari" (
    "id" TEXT NOT NULL,
    "ortakId" TEXT NOT NULL,
    "sirketId" INTEGER NOT NULL,
    "sirketAdi" TEXT,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tip" TEXT NOT NULL,
    "tutar" DOUBLE PRECISION NOT NULL,
    "aciklama" TEXT,
    "odendi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrtakCari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SirketCari" (
    "id" TEXT NOT NULL,
    "verenSirketId" INTEGER NOT NULL,
    "alanSirketId" INTEGER NOT NULL,
    "verenAdi" TEXT,
    "alanAdi" TEXT,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tutar" DOUBLE PRECISION NOT NULL,
    "aciklama" TEXT,
    "odendi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SirketCari_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FinansalVarlik" ADD CONSTRAINT "FinansalVarlik_ortakId_fkey" FOREIGN KEY ("ortakId") REFERENCES "Ortak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinansHareket" ADD CONSTRAINT "FinansHareket_kaynakVarlikId_fkey" FOREIGN KEY ("kaynakVarlikId") REFERENCES "FinansalVarlik"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinansHareket" ADD CONSTRAINT "FinansHareket_hedefVarlikId_fkey" FOREIGN KEY ("hedefVarlikId") REFERENCES "FinansalVarlik"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinansHareket" ADD CONSTRAINT "FinansHareket_ortakId_fkey" FOREIGN KEY ("ortakId") REFERENCES "Ortak"("id") ON DELETE SET NULL ON UPDATE CASCADE;
