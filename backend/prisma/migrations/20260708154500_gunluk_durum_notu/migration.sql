-- CreateTable
CREATE TABLE "GunlukDurumNotu" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tarih" DATE NOT NULL,
    "metin" TEXT NOT NULL,
    "olusturanId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GunlukDurumNotu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GunlukDurumNotu_branchId_tarih_key" ON "GunlukDurumNotu"("branchId", "tarih");
