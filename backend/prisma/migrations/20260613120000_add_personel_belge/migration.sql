-- CreateTable
CREATE TABLE "PersonelBelge" (
    "id" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "dosyaAdi" TEXT NOT NULL,
    "icerik" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "boyut" INTEGER NOT NULL,
    "yukleyenId" TEXT NOT NULL,
    "onaylandi" BOOLEAN NOT NULL DEFAULT false,
    "onaylayanId" TEXT,
    "onayTarihi" TIMESTAMP(3),
    "notlar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonelBelge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PersonelBelge" ADD CONSTRAINT "PersonelBelge_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
