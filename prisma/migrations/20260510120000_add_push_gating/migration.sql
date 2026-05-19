-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('WEB_PUSH', 'FCM', 'APNS');

-- AlterTable PushSubscription: add native platform support
ALTER TABLE "PushSubscription"
  ADD COLUMN "platform" "PushPlatform" NOT NULL DEFAULT 'WEB_PUSH',
  ADD COLUMN "deviceToken" TEXT;

-- Web Push columns become nullable (NULL when platform != WEB_PUSH)
ALTER TABLE "PushSubscription"
  ALTER COLUMN "endpoint" DROP NOT NULL,
  ALTER COLUMN "p256dh" DROP NOT NULL,
  ALTER COLUMN "auth" DROP NOT NULL;

-- Dedup native subscriptions per (userId, platform, deviceToken). Existing
-- (userId, endpoint) unique stays for Web Push rows; nulls are distinct in PG
-- so non-WEB_PUSH rows do not collide with each other.
CREATE UNIQUE INDEX "PushSubscription_userId_platform_deviceToken_key"
  ON "PushSubscription"("userId", "platform", "deviceToken");

CREATE INDEX "PushSubscription_userId_platform_idx"
  ON "PushSubscription"("userId", "platform");

-- AlterTable User: quiet hours preference
ALTER TABLE "User"
  ADD COLUMN "quietHoursStart" INTEGER,
  ADD COLUMN "quietHoursEnd" INTEGER,
  ADD COLUMN "quietHoursTimezone" TEXT;
