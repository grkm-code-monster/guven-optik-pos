-- 14.11.2026 — Ürün girişi eşleştirme hafızası. Sadece YENİ tablo.
CREATE TABLE IF NOT EXISTS "TedarikciUrunEslesme" (
    "id" TEXT NOT NULL,
    "tedarikciKey" TEXT NOT NULL,
    "tedarikciAdi" TEXT,
    "urunKey" TEXT NOT NULL,
    "tedarikciUrunAdi" TEXT NOT NULL,
    "tedarikciKodu" TEXT,
    "odooTmplId" INTEGER NOT NULL,
    "odooProductId" INTEGER,
    "urunAdi" TEXT NOT NULL,
    "barkod" TEXT,
    "varyantEtiketi" TEXT,
    "kullanim" INTEGER NOT NULL DEFAULT 1,
    "sonKullanim" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TedarikciUrunEslesme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TedarikciUrunEslesme_tedarikciKey_urunKey_key" ON "TedarikciUrunEslesme"("tedarikciKey", "urunKey");
CREATE INDEX IF NOT EXISTS "TedarikciUrunEslesme_tedarikciKey_idx" ON "TedarikciUrunEslesme"("tedarikciKey");
