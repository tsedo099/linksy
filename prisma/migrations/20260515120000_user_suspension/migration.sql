-- Admin-applied account suspension fields. When `suspendedUntil` is in the
-- future, `lib/auth.ts:getUser` returns null so authenticated routes treat
-- the user as signed-out. Existing rows get NULL → no behaviour change.

ALTER TABLE "User"
  ADD COLUMN "suspendedUntil" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT,
  ADD COLUMN "suspendedByUserId" TEXT;

-- Index for the "list currently-suspended users" admin query. Partial index
-- so it stays tiny (only rows with a non-null `suspendedUntil` get counted).
CREATE INDEX "User_suspendedUntil_idx"
  ON "User" ("suspendedUntil")
  WHERE "suspendedUntil" IS NOT NULL;
