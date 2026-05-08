-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "cloudPrintAllowedIp" TEXT;

-- CreateIndex (multi-tenant printer IDs must be globally unique when set)
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_cloudPrintDeviceId_key" ON "restaurants"("cloudPrintDeviceId");
