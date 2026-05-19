import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Purge old `CommentSafetyWarning` rows (scheduled job).
 *
 * Auth: [lib/cron-auth.ts](lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET` or `?token=`
 *
 * Schedule example (daily 04:00 UTC):
 *   0 4 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://your-app/api/cron/safety-warning-retention"
 *
 * Env: `SAFETY_WARNING_RETENTION_DAYS` (default 180; `0` disables purge).
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const days = Number.parseInt(process.env.SAFETY_WARNING_RETENTION_DAYS ?? "180", 10);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "SAFETY_WARNING_RETENTION_DAYS is 0 or invalid — purge disabled.",
      timestamp: new Date().toISOString(),
    });
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.commentSafetyWarning.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  logger.info(
    { scope: "cron.safety-warning-retention", deleted: count, retentionDays: days, cutoff: cutoff.toISOString() },
    "safety warning retention purge",
  );

  return NextResponse.json({
    ok: true,
    deleted: count,
    retentionDays: days,
    cutoff: cutoff.toISOString(),
    timestamp: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
