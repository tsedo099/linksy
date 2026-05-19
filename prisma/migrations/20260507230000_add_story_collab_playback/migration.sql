-- Story collaborators + playback mode (NORMAL / LOOP / BOOMERANG).

ALTER TABLE "Story" ADD COLUMN "playbackMode" TEXT NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "StoryCollaborator" (
  "storyId"  TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "addedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryCollaborator_pkey" PRIMARY KEY ("storyId", "userId")
);

CREATE INDEX "StoryCollaborator_userId_idx" ON "StoryCollaborator"("userId");

ALTER TABLE "StoryCollaborator"
  ADD CONSTRAINT "StoryCollaborator_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryCollaborator"
  ADD CONSTRAINT "StoryCollaborator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
