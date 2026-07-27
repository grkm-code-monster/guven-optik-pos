-- CreateTable
CREATE TABLE "Irsaliye" (
    "id" TEXT NOT NULL,
    "irsaliyeNo" TEXT NOT NULL,
    "sube" TEXT NOT NULL,
    "transferRef" TEXT,
    "ettn" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'GONDERILDI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Irsaliye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Irsaliye_irsaliyeNo_key" ON "Irsaliye"("irsaliyeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Irsaliye_transferRef_key" ON "Irsaliye"("transferRef");

-- CreateIndex
CREATE INDEX "Irsaliye_sube_idx" ON "Irsaliye"("sube");
