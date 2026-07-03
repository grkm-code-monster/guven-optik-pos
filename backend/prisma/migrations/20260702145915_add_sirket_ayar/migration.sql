/*
  Warnings:

  - The values [ONLINE] on the enum `PaymentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `metadata` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `odooPartnerId` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the column `pricingInvoiceNote` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the `LensOrderMeasurement` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('KASA', 'NAKIT_ORAN', 'IKI_AL_BIR_ODE', 'URUN_BAZLI', 'COMBO', 'FORMUL');

-- CreateEnum
CREATE TYPE "CampaignScope" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT', 'CUSTOMER_SEGMENT');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentType_new" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OPEN_ACCOUNT');
ALTER TABLE "Payment" ALTER COLUMN "paymentType" TYPE "PaymentType_new" USING ("paymentType"::text::"PaymentType_new");
ALTER TYPE "PaymentType" RENAME TO "PaymentType_old";
ALTER TYPE "PaymentType_new" RENAME TO "PaymentType";
DROP TYPE "PaymentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "LensOrderMeasurement" DROP CONSTRAINT "LensOrderMeasurement_frameSaleItemId_fkey";

-- DropForeignKey
ALTER TABLE "LensOrderMeasurement" DROP CONSTRAINT "LensOrderMeasurement_lensSaleItemId_fkey";

-- DropForeignKey
ALTER TABLE "LensOrderMeasurement" DROP CONSTRAINT "LensOrderMeasurement_saleId_fkey";

-- DropIndex
DROP INDEX "Customer_odooPartnerId_key";

-- DropIndex
DROP INDEX "Prescription_odooPartnerId_idx";

-- AlterTable
ALTER TABLE "OzelSiparis" ADD COLUMN     "firmaUrunu" TEXT,
ADD COLUMN     "satisTemsilcisi" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "metadata";

-- AlterTable
ALTER TABLE "Prescription" DROP COLUMN "odooPartnerId";

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "pricingInvoiceNote";

-- DropTable
DROP TABLE "LensOrderMeasurement";

-- DropEnum
DROP TYPE "LensOrderFrameType";

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CampaignType" NOT NULL,
    "scope" "CampaignScope" NOT NULL DEFAULT 'ALL',
    "scopeValue" TEXT,
    "discountPct" DECIMAL(5,2),
    "discountTL" DECIMAL(10,2),
    "minBasket" DECIMAL(10,2),
    "minQty" INTEGER DEFAULT 0,
    "formulMultiplier" DECIMAL(8,4),
    "formulExtra" DECIMAL(10,2),
    "formulMargin" DECIMAL(5,2),
    "comboConfig" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 10,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "manualAlso" BOOLEAN NOT NULL DEFAULT false,
    "oodooPricelistId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBranchOverride" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "isActive" BOOLEAN,
    "discountPct" DECIMAL(5,2),
    "discountTL" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoApply" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBranchOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountTRY" DECIMAL(10,2) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SirketAyar" (
    "id" TEXT NOT NULL,
    "sirketId" TEXT NOT NULL,
    "anahtar" TEXT NOT NULL,
    "deger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SirketAyar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBranchOverride_campaignId_branchId_key" ON "CampaignBranchOverride"("campaignId", "branchId");

-- CreateIndex
CREATE INDEX "SirketAyar_sirketId_idx" ON "SirketAyar"("sirketId");

-- CreateIndex
CREATE UNIQUE INDEX "SirketAyar_sirketId_anahtar_key" ON "SirketAyar"("sirketId", "anahtar");

-- AddForeignKey
ALTER TABLE "CampaignBranchOverride" ADD CONSTRAINT "CampaignBranchOverride_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
