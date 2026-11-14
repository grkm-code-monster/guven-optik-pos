-- 14.11.2026 — UTS kaydı bekleyen ürün girişleri. Sadece YENİ tablo.
CREATE TABLE IF NOT EXISTS "UtsBekleyenGiris" (
    "id" TEXT NOT NULL,
    "girisNo" TEXT,
    "belgeNo" TEXT,
    "cariAdi" TEXT,
    "sirketId" INTEGER,
    "lotNo" TEXT NOT NULL,
    "odooLotId" INTEGER,
    "urunAdi" TEXT NOT NULL,
    "barkod" TEXT,
    "utsKodu" TEXT,
    "utsSube" TEXT,
    "hedefSube" TEXT,
    "siparisId" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "deneme" INTEGER NOT NULL DEFAULT 0,
    "sonDeneme" TIMESTAMP(3),
    "mesaj" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UtsBekleyenGiris_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UtsBekleyenGiris_durum_belgeNo_idx" ON "UtsBekleyenGiris"("durum", "belgeNo");
