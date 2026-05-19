-- Lens order measurements (progressive / lab order capture at sale confirm)

CREATE TYPE "LensOrderFrameType" AS ENUM ('KAPALI', 'NILOR', 'FASET');

CREATE TABLE "LensOrderMeasurement" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "lensSaleItemId" TEXT NOT NULL,
    "frameSaleItemId" TEXT,
    "ownFrame" BOOLEAN NOT NULL DEFAULT false,
    "frameType" "LensOrderFrameType" NOT NULL,
    "rph" DECIMAL(10,2) NOT NULL,
    "lph" DECIMAL(10,2) NOT NULL,
    "corridor" DECIMAL(10,2) NOT NULL,
    "rightDia" DECIMAL(10,2) NOT NULL,
    "leftDia" DECIMAL(10,2) NOT NULL,
    "vertex" DECIMAL(10,2) NOT NULL,
    "pantoscopic" DECIMAL(10,2) NOT NULL,
    "frameBow" DECIMAL(10,2) NOT NULL,
    "templateA" DECIMAL(10,2),
    "templateB" DECIMAL(10,2),
    "dbl" DECIMAL(10,2),
    "ed" DECIMAL(10,2),
    "customBaseRight" INTEGER,
    "customBaseLeft" INTEGER,
    "prismR1" DECIMAL(10,2),
    "prismR1Aks" INTEGER,
    "prismR2" DECIMAL(10,2),
    "prismR2Aks" INTEGER,
    "prismL1" DECIMAL(10,2),
    "prismL1Aks" INTEGER,
    "prismL2" DECIMAL(10,2),
    "prismL2Aks" INTEGER,
    "engraving" VARCHAR(3),
    "shiftRIn" DECIMAL(10,2),
    "shiftROut" DECIMAL(10,2),
    "shiftRUp" DECIMAL(10,2),
    "shiftRDown" DECIMAL(10,2),
    "shiftLIn" DECIMAL(10,2),
    "shiftLOut" DECIMAL(10,2),
    "shiftLUp" DECIMAL(10,2),
    "shiftLDown" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LensOrderMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LensOrderMeasurement_saleId_idx" ON "LensOrderMeasurement"("saleId");

ALTER TABLE "LensOrderMeasurement" ADD CONSTRAINT "LensOrderMeasurement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LensOrderMeasurement" ADD CONSTRAINT "LensOrderMeasurement_lensSaleItemId_fkey" FOREIGN KEY ("lensSaleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LensOrderMeasurement" ADD CONSTRAINT "LensOrderMeasurement_frameSaleItemId_fkey" FOREIGN KEY ("frameSaleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
