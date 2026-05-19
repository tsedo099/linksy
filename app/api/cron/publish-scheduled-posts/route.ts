import { NextRequest, NextResponse } from "next/server";
import { publishDueScheduledPosts } from "@/lib/post-schedule";
import { grantXP } from "@/lib/services/xp.service";
import { logBackgroundError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron job that flips `Post.scheduledAt` from a past timestamp to NULL,
 * making the row appear in feed listings. Grants the deferred POST_CREATED
 * XP (the live POST handler skips XP for scheduled rows so we don't
 * double-count when the job runs).
 *
 * Auth via `Authorization: Bearer ${CRON_SECRET}` or `?token=`.
 */
function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;

  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && queryToken === expected) return true;

  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const published = await publishDueScheduledPosts(now);

  for (const row of published) {
    grantXP({ userId: row.authorId, action: "POST_CREATED", postId: row.id }).catch(
      logBackgroundError("xp.grant.POST_CREATED.scheduled"),
    );
  }

  return NextResponse.json({
    ok: true,
    published: published.length,
    timestamp: now.toISOString(),
    posts: published.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
    })),
  });
}

export const GET = handle;
export const POST = handle;
