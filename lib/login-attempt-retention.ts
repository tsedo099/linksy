import "server-only";

import { prisma } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH = 5000;
const MAX_BATCHES_PER_RUN = 2000;

/**
 * Days of `LoginAttempt` history to keep. Defaults to **90 days** — chosen to
 * cover the 60-day rolling window the security team uses for account-takeover
 * forensics plus a 30-day cushion for late investigations. Set
 * `LOGIN_ATTEMPT_RETENTION_DAYS=0` to disable the purge entirely (e.g. for a
 * staging cluster that wants the full table for QA).
 */
export function loginAttemptRetentionDays(): number | null {
  const raw = process.env.LOGIN_ATTEMPT_RETENTION_DAYS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(3650, Math.max(1, n));
}

function retentionBatchSize(): number {
  const raw = process.env.LOGIN_ATTEMPT_RETENTION_BATCH?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_BATCH;
  if (!Number.isFinite(n)) return DEFAULT_BATCH;
  return Math.min(50_000, Math.max(100, n));
}

export type LoginAttemptPurgeResult = {
  deleted: number;
  batches: number;
  retentionDays: number | null;
  cutoffIso: string | null;
};

/**
 * Deletes `LoginAttempt` rows older than the retention window. Postgres-specific
 * (uses `DELETE … WHERE id IN (SELECT … LIMIT n)` so each batch is a single
 * round-trip with bounded lock duration).
 *
 * Bounded by `MAX_BATCHES_PER_RUN` so a single cron invocation can't run away
 * if a giant backfill arrives — subsequent runs pick up the rest.
 */
export async function purgeExpiredLoginAttempts(): Promise<LoginAttemptPurgeResult> {
  const retentionDays = loginAttemptRetentionDays();
  if (retentionDays == null) {
    return { deleted: 0, batches: 0, retentionDays: null, cutoffIso: null };
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const batchSize = retentionBatchSize();
  let deleted = 0;
  let batches = 0;

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const n = await prisma.$executeRaw`
      DELETE FROM "LoginAttempt"
      WHERE id IN (
        SELECT id FROM "LoginAttempt"
        WHERE "attemptedAt" < ${cutoff}
        LIMIT ${batchSize}
      )
    `;
    if (n === 0) break;
    deleted += n;
    batches += 1;
  }

  return {
    deleted,
    batches,
    retentionDays,
    cutoffIso: cutoff.toISOString(),
  };
}
