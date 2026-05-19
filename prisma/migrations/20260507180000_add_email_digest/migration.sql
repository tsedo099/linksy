-- CreateEnum
CREATE TYPE "EmailDigestCadence" AS ENUM ('OFF', 'DAILY', 'WEEKLY');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "emailDigest" "EmailDigestCadence" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "digestLastSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_emailDigest_digestLastSentAt_idx" ON "User"("emailDigest", "digestLastSentAt");
