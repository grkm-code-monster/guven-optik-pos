-- AlterTable
-- 23.10.2026: Kasa Bakiye Düzeltme kaydına SGK hakkı alanı (aylık "SGK Hakları" kutusu için)
ALTER TABLE "KasaDuzeltme" ADD COLUMN "sgk" DECIMAL(10,2) NOT NULL DEFAULT 0;
