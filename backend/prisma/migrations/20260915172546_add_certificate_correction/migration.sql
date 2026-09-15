-- AlterEnum
ALTER TYPE "CertificateStatus" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Certificate_userId_eventId_activityId_key";

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT,
ADD COLUMN     "correctionOfId" TEXT,
ADD COLUMN     "correctionReason" TEXT,
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "participantName" TEXT;

-- CreateIndex
CREATE INDEX "Certificate_userId_eventId_activityId_idx" ON "Certificate"("userId", "eventId", "activityId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
