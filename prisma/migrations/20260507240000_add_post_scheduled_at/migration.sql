-- Scheduled posts: when not NULL, post is hidden from feeds until the cron
-- publisher (or a feed-time check) clears the field.

ALTER TABLE "Post" ADD COLUMN "scheduledAt" TIMESTAMP(3);

CREATE INDEX "Post_scheduledAt_idx" ON "Post"("scheduledAt");
