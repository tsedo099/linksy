ALTER TABLE "User"
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "User_deactivatedAt_idx" ON "User"("deactivatedAt");
