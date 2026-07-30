-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'ETICARET';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "eticaretSubesiMi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Branch" ADD COLUMN "eticaretOncelikSirasi" INTEGER;

-- CreateTable
CREATE TABLE "EticaretAyar" (
    "id" TEXT NOT NULL,
    "bizimApiAnahtari" TEXT NOT NULL,
    "partnerApiUrl" TEXT,
    "partnerApiToken" TEXT,
    "partnerDurumGuncelleUrl" TEXT,
    "eticaretSubeId" TEXT,
    "eticaretTemsilciUserId" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EticaretAyar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EticaretSiparis" (
    "id" TEXT NOT NULL,
    "partnerSiparisNo" TEXT NOT NULL,
    "musteriAdSoyad" TEXT NOT NULL,
    "musteriTelefon" TEXT,
    "musteriAdres" TEXT,
    "musteriIl" TEXT,
    "musteriIlce" TEXT,
    "odemeSekli" TEXT,
    "kalemler" JSONB NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'YENI',
    "secilenSubeId" TEXT,
    "saleId" TEXT,
    "odooFaturaId" INTEGER,
    "odooTransferPickingId" INTEGER,
    "kargoTakipNo" TEXT,
    "kargoyaVerildiTarihi" TIMESTAMP(3),
    "partnerDurumBildirildi" BOOLEAN NOT NULL DEFAULT false,
    "hataNotu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EticaretSiparis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EticaretSiparis_partnerSiparisNo_key" ON "EticaretSiparis"("partnerSiparisNo");

-- CreateIndex
CREATE UNIQUE INDEX "EticaretSiparis_saleId_key" ON "EticaretSiparis"("saleId");

-- CreateIndex
CREATE INDEX "EticaretSiparis_durum_idx" ON "EticaretSiparis"("durum");

-- CreateIndex
CREATE INDEX "EticaretSiparis_secilenSubeId_idx" ON "EticaretSiparis"("secilenSubeId");

-- AddForeignKey
ALTER TABLE "EticaretSiparis" ADD CONSTRAINT "EticaretSiparis_secilenSubeId_fkey" FOREIGN KEY ("secilenSubeId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EticaretSiparis" ADD CONSTRAINT "EticaretSiparis_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
