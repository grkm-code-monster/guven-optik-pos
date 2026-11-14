-- 14.11.2026 — Satış geçmişi (eski sistemler) + marka → fiziki tedarikçi. Sadece yeni tablolar.
CREATE TABLE IF NOT EXISTS "SatisGecmisi" (
    "id" SERIAL NOT NULL,
    "kaynak" TEXT NOT NULL,
    "tarih" DATE NOT NULL,
    "lokasyon" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "marka" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "renk" TEXT NOT NULL,
    "urunAdi" TEXT NOT NULL,
    "adet" INTEGER NOT NULL,
    "tutar" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "SatisGecmisi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SatisGecmisi_marka_idx" ON "SatisGecmisi"("marka");
CREATE INDEX IF NOT EXISTS "SatisGecmisi_kaynak_tarih_idx" ON "SatisGecmisi"("kaynak", "tarih");

CREATE TABLE IF NOT EXISTS "MarkaTedarikci" (
    "marka" TEXT NOT NULL,
    "tedarikciId" INTEGER,
    "tedarikciAdi" TEXT,
    "faturaFirma" TEXT,
    "temsilci" TEXT,
    "telefon" TEXT,
    "ziyaretDonemi" TEXT,
    "aciklama" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarkaTedarikci_pkey" PRIMARY KEY ("marka")
);
