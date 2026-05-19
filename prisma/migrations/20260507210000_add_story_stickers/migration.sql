-- Story stickers: location text and music track metadata.
-- Mentions reuse the existing `Mention` table (already has a `storyId` column).

ALTER TABLE "Story" ADD COLUMN "location" TEXT;
ALTER TABLE "Story" ADD COLUMN "musicTrack" JSONB;
