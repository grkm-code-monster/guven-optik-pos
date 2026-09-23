-- CreateTable
CREATE TABLE "KasaDuzeltme" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tarih" DATE NOT NULL,
    "nakit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "kartBrut" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "kdv" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "komisyon" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ciro" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vakif" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "aciklama" TEXT NOT NULL DEFAULT 'Sehven düzeltme',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KasaDuzeltme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KasaDuzeltme_branchId_tarih_idx" ON "KasaDuzeltme"("branchId", "tarih");
