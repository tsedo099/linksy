-- AlterTable
ALTER TABLE "Call" ADD COLUMN "recordingUrl" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingMimeType" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingDurationSec" INTEGER;
ALTER TABLE "Call" ADD COLUMN "recordedById" TEXT;
