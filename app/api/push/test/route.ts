import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { prisma } from "@/lib/prisma";

/**
 * Self-test endpoint. POST → sends a push notification to the current
 * user so they can verify the end-to-end flow without needing a second
 * account/device.
 *
 * Returns a JSON diagnostic so it's easy to see if the subscription
 * row exists, if VAPID is configured, and if the dispatch succeeded.
 */
export async function POST() {
  const me = await requireUser();
  if (me instanceof NextResponse) return me;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: me.userId },
    select: { id: true, platform: true, endpoint: true },
  });

  if (subs.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No push subscription saved for your account. Did Enable succeed?",
      subscriptionCount: 0,
    }, { status: 400 });
  }

  try {
    await sendPushToUser({
      userId: me.userId,
      kind: "message",
      title: "Linksy test push 🔔",
      body: "If you see this notification, push works end-to-end!",
      url: "/notifications",
      tag: "linksy-self-test",
    });
    return NextResponse.json({
      ok: true,
      subscriptionCount: subs.length,
      platforms: subs.map((s) => s.platform),
      note: "Check your system notification tray within 1-2 seconds.",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      subscriptionCount: subs.length,
    }, { status: 500 });
  }
}
