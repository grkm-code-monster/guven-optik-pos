-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "aciklama" TEXT,
    "boyutlar" JSONB NOT NULL,
    "olculer" JSONB NOT NULL,
    "filtreler" JSONB,
    "olusturanId" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAccess" (
    "id" TEXT NOT NULL,
    "reportTemplateId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "reportTemplateId" TEXT NOT NULL,
    "siklik" TEXT NOT NULL,
    "saat" TEXT NOT NULL,
    "gun" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "sonCalisma" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRequest" (
    "id" TEXT NOT NULL,
    "talepEdenId" TEXT NOT NULL,
    "istekMetni" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "olusturulanTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTemplate_olusturanId_idx" ON "ReportTemplate"("olusturanId");

-- CreateIndex
CREATE INDEX "ReportAccess_reportTemplateId_idx" ON "ReportAccess"("reportTemplateId");

-- CreateIndex
CREATE INDEX "ReportAccess_userId_idx" ON "ReportAccess"("userId");

-- CreateIndex
CREATE INDEX "ReportSchedule_reportTemplateId_idx" ON "ReportSchedule"("reportTemplateId");

-- CreateIndex
CREATE INDEX "ReportRequest_talepEdenId_idx" ON "ReportRequest"("talepEdenId");

-- AddForeignKey
ALTER TABLE "ReportAccess" ADD CONSTRAINT "ReportAccess_reportTemplateId_fkey" FOREIGN KEY ("reportTemplateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_reportTemplateId_fkey" FOREIGN KEY ("reportTemplateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
