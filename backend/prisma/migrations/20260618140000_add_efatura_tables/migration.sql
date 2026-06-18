-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "eFaturaId" TEXT,
ADD COLUMN "eFaturaDurum" TEXT;

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "faturaNo" TEXT NOT NULL,
    "uuid" TEXT,
    "satisId" TEXT,
    "transferId" TEXT,
    "sube" TEXT NOT NULL,
    "aliciVkn" TEXT NOT NULL,
    "aliciAdi" TEXT NOT NULL,
    "tutar" DOUBLE PRECISION NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'GONDERILDI',
    "profileId" TEXT NOT NULL DEFAULT 'EARSIVFATURA',
    "hata" TEXT,
    "gonderilenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaturaKuyruk" (
    "id" TEXT NOT NULL,
    "satisId" TEXT,
    "transferId" TEXT,
    "faturaNo" TEXT NOT NULL,
    "faturaData" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "deneme" INTEGER NOT NULL DEFAULT 0,
    "hata" TEXT,
    "gonderilenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaturaKuyruk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_faturaNo_key" ON "Fatura"("faturaNo");

-- CreateIndex
CREATE INDEX "Fatura_sube_idx" ON "Fatura"("sube");

-- CreateIndex
CREATE INDEX "Fatura_satisId_idx" ON "Fatura"("satisId");

-- CreateIndex
CREATE INDEX "Fatura_transferId_idx" ON "Fatura"("transferId");

-- CreateIndex
CREATE INDEX "Fatura_durum_idx" ON "Fatura"("durum");

-- CreateIndex
CREATE INDEX "FaturaKuyruk_durum_idx" ON "FaturaKuyruk"("durum");
