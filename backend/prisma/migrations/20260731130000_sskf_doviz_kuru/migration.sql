-- CreateTable
CREATE TABLE "DovizKuru" (
    "id" TEXT NOT NULL,
    "tarih" DATE NOT NULL,
    "usd" DECIMAL(10,4) NOT NULL,
    "eur" DECIMAL(10,4) NOT NULL,
    "kaynak" TEXT NOT NULL DEFAULT 'TCMB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DovizKuru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrunGirisMaliyet" (
    "id" TEXT NOT NULL,
    "odooUrunId" INTEGER NOT NULL,
    "urunAdi" TEXT NOT NULL,
    "branchId" TEXT,
    "faturaNo" TEXT,
    "girisTarihi" DATE NOT NULL,
    "miktar" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "birimFiyatTl" DECIMAL(10,2) NOT NULL,
    "kurUsd" DECIMAL(10,4),
    "kurEur" DECIMAL(10,4),
    "tutarUsd" DECIMAL(10,2),
    "tutarEur" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrunGirisMaliyet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DovizKuru_tarih_key" ON "DovizKuru"("tarih");

-- CreateIndex
CREATE INDEX "UrunGirisMaliyet_odooUrunId_girisTarihi_idx" ON "UrunGirisMaliyet"("odooUrunId", "girisTarihi");
