-- CreateTable
CREATE TABLE "FiyatDegisiklikBildirimi" (
    "id" TEXT NOT NULL,
    "urunId" INTEGER NOT NULL,
    "urunAdi" TEXT NOT NULL,
    "eskiFiyat" DECIMAL(12,2) NOT NULL,
    "yeniFiyat" DECIMAL(12,2) NOT NULL,
    "fiyatTipi" TEXT NOT NULL DEFAULT 'SATIS',
    "degistirenUserId" TEXT NOT NULL,
    "subeKodu" TEXT NOT NULL,
    "okundu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiyatDegisiklikBildirimi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiyatDegisiklikBildirimi_subeKodu_okundu_idx" ON "FiyatDegisiklikBildirimi"("subeKodu", "okundu");

-- CreateIndex
CREATE INDEX "FiyatDegisiklikBildirimi_createdAt_idx" ON "FiyatDegisiklikBildirimi"("createdAt");
