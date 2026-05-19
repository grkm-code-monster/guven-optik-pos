-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('READY', 'PRESCRIBED');

-- CreateEnum
CREATE TYPE "ProductGroup" AS ENUM ('UPPER', 'UPPER_MID', 'MID', 'LOWER', 'PROGRESSIVE_UPPER', 'PROGRESSIVE_UPPER_MID', 'PROGRESSIVE_MID', 'PROGRESSIVE_LOWER', 'OFFICE_LENS', 'SPECIAL_LENS', 'SINGLE_CUSTOM', 'SINGLE_NON_STOCK', 'SINGLE_STOCK', 'CONTACT_SPH', 'CONTACT_DAILY', 'CONTACT_TORIC', 'CONTACT_MULTIFOCAL', 'CONTACT_COLORED_RX');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('FRAME_LENS', 'CUSTOMER_FRAME');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('PENDING', 'ORDERED', 'IN_LAB', 'READY', 'DELIVERED', 'VOID');

-- CreateEnum
CREATE TYPE "PrescriptionType" AS ENUM ('SINGLE', 'PROGRESSIVE', 'BIFOCAL', 'SUNGLASSES', 'CONTACT_LENS');

-- CreateEnum
CREATE TYPE "PrescriptionSource" AS ENUM ('MANUAL', 'DOCTOR_RX', 'OLD_GLASSES');

-- AlterEnum
BEGIN;
CREATE TYPE "ProductCategory_new" AS ENUM ('SUNGLASSES_READY', 'OPTICAL_FRAME_READY', 'CONTACT_LENS_READY', 'SOLUTION', 'ACCESSORY', 'SUNGLASSES_RX', 'OPTICAL_FRAME_RX', 'LENS_RX', 'CONTACT_LENS_RX');
ALTER TABLE "Product" ALTER COLUMN "category" TYPE "ProductCategory_new" USING ("category"::text::"ProductCategory_new");
ALTER TYPE "ProductCategory" RENAME TO "ProductCategory_old";
ALTER TYPE "ProductCategory_new" RENAME TO "ProductCategory";
DROP TYPE "ProductCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "group" "ProductGroup",
ADD COLUMN     "model" TEXT,
ADD COLUMN     "productType" "ProductType" NOT NULL,
ADD COLUMN     "subCategory" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "linkType" "LinkType",
ADD COLUMN     "linkedItemId" TEXT,
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "qty" SET DEFAULT 1;

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "prescriptionType" "PrescriptionType" NOT NULL,
    "r_pd" DECIMAL(5,2),
    "r_sph" DECIMAL(5,2),
    "r_cyl" DECIMAL(5,2),
    "r_aks" INTEGER,
    "r_add" DECIMAL(5,2),
    "l_pd" DECIMAL(5,2),
    "l_sph" DECIMAL(5,2),
    "l_cyl" DECIMAL(5,2),
    "l_aks" INTEGER,
    "l_add" DECIMAL(5,2),
    "near_r_sph" DECIMAL(5,2),
    "near_l_sph" DECIMAL(5,2),
    "lens_r_sph" DECIMAL(5,2),
    "lens_r_cyl" DECIMAL(5,2),
    "lens_r_aks" INTEGER,
    "lens_r_bc" DECIMAL(5,2),
    "lens_r_dia" DECIMAL(5,2),
    "lens_r_add" DECIMAL(5,2),
    "lens_r_color" TEXT,
    "lens_r_brand" TEXT,
    "lens_l_sph" DECIMAL(5,2),
    "lens_l_cyl" DECIMAL(5,2),
    "lens_l_aks" INTEGER,
    "lens_l_bc" DECIMAL(5,2),
    "lens_l_dia" DECIMAL(5,2),
    "lens_l_add" DECIMAL(5,2),
    "lens_l_color" TEXT,
    "lens_l_brand" TEXT,
    "solution" TEXT,
    "solutionQty" INTEGER,
    "prescriptionSource" "PrescriptionSource" NOT NULL DEFAULT 'MANUAL',
    "doctorName" TEXT,
    "prescriptionDate" TIMESTAMP(3),
    "eReceteCode" TEXT,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frame" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,
    "barcode" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "h" DECIMAL(5,2),
    "cap" DECIMAL(5,2),
    "vertex" DECIMAL(5,2),
    "pantos" DECIMAL(5,2),
    "frameAngle" DECIMAL(5,2),

    CONSTRAINT "Frame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_saleItemId_key" ON "Prescription"("saleItemId");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Frame" ADD CONSTRAINT "Frame_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

