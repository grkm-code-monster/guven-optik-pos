-- Özel sipariş durum akışı genişletmesi
ALTER TABLE "OzelSiparis" ADD COLUMN IF NOT EXISTS "olusturanUserId" TEXT;

UPDATE "OzelSiparis" SET "durum" = 'GONDERILDI' WHERE "durum" = 'TEDARIKCIE_GONDERILDI';
UPDATE "OzelSiparis" SET "durum" = 'TESLIM_EDILDI' WHERE "durum" = 'MUSTERIYE_TESLIM';

CREATE TABLE IF NOT EXISTS "OzelSiparisLog" (
    "id" TEXT NOT NULL,
    "siparisId" TEXT NOT NULL,
    "eskiDurum" TEXT,
    "yeniDurum" TEXT NOT NULL,
    "userId" TEXT,
    "notlar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OzelSiparisLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OzelSiparisLog_siparisId_idx" ON "OzelSiparisLog"("siparisId");
CREATE INDEX IF NOT EXISTS "OzelSiparisLog_createdAt_idx" ON "OzelSiparisLog"("createdAt");

ALTER TABLE "OzelSiparisLog" DROP CONSTRAINT IF EXISTS "OzelSiparisLog_siparisId_fkey";
ALTER TABLE "OzelSiparisLog" ADD CONSTRAINT "OzelSiparisLog_siparisId_fkey"
  FOREIGN KEY ("siparisId") REFERENCES "OzelSiparis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OzelSiparisKarekod" (
    "id" TEXT NOT NULL,
    "siparisId" TEXT NOT NULL,
    "karekod" TEXT NOT NULL,
    "tarayanUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OzelSiparisKarekod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OzelSiparisKarekod_siparisId_idx" ON "OzelSiparisKarekod"("siparisId");
CREATE INDEX IF NOT EXISTS "OzelSiparisKarekod_karekod_idx" ON "OzelSiparisKarekod"("karekod");

ALTER TABLE "OzelSiparisKarekod" DROP CONSTRAINT IF EXISTS "OzelSiparisKarekod_siparisId_fkey";
ALTER TABLE "OzelSiparisKarekod" ADD CONSTRAINT "OzelSiparisKarekod_siparisId_fkey"
  FOREIGN KEY ("siparisId") REFERENCES "OzelSiparis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Bildirim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baslik" TEXT NOT NULL,
    "mesaj" TEXT NOT NULL,
    "link" TEXT,
    "tip" TEXT NOT NULL DEFAULT 'GENEL',
    "okundu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bildirim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Bildirim_userId_okundu_idx" ON "Bildirim"("userId", "okundu");
CREATE INDEX IF NOT EXISTS "Bildirim_createdAt_idx" ON "Bildirim"("createdAt");
