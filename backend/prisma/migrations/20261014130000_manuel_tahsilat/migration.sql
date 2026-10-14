-- CreateTable
CREATE TABLE "ManuelTahsilat" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerAdi" TEXT NOT NULL,
    "tutar" DECIMAL(10,2) NOT NULL,
    "odemeTuru" TEXT NOT NULL,
    "aciklama" TEXT,
    "shiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManuelTahsilat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManuelTahsilat_branchId_createdAt_idx" ON "ManuelTahsilat"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "ManuelTahsilat_customerId_idx" ON "ManuelTahsilat"("customerId");
