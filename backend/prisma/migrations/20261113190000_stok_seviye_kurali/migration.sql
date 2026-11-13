-- 13.11.2026 — Mağaza min-max stok seviyeleri (yalnızca YENİ tablo)
CREATE TABLE IF NOT EXISTS "StokSeviyeKurali" (
    "id" TEXT NOT NULL,
    "lokasyon" TEXT NOT NULL,
    "seri" TEXT NOT NULL,
    "sphMin" DECIMAL(5,2),
    "sphMax" DECIMAL(5,2),
    "cylMin" DECIMAL(5,2),
    "cylMax" DECIMAL(5,2),
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StokSeviyeKurali_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StokSeviyeKurali_lokasyon_aktif_idx" ON "StokSeviyeKurali"("lokasyon", "aktif");
