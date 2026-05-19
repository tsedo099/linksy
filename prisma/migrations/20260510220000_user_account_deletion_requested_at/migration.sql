-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountDeletionRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_accountDeletionRequestedAt_idx" ON "User"("accountDeletionRequestedAt");
