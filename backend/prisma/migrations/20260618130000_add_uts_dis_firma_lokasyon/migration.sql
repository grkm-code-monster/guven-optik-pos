-- AlterTable
ALTER TABLE "UtsDisFirma" ADD COLUMN "odooPartnerId" INTEGER;

-- CreateTable
CREATE TABLE "UtsDisFirmaLokasyon" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "kurumNo" TEXT,
    "varsayilan" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtsDisFirmaLokasyon_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UtsDisFirmaLokasyon" ADD CONSTRAINT "UtsDisFirmaLokasyon_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "UtsDisFirma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
