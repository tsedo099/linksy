-- Daily AI request counter per user. Tier-based quotas are enforced in
-- application code (lib/ai-quota.ts) — the DB is just the source of truth
-- for the running count.

CREATE TABLE "AiUsage" (
  "userId" TEXT NOT NULL,
  "day"    TEXT NOT NULL,
  "count"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "AiUsage_day_idx" ON "AiUsage"("day");

ALTER TABLE "AiUsage"
  ADD CONSTRAINT "AiUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
