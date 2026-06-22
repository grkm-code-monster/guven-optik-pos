-- CreateTable
CREATE TABLE "EtiketSablonu" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "elemanlar" JSONB NOT NULL,
    "etiketGenislik" INTEGER NOT NULL,
    "etiketYukseklik" INTEGER NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtiketSablonu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EtiketSablonu_kategori_idx" ON "EtiketSablonu"("kategori");

-- CreateIndex
CREATE INDEX "EtiketSablonu_aktif_idx" ON "EtiketSablonu"("aktif");
