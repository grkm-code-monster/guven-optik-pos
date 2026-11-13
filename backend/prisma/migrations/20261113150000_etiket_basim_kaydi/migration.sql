-- 13.11.2026 — Etiket basım geçmişi (yalnızca YENİ tablo; mevcut tablolara dokunmaz)
CREATE TABLE IF NOT EXISTS "EtiketBasimKaydi" (
    "id" TEXT NOT NULL,
    "lotId" INTEGER,
    "lotAdi" TEXT,
    "utsKodu" TEXT,
    "varyantId" INTEGER,
    "urunAdi" TEXT NOT NULL,
    "nitelik" TEXT,
    "fiyat" DECIMAL(12,2),
    "sablonSlug" TEXT,
    "kaynak" TEXT NOT NULL,
    "lokasyon" TEXT,
    "adet" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "basildi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtiketBasimKaydi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EtiketBasimKaydi_lotId_idx" ON "EtiketBasimKaydi"("lotId");
CREATE INDEX IF NOT EXISTS "EtiketBasimKaydi_varyantId_idx" ON "EtiketBasimKaydi"("varyantId");
CREATE INDEX IF NOT EXISTS "EtiketBasimKaydi_basildi_idx" ON "EtiketBasimKaydi"("basildi");
