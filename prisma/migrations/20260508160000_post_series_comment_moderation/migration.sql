-- CreateEnum
CREATE TYPE "CommentModerationStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- AlterTable Comment
ALTER TABLE "Comment" ADD COLUMN "moderationStatus" "CommentModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateTable PostSeries
CREATE TABLE "PostSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostSeries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostSeries_userId_createdAt_idx" ON "PostSeries"("userId", "createdAt");

ALTER TABLE "PostSeries" ADD CONSTRAINT "PostSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Post
ALTER TABLE "Post" ADD COLUMN     "moderateComments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesPosition" INTEGER;

CREATE INDEX "Post_seriesId_seriesPosition_idx" ON "Post"("seriesId", "seriesPosition");

ALTER TABLE "Post" ADD CONSTRAINT "Post_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "PostSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
