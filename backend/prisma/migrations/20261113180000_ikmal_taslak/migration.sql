-- 13.11.2026 — Mağaza ikmali taslakları (yalnızca YENİ tablo; mevcut tablolara dokunmaz)
CREATE TABLE IF NOT EXISTS "IkmalTaslak" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "hedefLokasyon" TEXT NOT NULL,
    "kaynakLokasyon" TEXT NOT NULL DEFAULT 'ANADEPO',
    "durum" TEXT NOT NULL DEFAULT 'TASLAK',
    "kalemler" JSONB NOT NULL,
    "donemBas" TIMESTAMP(3),
    "donemBit" TIMESTAMP(3),
    "aciklama" TEXT,
    "olusturanId" TEXT,
    "olusturanAdi" TEXT,
    "transferRef" TEXT,
    "transferSonuc" JSONB,
    "gonderildi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IkmalTaslak_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IkmalTaslak_hedefLokasyon_durum_idx" ON "IkmalTaslak"("hedefLokasyon", "durum");
CREATE INDEX IF NOT EXISTS "IkmalTaslak_createdAt_idx" ON "IkmalTaslak"("createdAt");
