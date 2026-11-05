-- 05.11.2026: Kasa formu düzenlemeleri — SADECE EKLEME. Mevcut hiçbir kayıt değişmez/silinmez.
-- 1) Açık hesap ödemesine yeni tür: CİRO DÜZELTME (sonradan verilen indirim)
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'CIRO_DUZELTME';

-- 2) Açık hesap ödemesine not ve giren kişi (boş olabilir)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "aciklama" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

-- 3) Manuel tahsilata kart bilgisi ve komisyon (boş olabilir)
ALTER TABLE "ManuelTahsilat" ADD COLUMN IF NOT EXISTS "bankId" TEXT;
ALTER TABLE "ManuelTahsilat" ADD COLUMN IF NOT EXISTS "posDeviceId" TEXT;
ALTER TABLE "ManuelTahsilat" ADD COLUMN IF NOT EXISTS "installment" INTEGER;
ALTER TABLE "ManuelTahsilat" ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,4);
ALTER TABLE "ManuelTahsilat" ADD COLUMN IF NOT EXISTS "commissionAmount" DECIMAL(10,2);
