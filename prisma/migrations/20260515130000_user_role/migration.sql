-- Platform role for admin/moderator access control. Replaces the env-only
-- `SAFETY_ADMIN_USER_IDS` allow-list with a DB-row source of truth.
-- `lib/admin-auth.ts:isSafetyAdmin` still falls back to the env so a fresh
-- deploy can bootstrap its first admin without an admin already existing.

CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE INDEX "User_role_idx" ON "User" ("role")
  WHERE "role" <> 'USER';

-- Hand-off note for the deploy runbook:
--
--   After applying this migration, promote whichever account should be the
--   bootstrap admin:
--
--     UPDATE "User" SET role = 'ADMIN'
--      WHERE id IN ('<id-from-SAFETY_ADMIN_USER_IDS>', ...);
--
--   Then the env var can be removed in a follow-up deploy (it stays as a
--   fallback in `lib/admin-auth.ts` until then).
