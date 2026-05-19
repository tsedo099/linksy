import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { markOffline } from "@/lib/presence";
import { publishPresenceEvent } from "@/lib/presence-bus";

export const runtime = "nodejs";

/**
 * POST /api/presence/offline — explicit offline ping. Clients fire this via
 * `navigator.sendBeacon()` on `beforeunload` so the dot drops immediately
 * instead of waiting for the 90s TTL to expire.
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { wasOnline } = await markOffline(me.userId);
  if (wasOnline) publishPresenceEvent(me.userId, false);

  return NextResponse.json({ ok: true, online: false });
}
