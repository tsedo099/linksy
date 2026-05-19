import "server-only";

import { prisma } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_BATCH = 5000;
const MAX_BATCHES_PER_RUN = 2000;

/** Days of audit history to keep. Unset → 365. `0` or invalid → purge disabled. */
export function auditLogRetentionDays(): number | null {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(3650, Math.max(1, n));
}

function retentionBatchSize(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_BATCH?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_BATCH;
  if (!Number.isFinite(n)) return DEFAULT_BATCH;
  return Math.min(50_000, Math.max(100, n));
}

export type AuditLogPurgeResult = {
  deleted: number;
  batches: number;
  retentionDays: number | null;
  cutoffIso: string | null;
};

/**
 * Deletes `AuditLog` rows older than the retention window (batched, Postgres).
 */
export async function purgeExpiredAuditLogs(): Promise<AuditLogPurgeResult> {
  const retentionDays = auditLogRetentionDays();
  if (retentionDays == null) {
    return { deleted: 0, batches: 0, retentionDays: null, cutoffIso: null };
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const batchSize = retentionBatchSize();
  let deleted = 0;
  let batches = 0;

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const n = await prisma.$executeRaw`
      DELETE FROM "AuditLog"
      WHERE id IN (
        SELECT id FROM "AuditLog"
        WHERE "createdAt" < ${cutoff}
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
