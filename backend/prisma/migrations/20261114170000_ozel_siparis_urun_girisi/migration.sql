-- 14.11.2026 — Müşteri siparişi ↔ ürün girişi bağı. Sadece YENİ, boş bırakılabilir alanlar (mevcut veri değişmez).
ALTER TABLE "OzelSiparis" ADD COLUMN IF NOT EXISTS "urunGirisNo" TEXT;
ALTER TABLE "OzelSiparis" ADD COLUMN IF NOT EXISTS "urunGirisFaturaNo" TEXT;
ALTER TABLE "OzelSiparis" ADD COLUMN IF NOT EXISTS "urunGirisTarihi" TIMESTAMP(3);
ALTER TABLE "OzelSiparis" ADD COLUMN IF NOT EXISTS "gelenAdet" INTEGER NOT NULL DEFAULT 0;
