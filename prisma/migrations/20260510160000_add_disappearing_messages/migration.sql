-- CreateEnum
CREATE TYPE "DisappearingMode" AS ENUM ('OFF', 'TIMED', 'AFTER_READ');

-- AlterTable Conversation: per-conversation default policy
ALTER TABLE "Conversation"
  ADD COLUMN "disappearingMode" "DisappearingMode" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "disappearingSeconds" INTEGER;

-- AlterTable Message: per-message expiry snapshot
ALTER TABLE "Message"
  ADD COLUMN "expirePolicy" "DisappearingMode",
  ADD COLUMN "expireAfterSeconds" INTEGER,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex used by the cleanup cron + read-time filter
CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");
