import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredAuditLogs } from "@/lib/audit-log-retention";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Purge old `AuditLog` rows (scheduled job).
 *
 * Auth: [lib/cron-auth.ts](lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET` or `?token=`
 *
 * Schedule example (daily 03:00 UTC):
 *   0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://your-app/api/cron/audit-log-retention"
 *
 * Env: `AUDIT_LOG_RETENTION_DAYS` (default 365; `0` = disable purge),
 *      `AUDIT_LOG_RETENTION_BATCH` (default 5000).
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await purgeExpiredAuditLogs();

  if (result.retentionDays == null) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "AUDIT_LOG_RETENTION_DAYS is 0 or invalid — retention purge disabled.",
      timestamp: new Date().toISOString(),
    });
  }

  logger.info(
    {
      scope: "cron.audit-log-retention",
      deleted: result.deleted,
      batches: result.batches,
      retentionDays: result.retentionDays,
      cutoff: result.cutoffIso,
    },
    "audit log retention purge",
  );

  return NextResponse.json({
    ok: true,
    deleted: result.deleted,
    batches: result.batches,
    retentionDays: result.retentionDays,
    cutoff: result.cutoffIso,
    timestamp: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
