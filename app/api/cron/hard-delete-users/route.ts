import { NextRequest, NextResponse } from "next/server";
import { hardDeleteExpiredAccounts } from "@/lib/gdpr-hard-delete";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GDPR: permanently remove users past `accountDeletionRequestedAt` + grace days.
 *
 * Auth: [lib/cron-auth.ts](lib/cron-auth.ts)
 * Env: `GDPR_HARD_DELETE_GRACE_DAYS` (default 30)
 *
 * Example: daily `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/hard-delete-users`
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await hardDeleteExpiredAccounts();

  logger.info(
    {
      scope: "cron.hard-delete-users",
      count: result.deletedIds.length,
      graceDays: result.graceDays,
      cutoff: result.cutoffIso,
    },
    "gdpr hard delete",
  );

  return NextResponse.json({
    ok: true,
    deletedCount: result.deletedIds.length,
    graceDays: result.graceDays,
    cutoff: result.cutoffIso,
    timestamp: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
