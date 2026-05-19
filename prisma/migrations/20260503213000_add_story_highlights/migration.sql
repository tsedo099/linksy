CREATE TABLE "StoryHighlight" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "coverStoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoryHighlight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryHighlightItem" (
  "highlightId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryHighlightItem_pkey" PRIMARY KEY ("highlightId", "storyId")
);

CREATE INDEX "StoryHighlight_userId_createdAt_idx" ON "StoryHighlight"("userId", "createdAt");
CREATE INDEX "StoryHighlightItem_storyId_idx" ON "StoryHighlightItem"("storyId");

ALTER TABLE "StoryHighlight"
  ADD CONSTRAINT "StoryHighlight_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryHighlight"
  ADD CONSTRAINT "StoryHighlight_coverStoryId_fkey"
  FOREIGN KEY ("coverStoryId") REFERENCES "Story"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoryHighlightItem"
  ADD CONSTRAINT "StoryHighlightItem_highlightId_fkey"
  FOREIGN KEY ("highlightId") REFERENCES "StoryHighlight"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryHighlightItem"
  ADD CONSTRAINT "StoryHighlightItem_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
