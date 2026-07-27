-- AlterTable
ALTER TABLE "OzelSiparis" ADD COLUMN "saleItemId" TEXT;

-- CreateIndex
CREATE INDEX "OzelSiparis_saleItemId_idx" ON "OzelSiparis"("saleItemId");
