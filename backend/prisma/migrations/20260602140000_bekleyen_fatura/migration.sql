-- CreateTable
CREATE TABLE "BekleyenFatura" (
    "id" TEXT NOT NULL,
    "girisTipi" TEXT NOT NULL,
    "tedarikciAdi" TEXT,
    "tedarikciId" INTEGER,
    "irsaliyeNo" TEXT,
    "aciklama" TEXT,
    "sirketId" INTEGER,
    "sirketAdi" TEXT,
    "subeId" TEXT,
    "subeAdi" TEXT,
    "kalemler" TEXT,
    "odooPickingId" INTEGER,
    "odooPickingName" TEXT,
    "odooFaturaId" INTEGER,
    "odooFaturaNo" TEXT,
    "tahminiTarih" TIMESTAMP(3),
    "eslesmeTarihi" TIMESTAMP(3),
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "notlar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BekleyenFatura_pkey" PRIMARY KEY ("id")
);
