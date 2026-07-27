-- SaleItem atölye gönderim alanları
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "atolyeBranchId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "sentToLabAt" TIMESTAMP(3);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "sentToLabByUserId" TEXT;
