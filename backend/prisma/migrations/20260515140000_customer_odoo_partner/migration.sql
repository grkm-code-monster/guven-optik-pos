-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "odooPartnerId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_odooPartnerId_key" ON "Customer"("odooPartnerId");
