ALTER TABLE "User" ADD COLUMN "pinnedPostId" TEXT;

CREATE UNIQUE INDEX "User_pinnedPostId_key" ON "User"("pinnedPostId");

ALTER TABLE "Post" DROP CONSTRAINT "Post_authorId_fkey";

ALTER TABLE "Post"
  ADD CONSTRAINT "Post_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_pinnedPostId_fkey"
  FOREIGN KEY ("pinnedPostId") REFERENCES "Post"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
