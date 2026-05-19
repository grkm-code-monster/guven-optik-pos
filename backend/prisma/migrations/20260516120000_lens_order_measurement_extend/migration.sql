-- Optik cam ölçüleri: ek alanlar, prizma sütun adları, nullable çekirdek ölçüler, SaleItem.odooCategoryId

ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "odooCategoryId" INTEGER;

ALTER TABLE "LensOrderMeasurement" ADD COLUMN IF NOT EXISTS "ownFrameNote" TEXT;
ALTER TABLE "LensOrderMeasurement" ADD COLUMN IF NOT EXISTS "rightEyeActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LensOrderMeasurement" ADD COLUMN IF NOT EXISTS "leftEyeActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LensOrderMeasurement" RENAME COLUMN "prismR1" TO "prismR1Val";
ALTER TABLE "LensOrderMeasurement" RENAME COLUMN "prismR2" TO "prismR2Val";
ALTER TABLE "LensOrderMeasurement" RENAME COLUMN "prismL1" TO "prismL1Val";
ALTER TABLE "LensOrderMeasurement" RENAME COLUMN "prismL2" TO "prismL2Val";

ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "rph" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "lph" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "corridor" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "rightDia" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "leftDia" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "vertex" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "pantoscopic" DROP NOT NULL;
ALTER TABLE "LensOrderMeasurement" ALTER COLUMN "frameBow" DROP NOT NULL;
