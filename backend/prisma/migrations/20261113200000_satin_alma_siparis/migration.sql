-- 13.11.2026 — Satın alma siparişleri (yalnızca YENİ tablo)
CREATE TABLE IF NOT EXISTS "SatinAlmaSiparis" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "lokasyon" TEXT NOT NULL,
    "tedarikciId" INTEGER,
    "tedarikciAdi" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'TASLAK',
    "kaynak" TEXT NOT NULL DEFAULT 'MINMAX',
    "kalemler" JSONB NOT NULL,
    "aciklama" TEXT,
    "olusturanAdi" TEXT,
    "verildi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SatinAlmaSiparis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SatinAlmaSiparis_lokasyon_durum_idx" ON "SatinAlmaSiparis"("lokasyon", "durum");
CREATE INDEX IF NOT EXISTS "SatinAlmaSiparis_createdAt_idx" ON "SatinAlmaSiparis"("createdAt");
