-- CreateTable
CREATE TABLE "UtsSube" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kurumNo" TEXT,
    "token" TEXT,
    "ortam" TEXT NOT NULL DEFAULT 'canli',
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "sonKontrol" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtsSube_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtsDisFirma" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "vkn" TEXT,
    "kurumNo" TEXT,
    "adres" TEXT,
    "telefon" TEXT,
    "email" TEXT,
    "notlar" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtsDisFirma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtsBildirim" (
    "id" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "branchId" TEXT NOT NULL,
    "karsiKurumNo" TEXT,
    "karsiVkn" TEXT,
    "karsiAd" TEXT,
    "belgeNo" TEXT,
    "payload" JSONB NOT NULL,
    "utsBildirimId" TEXT,
    "hataDetay" TEXT,
    "gonderimZamani" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtsBildirim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtsBildirimKalem" (
    "id" TEXT NOT NULL,
    "bildirimId" TEXT NOT NULL,
    "barkod" TEXT NOT NULL,
    "seriNo" TEXT,
    "lotNo" TEXT,
    "adet" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UtsBildirimKalem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UtsSube_branchId_key" ON "UtsSube"("branchId");

-- AddForeignKey
ALTER TABLE "UtsSube" ADD CONSTRAINT "UtsSube_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtsBildirim" ADD CONSTRAINT "UtsBildirim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtsBildirimKalem" ADD CONSTRAINT "UtsBildirimKalem_bildirimId_fkey" FOREIGN KEY ("bildirimId") REFERENCES "UtsBildirim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
