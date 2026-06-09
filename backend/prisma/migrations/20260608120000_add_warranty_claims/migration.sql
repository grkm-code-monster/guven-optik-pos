-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('OPEN', 'SENT_TO_SUPPLIER', 'WAITING_RESPONSE', 'IN_RETURN_PROCESS', 'RESOLVED', 'OUT_OF_WARRANTY');

-- CreateEnum
CREATE TYPE "WarrantyResult" AS ENUM ('PENDING', 'NEW_PRODUCT', 'PART_FREE', 'PART_PAID', 'POINTS_LOADED', 'OUT_OF_WARRANTY_FEE', 'OUT_OF_WARRANTY_REJECTED');

-- CreateEnum
CREATE TYPE "WarrantyType" AS ENUM ('CUSTOMER_WARRANTY', 'STOCK_WARRANTY', 'SATISFACTION_RETURN', 'EXCESS_ORDER_RETURN');

-- CreateEnum
CREATE TYPE "WarrantyExpectedOutcome" AS ENUM ('UNKNOWN', 'NEW_PRODUCT', 'REPAIR', 'POINTS', 'REFUND');

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "claimNo" TEXT NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'OPEN',
    "result" "WarrantyResult" NOT NULL DEFAULT 'PENDING',
    "type" "WarrantyType" NOT NULL,
    "expectedOutcome" "WarrantyExpectedOutcome" NOT NULL DEFAULT 'UNKNOWN',
    "saleId" TEXT,
    "saleItemId" TEXT,
    "customerId" TEXT,
    "branchId" TEXT,
    "userId" TEXT,
    "productName" TEXT,
    "lotNo" TEXT,
    "barcode" TEXT,
    "internalRef" TEXT,
    "supplierName" TEXT,
    "chainJson" TEXT,
    "problemDesc" TEXT,
    "supplierNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyMessage" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_claimNo_key" ON "WarrantyClaim"("claimNo");

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyMessage" ADD CONSTRAINT "WarrantyMessage_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "WarrantyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyMessage" ADD CONSTRAINT "WarrantyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
