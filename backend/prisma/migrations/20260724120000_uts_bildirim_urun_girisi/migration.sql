-- AlterTable
ALTER TABLE "UtsBildirim" ADD COLUMN "urunGirisiYapildiMi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UtsBildirim" ADD COLUMN "urunGirisiTarihi" TIMESTAMP(3);
