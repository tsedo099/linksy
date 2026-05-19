import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { markOnline, PRESENCE_TTL_SECONDS } from "@/lib/presence";
import { publishPresenceEvent } from "@/lib/presence-bus";

export const runtime = "nodejs";

/**
 * POST /api/presence/heartbeat — bumps the caller's online TTL.
 *
 * Connected clients ping every 30s while focused. The server only publishes
 * an `online` event when this is the *first* heartbeat in a window (key was
 * absent), so subscribers don't get spammed with duplicate transitions.
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { wasOffline } = await markOnline(me.userId);
  if (wasOffline) publishPresenceEvent(me.userId, true);

  return NextResponse.json({
    ok: true,
    online: true,
    ttlSeconds: PRESENCE_TTL_SECONDS,
  });
}
