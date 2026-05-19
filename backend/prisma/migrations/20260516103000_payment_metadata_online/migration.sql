-- PaymentType extension + optional JSON metadata on payments
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'ONLINE';
