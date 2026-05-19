-- AlterEnum (PostgreSQL: one statement per new value)
ALTER TYPE "NotificationType" ADD VALUE 'post_mention';
ALTER TYPE "NotificationType" ADD VALUE 'story_mention';
ALTER TYPE "NotificationType" ADD VALUE 'message_request';
ALTER TYPE "NotificationType" ADD VALUE 'story_expiring';
ALTER TYPE "NotificationType" ADD VALUE 'friend_joined';

-- Backfill legacy mention rows
UPDATE "Notification"
SET "type" = 'post_mention'
WHERE "type" = 'mention' AND "postId" IS NOT NULL;

UPDATE "Notification"
SET "type" = 'story_mention'
WHERE "type" = 'mention' AND "postId" IS NULL;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN "expiryReminderSentAt" TIMESTAMP(3);

ALTER TABLE "Notification" ADD COLUMN "storyId" TEXT;

-- CreateTable
CREATE TABLE "ContactHash" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactHash_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactHash_ownerUserId_identifierHash_key" ON "ContactHash"("ownerUserId", "identifierHash");

CREATE INDEX "ContactHash_identifierHash_idx" ON "ContactHash"("identifierHash");

ALTER TABLE "ContactHash" ADD CONSTRAINT "ContactHash_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
