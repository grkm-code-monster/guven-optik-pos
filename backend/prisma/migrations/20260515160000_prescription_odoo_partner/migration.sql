-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "odooPartnerId" INTEGER;

CREATE INDEX IF NOT EXISTS "Prescription_odooPartnerId_idx" ON "Prescription"("odooPartnerId");
