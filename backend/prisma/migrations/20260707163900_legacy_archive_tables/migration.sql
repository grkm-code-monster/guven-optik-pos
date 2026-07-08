-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "legacyCustomerId" TEXT;

-- CreateTable
CREATE TABLE "LegacyCustomer" (
    "id" TEXT NOT NULL,
    "siberCariHesapId" INTEGER NOT NULL,
    "ad" TEXT,
    "soyad" TEXT,
    "telefon1" TEXT,
    "cepTelefon" TEXT,
    "tcKimlikNo" TEXT,
    "adres" TEXT,
    "email" TEXT,
    "dogumTarihi" TIMESTAMP(3),
    "kaynakSube" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacySale" (
    "id" TEXT NOT NULL,
    "siberStokHrkId" INTEGER NOT NULL,
    "legacyCustomerId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3),
    "toplamTutar" DECIMAL(10,2),
    "subeKodu" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacySaleItem" (
    "id" TEXT NOT NULL,
    "legacySaleId" TEXT NOT NULL,
    "urunAdi" TEXT,
    "miktar" DECIMAL(10,2),
    "fiyat" DECIMAL(10,2),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacySaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPrescription" (
    "id" TEXT NOT NULL,
    "siberStokHrkId" INTEGER,
    "legacyCustomerId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3),
    "r_sph" DECIMAL(5,2),
    "r_cyl" DECIMAL(5,2),
    "r_aks" INTEGER,
    "l_sph" DECIMAL(5,2),
    "l_cyl" DECIMAL(5,2),
    "l_aks" INTEGER,
    "near_r_sph" DECIMAL(5,2),
    "near_r_cyl" DECIMAL(5,2),
    "near_l_sph" DECIMAL(5,2),
    "near_l_cyl" DECIMAL(5,2),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyCustomer_siberCariHesapId_key" ON "LegacyCustomer"("siberCariHesapId");

-- CreateIndex
CREATE INDEX "LegacyCustomer_tcKimlikNo_idx" ON "LegacyCustomer"("tcKimlikNo");

-- CreateIndex
CREATE INDEX "LegacyCustomer_telefon1_idx" ON "LegacyCustomer"("telefon1");

-- CreateIndex
CREATE INDEX "LegacyCustomer_cepTelefon_idx" ON "LegacyCustomer"("cepTelefon");

-- CreateIndex
CREATE INDEX "LegacyCustomer_ad_soyad_idx" ON "LegacyCustomer"("ad", "soyad");

-- CreateIndex
CREATE UNIQUE INDEX "LegacySale_siberStokHrkId_key" ON "LegacySale"("siberStokHrkId");

-- CreateIndex
CREATE INDEX "LegacySale_legacyCustomerId_idx" ON "LegacySale"("legacyCustomerId");

-- CreateIndex
CREATE INDEX "LegacySaleItem_legacySaleId_idx" ON "LegacySaleItem"("legacySaleId");

-- CreateIndex
CREATE INDEX "LegacyPrescription_legacyCustomerId_idx" ON "LegacyPrescription"("legacyCustomerId");

-- AddForeignKey
ALTER TABLE "LegacySale" ADD CONSTRAINT "LegacySale_legacyCustomerId_fkey" FOREIGN KEY ("legacyCustomerId") REFERENCES "LegacyCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacySaleItem" ADD CONSTRAINT "LegacySaleItem_legacySaleId_fkey" FOREIGN KEY ("legacySaleId") REFERENCES "LegacySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPrescription" ADD CONSTRAINT "LegacyPrescription_legacyCustomerId_fkey" FOREIGN KEY ("legacyCustomerId") REFERENCES "LegacyCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
