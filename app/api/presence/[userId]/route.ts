import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getPresence } from "@/lib/presence";
import { areUsersBlocked } from "@/lib/user-blocks";

export const runtime = "nodejs";

/** GET /api/presence/[userId] — peer's current online state + lastSeenAt. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  // Don't leak presence info across blocks (Slack/Signal pattern).
  if (userId !== me.userId && (await areUsersBlocked(me.userId, userId))) {
    return NextResponse.json({ online: false, lastSeenAt: null });
  }

  const state = await getPresence(userId);
  return NextResponse.json({
    online: state.online,
    lastSeenAt: state.lastSeenAt?.toISOString() ?? null,
  });
}
