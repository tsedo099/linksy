-- Grouped like/comment notifications (same post, unread, time window).
ALTER TABLE "Notification" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Notification" ADD COLUMN "groupPeerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
