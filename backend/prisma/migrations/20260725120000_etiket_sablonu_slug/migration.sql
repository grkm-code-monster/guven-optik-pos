-- AlterTable
ALTER TABLE "EtiketSablonu" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EtiketSablonu_slug_key" ON "EtiketSablonu"("slug");
