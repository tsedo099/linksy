-- Post composer toggles (allow comments / hide like counts from others)
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "allowComments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "hideLikes" BOOLEAN NOT NULL DEFAULT false;

-- Multi-pin profile: composite primary key on PinnedPost (Instagram-style, max 3 enforced in app)
DO $$
BEGIN
  IF to_regclass('public."PinnedPost"') IS NULL THEN
    CREATE TABLE "PinnedPost" (
        "userId" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "position" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "PinnedPost_pkey" PRIMARY KEY ("userId", "postId")
    );
    ALTER TABLE "PinnedPost" ADD CONSTRAINT "PinnedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "PinnedPost" ADD CONSTRAINT "PinnedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    CREATE INDEX "PinnedPost_userId_position_idx" ON "PinnedPost"("userId", "position");
  ELSE
    ALTER TABLE "PinnedPost" DROP CONSTRAINT IF EXISTS "PinnedPost_pkey";
    ALTER TABLE "PinnedPost" ADD CONSTRAINT "PinnedPost_pkey" PRIMARY KEY ("userId", "postId");
    CREATE INDEX IF NOT EXISTS "PinnedPost_userId_position_idx" ON "PinnedPost"("userId", "position");
  END IF;
END $$;

-- Copy legacy single highlight into PinnedPost when missing
INSERT INTO "PinnedPost" ("userId", "postId", "position")
SELECT u."id", u."pinnedPostId", 0
FROM "User" u
WHERE u."pinnedPostId" IS NOT NULL
ON CONFLICT ("userId", "postId") DO NOTHING;
