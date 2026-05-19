-- AlterTable
ALTER TABLE "User" ADD COLUMN "commentWarnings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "commentBanUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastCommentWarningAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommentSafetyWarning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentSafetyWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentSafetyWarning_userId_createdAt_idx" ON "CommentSafetyWarning"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommentSafetyWarning" ADD CONSTRAINT "CommentSafetyWarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
