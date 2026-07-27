-- CreateTable
CREATE TABLE "TransferAksiyonLog" (
    "id" TEXT NOT NULL,
    "transferRef" TEXT NOT NULL,
    "aksiyon" TEXT NOT NULL,
    "durum" TEXT NOT NULL,
    "mesaj" TEXT,
    "kayitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferAksiyonLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferAksiyonLog_transferRef_idx" ON "TransferAksiyonLog"("transferRef");

-- CreateIndex
CREATE INDEX "TransferAksiyonLog_aksiyon_idx" ON "TransferAksiyonLog"("aksiyon");
