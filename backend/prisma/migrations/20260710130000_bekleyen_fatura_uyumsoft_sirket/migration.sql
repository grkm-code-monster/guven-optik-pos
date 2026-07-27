-- AlterTable
ALTER TABLE "BekleyenFatura" ADD COLUMN "uyumsoftSirketId" TEXT DEFAULT 'ng';

-- Backfill mevcut Uyumsoft gelen fatura kayıtları
UPDATE "BekleyenFatura" SET "uyumsoftSirketId" = 'ng' WHERE "uyumsoftSirketId" IS NULL;

-- CreateIndex
CREATE INDEX "BekleyenFatura_uyumsoftSirketId_idx" ON "BekleyenFatura"("uyumsoftSirketId");
