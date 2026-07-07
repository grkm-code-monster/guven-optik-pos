-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPLETED');

-- AlterEnum
ALTER TYPE "WarrantyResult" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "WarrantyResult" ADD VALUE IF NOT EXISTS 'RESTOCKED';

-- AlterTable
ALTER TABLE "WarrantyClaim" ADD COLUMN     "transferSourceBranchId" TEXT,
ADD COLUMN     "transferStatus" "TransferStatus" DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "odooPickingId" TEXT,
ADD COLUMN     "managerApprovedAt" TIMESTAMP(3),
ADD COLUMN     "managerApprovedBy" TEXT,
ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "refundMethod" TEXT;
