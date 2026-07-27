-- AlterTable
ALTER TABLE "FiyatDegisiklikBildirimi" ADD COLUMN "etiketBasildi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiyatDegisiklikBildirimi" ADD COLUMN "etiketBasilmaTarihi" TIMESTAMP(3);
ALTER TABLE "FiyatDegisiklikBildirimi" ADD COLUMN "sonHatirlatmaTarihi" TIMESTAMP(3);
