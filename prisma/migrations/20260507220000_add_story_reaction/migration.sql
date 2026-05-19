-- Story reactions: one emoji per (user, story).

CREATE TABLE "StoryReaction" (
  "userId"    TEXT      NOT NULL,
  "storyId"   TEXT      NOT NULL,
  "emoji"     TEXT      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoryReaction_pkey" PRIMARY KEY ("userId", "storyId")
);

CREATE INDEX "StoryReaction_storyId_idx" ON "StoryReaction"("storyId");

ALTER TABLE "StoryReaction"
  ADD CONSTRAINT "StoryReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryReaction"
  ADD CONSTRAINT "StoryReaction_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
