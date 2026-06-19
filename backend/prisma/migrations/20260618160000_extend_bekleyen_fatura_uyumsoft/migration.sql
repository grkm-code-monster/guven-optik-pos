-- AlterTable
ALTER TABLE "BekleyenFatura" ADD COLUMN "uyumsoftEttn" TEXT;
ALTER TABLE "BekleyenFatura" ADD COLUMN "uyumsoftVeri" TEXT;
ALTER TABLE "BekleyenFatura" ADD COLUMN "uyumsoftDurum" TEXT;
ALTER TABLE "BekleyenFatura" ADD COLUMN "hedefDepo" TEXT DEFAULT 'ANADEPO';

-- CreateIndex
CREATE UNIQUE INDEX "BekleyenFatura_uyumsoftEttn_key" ON "BekleyenFatura"("uyumsoftEttn");
CREATE INDEX "BekleyenFatura_girisTipi_durum_idx" ON "BekleyenFatura"("girisTipi", "durum");
