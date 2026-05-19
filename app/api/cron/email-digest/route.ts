import { NextRequest, NextResponse } from "next/server";
import { listUsersDueForDigest, sendDigestForUser } from "@/lib/email-digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const userIds = await listUsersDueForDigest(now);
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const result = await sendDigestForUser(userId, origin);
      if (result.delivered) {
        delivered += 1;
      } else if (result.reason === "send-failed") {
        failed += 1;
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: userIds.length,
    delivered,
    skipped,
    failed,
    timestamp: now.toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
