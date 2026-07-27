-- AlterTable
ALTER TABLE "Product" ADD COLUMN "referansNo" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "referansNo" TEXT;

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "deger" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_referansNo_key" ON "Product"("referansNo");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_referansNo_key" ON "Sale"("referansNo");
