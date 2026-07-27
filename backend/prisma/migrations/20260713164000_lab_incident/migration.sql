-- CreateTable: LabIncident (atölye kırılma/hasar bildirimi — WarrantyClaim'den bağımsız)
CREATE TABLE "LabIncident" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "atolyeBranchId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "note" TEXT,
    "resolutionType" TEXT,
    "ozelSiparisId" TEXT,
    "transferRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabIncident_saleItemId_idx" ON "LabIncident"("saleItemId");
CREATE INDEX "LabIncident_atolyeBranchId_idx" ON "LabIncident"("atolyeBranchId");
