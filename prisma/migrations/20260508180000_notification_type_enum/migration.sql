-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'like',
  'comment',
  'follow',
  'mention',
  'story',
  'message',
  'story_reaction',
  'story_collab'
);

-- Normalize any unknown legacy values before cast (defensive)
UPDATE "Notification"
SET "type" = 'story'
WHERE "type" IS NOT NULL
  AND "type" NOT IN (
    'like',
    'comment',
    'follow',
    'mention',
    'story',
    'message',
    'story_reaction',
    'story_collab'
  );

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::"NotificationType");
