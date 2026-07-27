-- User.canWorkAtolye — SALES_STAFF vb. için ek atölye yetkisi
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canWorkAtolye" BOOLEAN NOT NULL DEFAULT false;
