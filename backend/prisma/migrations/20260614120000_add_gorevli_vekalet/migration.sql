-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "yedekSorumluId" TEXT;

-- CreateTable
CREATE TABLE "Gorevli" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "atayaUserId" TEXT NOT NULL,
    "tarih" DATE NOT NULL,
    "baslangic" TEXT,
    "bitis" TEXT,
    "notlar" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gorevli_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_yedekSorumluId_fkey" FOREIGN KEY ("yedekSorumluId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gorevli" ADD CONSTRAINT "Gorevli_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gorevli" ADD CONSTRAINT "Gorevli_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gorevli" ADD CONSTRAINT "Gorevli_atayaUserId_fkey" FOREIGN KEY ("atayaUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
