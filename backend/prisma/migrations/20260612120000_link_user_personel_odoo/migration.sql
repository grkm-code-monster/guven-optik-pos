-- AlterTable
ALTER TABLE "User" ADD COLUMN "odooEmployeeId" INTEGER,
ADD COLUMN "personelId" TEXT;

-- AlterTable
ALTER TABLE "Personel" ADD COLUMN "userId" TEXT,
ADD COLUMN "odooEmployeeId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_personelId_key" ON "User"("personelId");

-- CreateIndex
CREATE UNIQUE INDEX "Personel_userId_key" ON "Personel"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "Personel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personel" ADD CONSTRAINT "Personel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
