-- AlterTable
ALTER TABLE "MessageHistory" ADD COLUMN     "instanceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instanceId" TEXT;

-- AlterTable
ALTER TABLE "WhatsappInstance" ADD COLUMN     "metaPhoneNumberId" TEXT,
ADD COLUMN     "metaToken" TEXT,
ADD COLUMN     "metaVerifyToken" TEXT,
ADD COLUMN     "metaWabaId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'BAILEYS';

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHistory" ADD CONSTRAINT "MessageHistory_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
