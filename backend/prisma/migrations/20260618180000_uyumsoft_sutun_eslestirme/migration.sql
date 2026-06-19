-- CreateTable
CREATE TABLE "UyumsoftSutunEslestirme" (
    "id" TEXT NOT NULL,
    "tedarikciVkn" TEXT,
    "tedarikciAdi" TEXT,
    "kolonMap" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UyumsoftSutunEslestirme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UyumsoftSutunEslestirme_tedarikciVkn_key" ON "UyumsoftSutunEslestirme"("tedarikciVkn");

-- CreateIndex
CREATE INDEX "UyumsoftSutunEslestirme_tedarikciAdi_idx" ON "UyumsoftSutunEslestirme"("tedarikciAdi");
