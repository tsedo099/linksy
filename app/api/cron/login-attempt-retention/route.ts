import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredLoginAttempts } from "@/lib/login-attempt-retention";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Purge old `LoginAttempt` rows (scheduled job).
 *
 * Auth: [lib/cron-auth.ts](lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET` or `?token=`
 *
 * Schedule example (daily 03:15 UTC, offset from audit-log-retention to spread DB load):
 *   15 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://your-app/api/cron/login-attempt-retention"
 *
 * Env: `LOGIN_ATTEMPT_RETENTION_DAYS` (default 90; `0` = disable purge),
 *      `LOGIN_ATTEMPT_RETENTION_BATCH` (default 5000).
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await purgeExpiredLoginAttempts();

  if (result.retentionDays == null) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "LOGIN_ATTEMPT_RETENTION_DAYS is 0 or invalid — retention purge disabled.",
      timestamp: new Date().toISOString(),
    });
  }

  logger.info(
    {
      scope: "cron.login-attempt-retention",
      deleted: result.deleted,
      batches: result.batches,
      retentionDays: result.retentionDays,
      cutoff: result.cutoffIso,
    },
    "login attempt retention purge",
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
