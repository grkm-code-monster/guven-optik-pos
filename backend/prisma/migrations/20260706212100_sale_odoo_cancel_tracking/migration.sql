-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "odooCancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "odooCancelError" TEXT;
